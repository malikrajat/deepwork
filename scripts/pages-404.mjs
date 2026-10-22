#!/usr/bin/env node
/**
 * Writes the built shell out a second time as `404.html` — the file GitHub Pages
 * serves for a URL it has no file for.
 *
 * The app is published at <https://app.deepwork.rajatmalik.dev/>, a domain root.
 * GitHub Pages has no rewrite rules, so `/tasks` is looked up as a file, there
 * is none, and the visitor gets GitHub's "File not found" page: the app works
 * while you click around inside it, and breaks the moment a route is refreshed,
 * bookmarked or opened from a shared link. The one thing the host will do about
 * a missing file is serve the site's own `404.html`, and it serves it **at the
 * address that was asked for** — so the Angular router still sees `/tasks` and
 * opens the Tasks page. Publishing the shell under that name is the whole fix,
 * and it is the same trade as an S3 website's `ErrorDocument` or a CloudFront
 * custom error response: the host serves the app, the app does the routing.
 *
 * Nothing in the app changes to make this work:
 *
 * - `build:github` passes `--base-href=/`, so the `<base href>` inside the
 *   copied file resolves every script, stylesheet, icon and the service worker
 *   against the domain root — correct both at `/` and at `/tasks`.
 * - `PathLocationStrategy` strips that root prefix off the address bar to decide
 *   the route, and the address bar is untouched by a 404 body.
 *
 * Two things worth knowing about the result:
 *
 * - GitHub Pages answers with the 404 **status** and the shell's body. The page
 *   renders normally; only a crawler would notice.
 * - The copy covers the whole Pages site, so a missing asset — a hashed chunk
 *   left behind by an older `index.html`, say — is answered with HTML rather
 *   than a 404. Every SPA on Pages makes that trade, and the service worker's
 *   cache-first assets are what keep it from mattering.
 *
 * Doing this here rather than as a `cp` in `.github/workflows/deploy.yml` keeps
 * the artifact identical whether it was built by CI or by hand, so a local
 * `npm run build:github` reproduces the deployed site exactly.
 *
 * Usage: `npm run build:github` (this runs at the end of it), or on its own
 * after that build has run: `node scripts/pages-404.mjs`.
 */

import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where the browser build lands.
 *
 * Kept in step by hand with `outputPath` in `angular.json` and the artifact path
 * in `.github/workflows/deploy.yml`; the existence check below turns a drift
 * into a failed pipeline rather than a site that 404s on every refresh.
 */
const BROWSER_OUTPUT = join('dist', 'deepwork', 'browser');

/** The shell, as the build wrote it. */
const INDEX_HTML = join(BROWSER_OUTPUT, 'index.html');

/** The name GitHub Pages looks for when the requested path is not a file. */
const NOT_FOUND_HTML = join(BROWSER_OUTPUT, '404.html');

if (!existsSync(INDEX_HTML)) {
  console.error(
    `No ${INDEX_HTML} to copy.\n` +
      `Run \`npm run build:github\` (which builds first), not this script on its own.`,
  );
  process.exit(1);
}

const html = readFileSync(INDEX_HTML, 'utf8');
const baseHref = /<base\s+href="([^"]*)"/.exec(html)?.[1];

/**
 * The deployed site is the custom domain root, not the `/deepwork/` project
 * sub-path. A non-root base href would make the shell look for its scripts under
 * `/deepwork/`, where the custom-domain deployment has no files — the failure
 * that made the site render a blank page at <https://app.deepwork.rajatmalik.dev/>.
 */
if (baseHref !== '/') {
  console.error(
    `The shell carries <base href="${baseHref ?? 'none'}">, but this build targets the domain root.\n` +
      `Build the Pages artifact with \`npm run build:github\`, which passes --base-href=/.`,
  );
  process.exit(1);
}

copyFileSync(INDEX_HTML, NOT_FOUND_HTML);
console.log(`Wrote ${NOT_FOUND_HTML} — the shell GitHub Pages serves for a deep link.`);
console.log(`  base href: ${baseHref}`);
