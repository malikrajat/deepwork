#!/usr/bin/env node
/**
 * Checks the security headers the web build publishes, before and after
 * deployment.
 *
 * The headers themselves live in [`public/_headers`](../public/_headers), which
 * Cloudflare Pages reads from the root of the deployed output. Nothing in the
 * app fails when that file is deleted, renamed, or loses a line — the site keeps
 * working and the browser quietly stops protecting its visitors — so this check
 * exists to make the loss loud. It is also the one place that answers "are the
 * headers live?", which a browser alone cannot do quickly.
 *
 * Usage:
 *
 *   node scripts/check-headers.mjs                     # the file, and the build copy
 *   node scripts/check-headers.mjs --url <address>     # the deployed site as well
 *
 * `npm run check:headers` and `npm run check:headers -- --url https://…` are the
 * same two commands. The first form runs in CI after the build; the second is
 * for the five minutes after a deployment, or after changing a Pages setting.
 */
import { existsSync, readFileSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Where the headers are written, and where the build puts them. */
const SOURCE = join(ROOT, 'public', '_headers');
const BUILT = join(ROOT, 'dist', 'deepwork', 'browser', '_headers');

/**
 * The shortest HSTS lifetime worth having. A year is the usual recommendation,
 * and anything shorter than the 18 weeks a browser keeps a cached entry is
 * mostly decoration.
 */
const MIN_HSTS_MAX_AGE = 31_536_000;

/**
 * What every response must carry, and how each value is judged.
 *
 * The checks are narrow on purpose: they ask whether the header is there and
 * whether it says the safe thing, not whether it matches one exact string. A
 * deployment may legitimately gain another allowed origin — a new analytics
 * vendor, a moved captcha host — without the check arguing with it.
 */
const REQUIRED = [
  {
    name: 'strict-transport-security',
    label: 'Strict-Transport-Security',
    check(value) {
      const maxAge = /max-age=(\d+)/i.exec(value)?.[1];
      if (!maxAge) return 'has no max-age';
      if (Number(maxAge) < MIN_HSTS_MAX_AGE) {
        return `max-age is ${maxAge}; it should be at least ${MIN_HSTS_MAX_AGE}`;
      }
      return null;
    },
  },
  {
    name: 'content-security-policy',
    label: 'Content-Security-Policy',
    check(value) {
      const directives = new Map(
        value
          .split(';')
          .map((part) => part.trim().split(/\s+/))
          .filter(([name]) => !!name)
          .map(([name, ...sources]) => [name.toLowerCase(), sources]),
      );

      for (const required of ['default-src', 'script-src', 'object-src', 'frame-ancestors']) {
        if (!directives.has(required)) return `has no ${required}`;
      }
      if (!directives.get('object-src').includes("'none'")) {
        return "object-src is not 'none'";
      }
      if (value.includes("'unsafe-eval'")) return "allows 'unsafe-eval'";

      // A bare `*` in any source list is the one entry that turns the allowlist
      // back into "anything", which is the failure this file exists to prevent.
      for (const [name, sources] of directives) {
        if (sources.includes('*')) return `${name} allows every origin (*)`;
      }
      return null;
    },
  },
  {
    name: 'x-frame-options',
    label: 'X-Frame-Options',
    check(value) {
      return /^(sameorigin|deny)$/i.test(value.trim()) ? null : `is "${value}"`;
    },
  },
  {
    name: 'permissions-policy',
    label: 'Permissions-Policy',
    check(value) {
      // These three have no use in this app, so each must be switched off for
      // every origin rather than inherited from the browser's default.
      for (const feature of ['camera', 'microphone', 'geolocation']) {
        if (!new RegExp(`(^|,)\\s*${feature}\\s*=\\s*\\(\\s*\\)`).test(value)) {
          return `does not disable ${feature}`;
        }
      }
      return null;
    },
  },
];

/**
 * The rules in a `_headers` file: a path pattern, then the headers under it.
 *
 * The format is Cloudflare Pages' own: a line that is not indented starts a new
 * rule, and each indented `Name: value` line belongs to it. `#` lines are
 * comments, and blank lines are ignored.
 */
function parseHeadersFile(text) {
  const rules = [];
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;

    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: new Map() };
      rules.push(current);
      continue;
    }

    if (!current) throw new Error(`a header is indented above any rule: "${line.trim()}"`);
    const colon = line.indexOf(':');
    if (colon === -1) throw new Error(`a header line has no colon: "${line.trim()}"`);
    current.headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }

  return rules;
}

/**
 * Every rule that applies to every response, and the problems found in it.
 *
 * Only the catch-all rule is judged. A per-path addition is allowed to repeat a
 * header with a stricter value; it cannot be allowed to weaken the four below,
 * because nothing stops the more specific rule from being dropped later.
 */
function inspect(text) {
  const rules = parseHeadersFile(text);
  const all = rules.find((rule) => rule.pattern === '/*');
  if (!all) return { problems: ['there is no /* rule, so no header is applied site-wide'] };

  const problems = [];
  for (const { name, label, check } of REQUIRED) {
    if (!all.headers.has(name)) {
      problems.push(`${label} is missing`);
      continue;
    }
    const reason = check(all.headers.get(name));
    if (reason) problems.push(`${label} ${reason}`);
  }
  return { problems };
}

/** Print one checked thing and what came of it. */
function report(what, problems) {
  if (problems.length === 0) {
    console.log(`✓ ${what}`);
    return true;
  }
  console.error(`✗ ${what}`);
  for (const problem of problems) console.error(`    ${problem}`);
  return false;
}

/**
 * Read one URL's response headers, following up to five redirects.
 *
 * `node:https` rather than `fetch`: the global fetch keeps a socket pool alive
 * for a few seconds after the response, and this script ends with an exit code.
 * On Windows, exiting while that pool is still closing trips an assertion inside
 * libuv — an exit status that says nothing about the headers. A one-shot request
 * with `agent: false` closes its socket with the response.
 */
function readHeaders(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https:') ? httpsGet : httpGet;
    const request = get(
      url,
      { agent: false, headers: { 'user-agent': 'deepwork-check-headers' } },
      (response) => {
        const location = response.headers.location;
        if (response.statusCode >= 300 && response.statusCode < 400 && location && redirects < 5) {
          response.resume();
          resolve(readHeaders(new URL(location, url).href, redirects + 1));
          return;
        }
        response.resume();
        resolve({ status: response.statusCode, headers: response.headers });
      },
    );

    request.setTimeout(15_000, () => request.destroy(new Error('the request timed out')));
    request.on('error', reject);
  });
}

let healthy = true;

if (!existsSync(SOURCE)) {
  console.error(`✗ ${SOURCE} does not exist — the site would be published without its headers.`);
  process.exit(1);
}

const sourceText = readFileSync(SOURCE, 'utf8');
healthy = report('public/_headers', inspect(sourceText).problems) && healthy;

// The build copies `public/` verbatim, so a stale or missing copy means the
// deployed artefact is not the one this file describes. No build present is
// fine — `npm run check:headers` is allowed to run before one exists.
if (existsSync(BUILT)) {
  const builtText = readFileSync(BUILT, 'utf8');
  const problems = builtText === sourceText ? [] : ['differs from public/_headers'];
  healthy = report('dist/deepwork/browser/_headers', problems) && healthy;
} else if (existsSync(join(ROOT, 'dist', 'deepwork', 'browser', 'index.html'))) {
  healthy =
    report('dist/deepwork/browser/_headers', ['is missing from a build that exists']) && healthy;
}

const urlFlag = process.argv.indexOf('--url');
const url =
  urlFlag !== -1
    ? process.argv[urlFlag + 1]
    : process.argv.find((arg) => arg.startsWith('--url='))?.slice(6);

if (url) {
  let response;
  try {
    response = await readHeaders(url);
  } catch (cause) {
    console.error(`✗ ${url}`);
    console.error(`    could not be fetched: ${cause instanceof Error ? cause.message : cause}`);
    process.exit(1);
  }

  const problems = [];
  for (const { name, label, check } of REQUIRED) {
    const header = response.headers[name];
    const value = Array.isArray(header) ? header.join(', ') : header;
    if (!value) {
      problems.push(`${label} is missing`);
      continue;
    }
    const reason = check(value);
    if (reason) problems.push(`${label} ${reason}`);
  }

  // A cache in front of the site can answer with the previous deployment's
  // headers, which is worth naming rather than mistaking for a configuration
  // mistake.
  const cache = response.headers['cf-cache-status'];
  const status = response.status;
  healthy =
    report(`${url} (HTTP ${status}${cache ? `, cf-cache-status: ${cache}` : ''})`, problems) &&
    healthy;
}

if (!healthy) {
  console.error('\nThe web build would ship without the headers its visitors are promised.');
  process.exitCode = 1;
} else {
  console.log('\nEvery security header is in place.');
}
