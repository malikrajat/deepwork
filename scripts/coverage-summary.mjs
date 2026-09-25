#!/usr/bin/env node
/**
 * Prints the coverage numbers, and how far they are from the 90% goal.
 *
 * The *enforced* numbers live in `vitest.config.ts` (the ratchet floor plus the
 * 90% bar on `src/app/core/utils`); this script is the visible part: it writes a
 * table into the GitHub Actions job summary and raises a warning annotation on
 * every run that is still below the goal, so the distance to 90% is never a
 * number somebody has to go looking for.
 *
 * Usage: `npm run test:coverage && npm run coverage:summary`
 */

import { existsSync, readFileSync } from 'node:fs';
import { appendFileSync } from 'node:fs';

/** The bar the project is aiming at. */
const GOAL = 90;

const SUMMARY_FILE = 'coverage/coverage-summary.json';
const METRICS = ['statements', 'branches', 'functions', 'lines'];

if (!existsSync(SUMMARY_FILE)) {
  console.log(`No ${SUMMARY_FILE} — run \`npm run test:coverage\` first.`);
  process.exit(0);
}

const { total } = JSON.parse(readFileSync(SUMMARY_FILE, 'utf8'));
const percent = (metric) => Number(total[metric].pct);
const missing = (metric) =>
  Math.max(0, Math.ceil((GOAL / 100) * total[metric].total) - total[metric].covered);

const lines = [
  '## Coverage',
  '',
  `| Metric | Now | ${GOAL}% goal | Still to cover |`,
  '| ------ | --- | ---------- | -------------- |',
  ...METRICS.map(
    (metric) =>
      `| ${metric[0].toUpperCase()}${metric.slice(1)} | ${percent(metric).toFixed(2)}% | ${GOAL}% | ${missing(metric)} ${metric} |`,
  ),
  '',
  `The gate itself is in \`vitest.config.ts\`: nothing may drop below the floor the suite`,
  `reaches today, and \`src/app/core/utils\` has to stay at ${GOAL}%. The pages and the`,
  `browser shell are covered by the Playwright suite instead — see the E2E job.`,
  '',
];

const report = lines.join('\n');
console.log(report);

if (process.env['GITHUB_STEP_SUMMARY']) {
  appendFileSync(process.env['GITHUB_STEP_SUMMARY'], `${report}\n`);
}

if (process.env['GITHUB_ACTIONS'] && percent('statements') < GOAL) {
  console.log(
    `::warning title=Coverage goal::Statements are ${percent('statements').toFixed(2)}% — ${missing(
      'statements',
    )} statements short of the ${GOAL}% goal.`,
  );
}
