#!/usr/bin/env node
/**
 * Checks the SEO and AdSense surface of the site before it is deployed.
 *
 * Every file this script reads is a promise made to a crawler or to an
 * advertising reviewer: that the domain has an ads.txt, that the sitemap lists
 * real files, that each static page has one title, one description, one
 * canonical URL and one h1, that its structured data parses, and that ad code
 * appears only where editorial content exists. None of that fails a build when
 * it goes missing on its own, which is why this check exists.
 *
 * It reads the source tree, not the built output, so it can run before a build.
 * The static pages are copied into `dist/` verbatim by the Angular assets glob.
 *
 * Usage:
 *
 *   node scripts/check-seo.mjs
 *   npm run check:seo
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The origin every canonical URL and sitemap entry must use. */
const ORIGIN = 'https://app.deepwork.rajatmalik.dev';

/** The AdSense account that owns the domain. Keep in step with ads.txt. */
const PUBLISHER_ID = 'pub-4991682021863699';

/** Google's certification authority ID for ads.txt. */
const ADS_TXT_CA = 'f08c47fec0942fa0';

/** Where the AdSense tag lives. It must not appear on app or policy pages. */
const ADS_SCRIPT = 'pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

/**
 * The static pages, in the order they matter. The six articles carry
 * advertising; the hub, and every trust page, deliberately do not. The hub is a
 * navigation index, and Google's inventory-value policy does not allow ads on
 * screens used for navigation.
 */
const PAGES = [
  'public/guides/index.html',
  'public/guides/pomodoro-technique.html',
  'public/guides/time-blocking.html',
  'public/guides/eisenhower-matrix.html',
  'public/guides/deep-work-routine.html',
  'public/guides/habit-streaks.html',
  'public/guides/focus-timer-without-account.html',
  'public/about-deepwork/index.html',
  'public/editorial-policy/index.html',
  'public/advertising-policy/index.html',
  'public/contact-us/index.html',
  'public/privacy-policy/index.html',
  'public/terms-of-use/index.html',
];

/** The six articles that are allowed — and expected — to load AdSense. */
const AD_PAGES = new Set([
  'public/guides/pomodoro-technique.html',
  'public/guides/time-blocking.html',
  'public/guides/eisenhower-matrix.html',
  'public/guides/deep-work-routine.html',
  'public/guides/habit-streaks.html',
  'public/guides/focus-timer-without-account.html',
]);

/** An ad page needs enough original text to justify a unit. */
const MIN_AD_PAGE_WORDS = 1000;

/** Visible words, used for the inventory-value check. */
function wordCount(html) {
  const text = stripComments(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/**
 * Application routes. They are served by the SPA (with a 404 status on GitHub
 * Pages), so an internal link to one is valid even though no file exists.
 */
const APP_ROUTES = new Set([
  '/',
  '/tasks',
  '/matrix',
  '/calendar',
  '/today',
  '/analytics',
  '/time',
  '/reminders',
  '/habits',
  '/journal',
  '/settings',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
]);

const problems = [];
const checks = [];

/** Record the result of one named check. */
function check(name, found) {
  checks.push({ name, found });
}

/** Add a problem once, with the file it belongs to. */
function fail(where, message) {
  problems.push(`${where}: ${message}`);
}

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function exists(relativePath) {
  return existsSync(join(ROOT, relativePath));
}

/** The URL a static file is published at. `/index.html` is its directory URL. */
function urlForFile(relativePath) {
  const path = relativePath.replace(/^public\//, '').replace(/index\.html$/, '');
  return `${ORIGIN}/${path}`;
}

/** The file a site path should resolve to, or null when it is an app route. */
function fileForPath(pathname) {
  if (APP_ROUTES.has(pathname)) return null;
  if (/^\/journal\/[^/]+$/.test(pathname)) return null;
  const clean = pathname.replace(/^\//, '');
  const relative = clean.endsWith('/') || clean === '' ? `${clean}index.html` : clean;
  return join('public', relative);
}

function stripComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

function textOf(html, pattern) {
  return pattern.exec(html)?.[1]?.trim() ?? '';
}

function jsonLdBlocks(html) {
  const blocks = [];
  const pattern = /<script\s+type="application\/ld\+json"\s*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html))) blocks.push(match[1]);
  return blocks;
}

/** Collect every `@type` in a parsed JSON-LD value, at any depth. */
function typesIn(value, found = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) typesIn(item, found);
  } else if (value && typeof value === 'object') {
    if (typeof value['@type'] === 'string') found.add(value['@type']);
    for (const item of Object.values(value)) typesIn(item, found);
  }
  return found;
}

// ── ads.txt ─────────────────────────────────────────────────────────────────

if (!exists('public/ads.txt')) {
  fail('public/ads.txt', 'is missing; AdSense cannot verify the publisher');
} else {
  const lines = read('public/ads.txt')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  const expected = `google.com, ${PUBLISHER_ID}, DIRECT, ${ADS_TXT_CA}`;
  const googleLines = lines.filter((line) => line.startsWith('google.com,'));

  if (googleLines.length !== 1) {
    fail('public/ads.txt', `should have exactly one google.com line, found ${googleLines.length}`);
  } else if (googleLines[0] !== expected) {
    fail('public/ads.txt', `google.com line is "${googleLines[0]}", expected "${expected}"`);
  }
  check('ads.txt names the AdSense publisher', googleLines.length === 1);
}

// ── sitemap.xml ─────────────────────────────────────────────────────────────

if (!exists('public/sitemap.xml')) {
  fail('public/sitemap.xml', 'is missing');
} else {
  const xml = read('public/sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());

  if (locs.length === 0) fail('public/sitemap.xml', 'lists no URLs');
  if (new Set(locs).size !== locs.length) fail('public/sitemap.xml', 'contains duplicate URLs');

  for (const loc of locs) {
    if (!loc.startsWith(`${ORIGIN}/`)) {
      fail('public/sitemap.xml', `URL is not on ${ORIGIN}: ${loc}`);
      continue;
    }
    const pathname = new URL(loc).pathname;
    if (pathname === '/') continue;
    const file = fileForPath(pathname);
    if (file && !exists(file)) fail('public/sitemap.xml', `${loc} has no file at ${file}`);
  }

  for (const page of PAGES) {
    const url = urlForFile(page);
    if (!locs.includes(url)) fail('public/sitemap.xml', `does not list ${url}`);
  }

  const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1]);
  if (lastmods.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    fail('public/sitemap.xml', 'has a lastmod that is not YYYY-MM-DD');
  }

  check('sitemap lists every static page and every file exists', locs.length > 0);
}

// ── robots.txt ──────────────────────────────────────────────────────────────

if (!exists('public/robots.txt')) {
  fail('public/robots.txt', 'is missing');
} else {
  const robots = read('public/robots.txt');

  if (!robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`)) {
    fail('public/robots.txt', 'does not point at the canonical sitemap');
  }
  for (const crawler of ['Mediapartners-Google', 'AdsBot-Google']) {
    if (!new RegExp(`User-agent:\\s*${crawler}\\b`, 'i').test(robots)) {
      fail('public/robots.txt', `does not name ${crawler}`);
    }
  }
  // A bare `Disallow: /` in any group is the one line that turns the whole
  // file into a site-wide block, which is never the intent here.
  if (/^\s*Disallow:\s*\/\s*$/im.test(robots)) {
    fail('public/robots.txt', 'blocks every crawler with "Disallow: /"');
  }
  check('robots.txt allows search and ad crawlers and names the sitemap', true);
}

// ── The application shell ───────────────────────────────────────────────────

if (!exists('src/index.html')) {
  fail('src/index.html', 'is missing');
} else {
  const shell = read('src/index.html');
  const head = stripComments(shell);

  if (!head.includes(`name="google-adsense-account" content="ca-${PUBLISHER_ID}"`)) {
    fail('src/index.html', 'has no google-adsense-account meta tag for site verification');
  }
  if (!/<meta\s+name="robots"\s+content="index, follow/i.test(head)) {
    fail('src/index.html', 'does not allow indexing');
  }
  if (!head.includes(`<link rel="canonical" href="${ORIGIN}/"`)) {
    fail('src/index.html', `has no canonical URL for ${ORIGIN}/`);
  }
  if (head.includes('adsbygoogle.js')) {
    fail('src/index.html', 'loads AdSense on the application; ads belong on the guides only');
  }
  if (!/<title>[^<]{15,70}<\/title>/.test(head)) {
    fail('src/index.html', 'title is missing or outside 15–70 characters');
  }
  check('application shell verifies AdSense without loading ads', true);
}

// ── Every static page ───────────────────────────────────────────────────────

const pageProblemsBefore = problems.length;

for (const page of PAGES) {
  if (!exists(page)) {
    fail(page, 'is missing');
    continue;
  }

  const html = read(page);
  const clean = stripComments(html);
  const isAdPage = AD_PAGES.has(page);

  const lang = /<html\s+lang="([^"]+)"/.exec(html)?.[1];
  if (lang !== 'en') fail(page, `html lang is "${lang ?? 'missing'}", expected "en"`);

  const title = textOf(clean, /<title>([\s\S]*?)<\/title>/);
  if (!title) fail(page, 'has no <title>');
  else if (title.length < 15 || title.length > 70) {
    fail(page, `title is ${title.length} characters; expected 15–70`);
  }

  const description = /<meta\s+name="description"\s+content="([^"]+)"/.exec(clean)?.[1] ?? '';
  if (!description) fail(page, 'has no meta description');
  else if (description.length < 80 || description.length > 180) {
    fail(page, `description is ${description.length} characters; expected 80–180`);
  }

  const canonical = /<link\s+rel="canonical"\s+href="([^"]+)"/.exec(clean)?.[1] ?? '';
  const expectedCanonical = urlForFile(page);
  if (!canonical) fail(page, 'has no canonical URL');
  else if (canonical !== expectedCanonical) {
    fail(page, `canonical is ${canonical}; expected ${expectedCanonical}`);
  }

  const robotsTag = /<meta\s+name="robots"\s+content="([^"]+)"/.exec(clean)?.[1] ?? '';
  if (/\bnoindex\b/i.test(robotsTag)) fail(page, 'is marked noindex');
  if (!/index/i.test(robotsTag)) fail(page, 'does not allow indexing');

  const h1Count = (clean.match(/<h1[\s>]/gi) ?? []).length;
  if (h1Count !== 1) fail(page, `has ${h1Count} h1 elements; expected exactly one`);

  if (!clean.includes(`name="google-adsense-account" content="ca-${PUBLISHER_ID}"`)) {
    fail(page, 'has no google-adsense-account meta tag');
  }

  const adScripts = clean.includes(ADS_SCRIPT);
  if (isAdPage && !adScripts) fail(page, 'is a guide but does not load AdSense');
  if (!isAdPage && adScripts) {
    fail(page, 'loads AdSense but is not an editorial page');
  }

  if (isAdPage) {
    const words = wordCount(html);
    if (words < MIN_AD_PAGE_WORDS) {
      fail(page, `has ${words} words on an ad page; ${MIN_AD_PAGE_WORDS} is the floor`);
    }
    if (/<iframe[\s>]/i.test(clean)) {
      fail(page, 'contains an iframe; ads may not be placed in framed content');
    }
    if (/http-equiv="refresh"/i.test(clean)) {
      fail(page, 'auto-refreshes; ads may not be shown on auto-refreshing pages');
    }
    const cta = /<div class="cta-band"[^>]*>([\s\S]*?)<\/div>/.exec(clean)?.[1] ?? '';
    if (cta.includes('adsbygoogle')) {
      fail(page, 'places an ad inside the call-to-action band');
    }
  }

  // Phrases that Google's invalid-traffic and ad-placement policies forbid.
  // They are matched case-insensitively so a stray rewrite cannot slip in.
  for (const phrase of [
    'click the ads',
    'click on the ads',
    'click our ads',
    'support us by clicking',
    'help keep this site running',
    'visit these links to support',
  ]) {
    if (clean.toLowerCase().includes(phrase)) {
      fail(page, `contains incentive language ("${phrase}")`);
    }
  }

  const blocks = jsonLdBlocks(html);
  if (blocks.length === 0) fail(page, 'has no JSON-LD structured data');

  const types = new Set();
  for (const block of blocks) {
    try {
      typesIn(JSON.parse(block), types);
    } catch (error) {
      fail(page, `has invalid JSON-LD: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (isAdPage && page !== 'public/guides/index.html') {
    for (const type of ['Article', 'BreadcrumbList', 'FAQPage']) {
      if (!types.has(type)) fail(page, `structured data has no ${type}`);
    }
  }
  if (page === 'public/guides/index.html' && !types.has('CollectionPage')) {
    fail(page, 'structured data has no CollectionPage');
  }

  // Internal, root-absolute links must point at a real static file or a known
  // app route. External links, mailto and in-page anchors are out of scope.
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const pathname = new URL(href, ORIGIN).pathname;
    const file = fileForPath(pathname);
    if (file && !exists(file)) fail(page, `links to ${href}, but ${file} does not exist`);
  }
}

if (problems.length === pageProblemsBefore) {
  check(`all ${PAGES.length} static pages carry complete metadata`, true);
}

// ── Internal linking and editorial requirements ─────────────────────────────

if (exists('public/guides/index.html')) {
  const hub = read('public/guides/index.html');
  for (const page of PAGES.filter((item) => item.startsWith('public/guides/'))) {
    if (page === 'public/guides/index.html') continue;
    const name = page.split('/').pop();
    if (!hub.includes(`/guides/${name}`))
      fail('public/guides/index.html', `does not link to ${name}`);
  }
  check('the guide hub links to every guide', true);
}

if (exists('public/privacy-policy/index.html')) {
  const privacy = read('public/privacy-policy/index.html');
  const lower = privacy.toLowerCase();

  // Google's "Required content" page names the disclosures an AdSense privacy
  // policy must contain. These are the phrases a reviewer looks for, not a
  // generic "we use cookies" paragraph.
  for (const required of [
    'third party vendors, including google, use cookies',
    "google's use of advertising cookies",
    'personalized advertising',
    'ads settings',
    'aboutads.info',
    'how google uses data',
    'web beacons',
    'ip addresses',
    'lgpd',
    'consent',
    'contact@rajatmalik.dev',
  ]) {
    if (!lower.includes(required)) {
      fail('public/privacy-policy/index.html', `does not contain "${required}"`);
    }
  }
  if (!privacy.includes('https://www.google.com/policies/privacy/partners/')) {
    fail('public/privacy-policy/index.html', 'does not link to "How Google uses data"');
  }
  check('the privacy policy contains the disclosures Google requires', true);
}

if (exists('public/advertising-policy/index.html')) {
  const policy = read('public/advertising-policy/index.html');
  const lower = policy.toLowerCase();
  for (const required of [
    'google publisher policies',
    'invalid clicks',
    'does not load ad code',
    'advertisement',
    'children',
    'user-generated content',
    'auto-refresh',
    'iframe',
    'ads.txt',
  ]) {
    if (!lower.includes(required)) {
      fail('public/advertising-policy/index.html', `does not mention "${required}"`);
    }
  }
  check('the advertising policy covers placement, traffic and content rules', true);
}

if (exists('public/guides/index.html')) {
  const hub = read('public/guides/index.html');
  if (hub.includes(ADS_SCRIPT)) {
    fail('public/guides/index.html', 'loads AdSense on the navigational guide index');
  }
  check('the guide index is ad-free because it is navigational', true);
}

if (exists('public/terms-of-use/index.html')) {
  const terms = read('public/terms-of-use/index.html');
  for (const required of ['MIT', 'advertising', 'contact@rajatmalik.dev']) {
    if (!terms.toLowerCase().includes(required.toLowerCase())) {
      fail('public/terms-of-use/index.html', `does not mention ${required}`);
    }
  }
  check('the terms cover the licence, advertising and contact', true);
}

if (exists('public/llms.txt')) {
  const llms = read('public/llms.txt');
  if (!llms.includes('/guides/')) fail('public/llms.txt', 'does not mention the guides');
  check('llms.txt points at the written guides', true);
}

// ── Response headers ────────────────────────────────────────────────────────

if (exists('public/_headers')) {
  const headers = read('public/_headers');
  if (!headers.includes('pagead2.googlesyndication.com')) {
    fail('public/_headers', 'CSP does not allow the AdSense script');
  }
  if (!headers.includes('googleads.g.doubleclick.net')) {
    fail('public/_headers', 'CSP does not allow AdSense frames');
  }
  check('CSP allows the AdSense origins', true);
}

// ── Report ──────────────────────────────────────────────────────────────────

for (const { name, found } of checks) {
  if (found) console.log(`✓ ${name}`);
}

if (problems.length > 0) {
  console.error('\nSEO / AdSense check failed:');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} found.`);
  process.exitCode = 1;
} else {
  console.log('\nEvery SEO and AdSense file is in place.');
}
