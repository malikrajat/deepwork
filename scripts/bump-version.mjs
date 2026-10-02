#!/usr/bin/env node
/**
 * Moves DeepWork's version from one number to the next, in every file that
 * spells it out.
 *
 * The number is written down in more places than any one build system can see:
 * `package.json` and its lock are npm's, `tauri.conf.json` is Tauri's, the two
 * `src-tauri/Cargo.*` files are cargo's, `app-info.constants.ts` is what the
 * About page shows and what the update check compares against GitHub — and the
 * docs name the artefact files, which carry the number as well. Nothing reads
 * any of the others, so they only agree when someone makes them agree.
 *
 * Usage:
 *
 *   node scripts/bump-version.mjs 2.0.13   # set every file to 2.0.13
 *   node scripts/bump-version.mjs --check  # fail unless they all agree
 *
 * `npm run version:bump -- 2.0.13` and `npm run version:check` are the same
 * two commands. `CHANGELOG.md` is deliberately left alone: a changelog records
 * the versions of the past, and rewriting it would erase that history.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * A markdown file that names the current release's artefacts.
 *
 * Every version these files contain is the *current* one — a page that wanted
 * to talk about an older release would say so in words — so they are replaced
 * wholesale, and `read` reports each occurrence it found.
 */
function doc(file) {
  const versioned = /(?:DeepWork_|deep-work_|tag v)(\d+\.\d+\.\d+)/g;
  return {
    file,
    read: (src) => [...src.matchAll(versioned)].map((match) => match[1]),
    write: (src, from, to) => src.replaceAll(from, to),
  };
}

/**
 * Every file that writes the version down, with the smallest edit that moves
 * it.
 *
 * `read` returns the versions the file currently claims — a list, because the
 * two lock files and the docs claim it more than once — and `write` returns the
 * file with `from` replaced by `to`. The check fails unless everything every
 * file claims is the same number.
 */
const targets = [
  {
    file: 'package.json',
    read: (src) => [JSON.parse(src).version],
    write: (src, from, to) => src.replace(`"version": "${from}"`, `"version": "${to}"`),
  },
  {
    file: 'package-lock.json',
    // The root entry and `packages[""]`. Both lines are matched with their
    // indentation, so no dependency's own version can be caught by mistake.
    read: (src) => {
      const lock = JSON.parse(src);
      return [lock.version, lock.packages[''].version];
    },
    write: (src, from, to) =>
      src
        .replace(`\n  "version": "${from}",`, `\n  "version": "${to}",`)
        .replace(`\n      "version": "${from}",`, `\n      "version": "${to}",`),
  },
  {
    file: 'src-tauri/Cargo.toml',
    read: (src) => [src.match(/^version = "([^"]+)"/m)[1]],
    write: (src, from, to) => src.replace(`version = "${from}"`, `version = "${to}"`),
  },
  {
    file: 'src-tauri/Cargo.lock',
    // The crate's own package block, and only that one.
    read: (src) => [src.match(/name = "deepwork"\nversion = "([^"]+)"/)[1]],
    write: (src, from, to) =>
      src.replace(`name = "deepwork"\nversion = "${from}"`, `name = "deepwork"\nversion = "${to}"`),
  },
  {
    file: 'src-tauri/tauri.conf.json',
    read: (src) => [JSON.parse(src).version],
    write: (src, from, to) => src.replace(`"version": "${from}"`, `"version": "${to}"`),
  },
  {
    file: 'src/app/core/constants/app-info.constants.ts',
    read: (src) => [src.match(/APP_VERSION = '([^']+)'/)[1]],
    write: (src, from, to) => src.replace(`APP_VERSION = '${from}'`, `APP_VERSION = '${to}'`),
  },
  doc('README.md'),
  doc('SETUP.md'),
  doc('docs/code-signing.md'),
];

/** Every target with its file read off disk. */
function load() {
  return targets.map((target) => ({
    target,
    path: join(ROOT, target.file),
    source: readFileSync(join(ROOT, target.file), 'utf8'),
  }));
}

/** The one version every file agrees on, or null if they do not. */
function agreedVersion(files) {
  const claims = files.map(({ target, source }) => ({
    file: target.file,
    versions: [...new Set(target.read(source))],
  }));

  // One number, found in every file, is the only shape that passes: a file
  // that spells out the version twice has to spell out the same one twice.
  const found = new Set(claims.flatMap((claim) => claim.versions));
  if (found.size === 1 && claims.every((claim) => claim.versions.length === 1)) {
    return claims[0].versions[0];
  }

  console.error('The version is not the same everywhere:\n');
  for (const { file, versions } of claims) {
    console.error(`  ${file.padEnd(46)} ${versions.join(', ') || '(none found)'}`);
  }
  console.error('\nSettle on one number by hand, then run this again.');
  return null;
}

function check() {
  const files = load();
  const version = agreedVersion(files);
  if (version === null) return 1;

  console.log(`Every file agrees: ${version} (${files.length} files checked).`);
  return 0;
}

function bump(next) {
  if (!SEMVER.test(next)) {
    console.error(`"${next}" is not a version of the form major.minor.patch.`);
    return 1;
  }

  const files = load();
  const current = agreedVersion(files);
  if (current === null) return 1;

  if (current === next) {
    console.log(`Already at ${next} — nothing to do.`);
    return 0;
  }

  for (const { target, path, source } of files) {
    const updated = target.write(source, current, next);
    if (updated === source) {
      console.error(`  ✗ ${target.file} (no ${current} found to replace)`);
      return 1;
    }
    writeFileSync(path, updated);
    console.log(`  ✓ ${target.file}`);
  }

  console.log(`\n${current} → ${next}. Remember the changelog entry and the git tag.`);
  return 0;
}

const [, , argument] = process.argv;

if (argument === '--help' || argument === '-h') {
  console.log('Usage: node scripts/bump-version.mjs <major.minor.patch> | --check');
  process.exit(0);
}

process.exit(!argument || argument === '--check' ? check() : bump(argument));
