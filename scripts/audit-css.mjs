#!/usr/bin/env node
/**
 * Finds CSS that ships without anything to style.
 *
 * Angular compiles every component's `styles` into the bundle and never
 * tree-shakes a selector out of it: a class left behind by a redesign is bytes
 * on every user's disk forever. This script reads the two global stylesheets
 * and every inline component stylesheet, extracts the class names they define,
 * and checks each one against the application source (not the tests).
 *
 * Two failure modes are reported separately:
 *
 * 1. **Dead CSS** — a class defined in a stylesheet and used nowhere in `src/`.
 *    The families in `DYNAMIC_FAMILIES` are exempt because they are built at
 *    runtime (`'l' + level`, `'state-' + status`, `'cadence ' + cadence`, the
 *    CDK's own `cdk-*` classes).
 * 2. **Test-only CSS** — a class used by Playwright or a unit test but nowhere
 *    in the application. That is worse than dead: a test hook has leaked into
 *    the production stylesheet. Tests should select real semantics (`role`,
 *    label, `data-testid`) or classes the app genuinely paints.
 *
 * Usage:
 *
 *   node scripts/audit-css.mjs          # report and fail on either
 *   node scripts/audit-css.mjs --warn   # report, exit 0
 *
 * `npm run css:audit` is the first form. The CI lint job runs it before the
 * build, so a stale selector fails the change that introduced it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WARN_ONLY = process.argv.includes('--warn');

/** Classes that only exist once the application runs. */
const DYNAMIC_FAMILIES = [
  /^cdk-/, // Angular CDK: drag preview, drop list, placeholder, animating.
  /^ng-/, // Angular's own structural classes and the editor wrapper.
  /^l[0-4]$/, // Analytics heatmap levels: `'l' + levelFor(date)`.
  /^state-/, // About page update state: `'state-' + updates.status()`.
  /^cadence-/, // Time by Task cadence modifiers.
  /^(daily|weekly|monthly|occasional|multi-day|one-off|untasked)$/, // TimeCadence.
  /^status-/, // Task status classes built from STATUS_CONFIG.
  /^priority-p[1-4]$/, // Priority modifiers built from PRIORITY_CONFIG.
  /^p[1-4]$/, // Task-board badge: `class="priority-badge p{{ task.priority }}"`.
  /^q[1-4]$/, // Quadrant modifiers.
];

/** Every `.ts`/`.html` file under a directory, in a stable order. */
function walk(dir, files = []) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const stats = statSync(path);
    if (stats.isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

const SRC = walk(join(ROOT, 'src'));
const TESTS = walk(join(ROOT, 'tests'));
const appFiles = SRC.filter((file) => /\.(ts|html)$/.test(file));
const testFiles = TESTS.filter((file) => /\.(ts|html)$/.test(file));

/** The class names a stylesheet defines, ignoring declaration blocks. */
function classesInStylesheet(css) {
  // Strip comments, then repeatedly remove the innermost `{...}` blocks. What
  // is left is selector and at-rule preludes only, so a class name inside a
  // `url()`, a custom property or a comment cannot be mistaken for a selector.
  let text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let previous = '';
  while (text !== previous) {
    previous = text;
    text = text.replace(/\{[^{}]*\}/g, '{}');
  }
  const classNames = new Set();
  for (const match of text.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1];
    // `::ng-deep` rules style the DOM of another component — the journal's
    // editor toolbar, the markdown preview. Its class names live in that
    // library's markup, not in this repository's templates, so they are not
    // dead just because this script cannot see them.
    if (selector.includes('::ng-deep')) continue;
    for (const token of selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)) classNames.add(token[1]);
  }
  return classNames;
}

/** A component file split into its stylesheet and everything else. */
function splitComponent(file) {
  const source = readFileSync(file, 'utf8');

  // Angular's two forms: `styles: [\`...\`]` and `styleUrl: './x.css'`.
  const inline = /styles\s*:\s*\[\s*`([\s\S]*?)`\s*,?\s*\]/g;
  const styleBlocks = [...source.matchAll(inline)].map((match) => match[1]);
  const withoutStyles = source.replace(inline, '');

  const url = /styleUrl\s*:\s*['"]([^'"]+)['"]/.exec(source);
  if (url) {
    const path = join(dirname(file), url[1]);
    try {
      styleBlocks.push(readFileSync(path, 'utf8'));
    } catch {
      // A missing file is Angular's error to report, not this script's.
    }
  }

  return { source, withoutStyles, styleBlocks };
}

/** A map of class name -> the stylesheet that defines it. */
const defined = new Map();
function define(className, origin) {
  if (!defined.has(className)) defined.set(className, origin);
}

for (const file of ['src/styles.css', 'src/app/app.css']) {
  const path = join(ROOT, file);
  for (const className of classesInStylesheet(readFileSync(path, 'utf8'))) {
    define(className, file);
  }
}

const componentText = new Map();
for (const file of appFiles.filter((path) => path.endsWith('.ts'))) {
  const { withoutStyles, styleBlocks } = splitComponent(file);
  componentText.set(file, withoutStyles);
  for (const css of styleBlocks) {
    for (const className of classesInStylesheet(css)) {
      define(className, relative(ROOT, file));
    }
  }
}
for (const file of appFiles.filter((path) => path.endsWith('.html'))) {
  componentText.set(file, readFileSync(file, 'utf8'));
}

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matcher = (className) => new RegExp(`(?<![\\w-])${escape(className)}(?![\\w-])`, 'g');
const countIn = (texts, className) => {
  const re = matcher(className);
  return texts.reduce((total, text) => total + (text.match(re) ?? []).length, 0);
};

const appTexts = [...componentText.values()];
const testTexts = testFiles.map((file) => readFileSync(file, 'utf8'));

const dynamic = (className) => DYNAMIC_FAMILIES.some((family) => family.test(className));

const dead = [];
const testOnly = [];
for (const [className, origin] of defined) {
  if (dynamic(className)) continue;
  const appUses = countIn(appTexts, className);
  if (appUses > 0) continue;
  const testUses = countIn(testTexts, className);
  if (testUses > 0) testOnly.push({ className, origin, testUses });
  else dead.push({ className, origin });
}

const report = [];
if (dead.length) {
  report.push(`Dead CSS: ${dead.length} class${dead.length === 1 ? '' : 'es'} defined but unused.`);
  for (const { className, origin } of dead.sort((a, b) => a.className.localeCompare(b.className))) {
    report.push(`  .${className}  (${origin})`);
  }
}
if (testOnly.length) {
  report.push(
    `\nTest-only CSS: ${testOnly.length} class${testOnly.length === 1 ? '' : 'es'} used only by tests.`,
  );
  report.push('  These must not be part of a production build: move the assertion to a real');
  report.push('  semantic hook (role, label, data-testid) or delete the selector.');
  for (const { className, origin, testUses } of testOnly.sort((a, b) =>
    a.className.localeCompare(b.className),
  )) {
    report.push(`  .${className}  (${origin}; ${testUses} test uses)`);
  }
}

if (!report.length) {
  const ignored = [...defined.keys()].filter(dynamic).length;
  console.log(
    `CSS audit clean: ${defined.size} classes checked, ${ignored} dynamic families skipped, ` +
      `${appFiles.length} application files and ${testFiles.length} test files scanned.`,
  );
  process.exit(0);
}

console.error(report.join('\n'));
console.error(
  `\n${WARN_ONLY ? 'Warning only' : 'Failing'}: remove the selectors above, or add a justified ` +
    'entry to DYNAMIC_FAMILIES in scripts/audit-css.mjs when the class really is built at runtime.',
);
process.exit(WARN_ONLY ? 0 : 1);
