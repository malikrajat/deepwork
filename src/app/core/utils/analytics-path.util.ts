/**
 * What DeepWork files its pageviews under.
 *
 * GoatCounter has no idea which domain a pageview came from — `a.example.com/x`
 * and `b.example.com/x` are the same row to it — so an app that shares a site
 * with another app has to say which one it is in the path. DeepWork therefore
 * writes every page under `/deepwork`, which is what keeps it apart from
 * rajatmalik.dev in a dashboard that cannot tell them apart by hostname; see
 * <https://www.goatcounter.com/help/domains>.
 *
 * The router's URL is the right input rather than `location.pathname`, because
 * the deployed web build is served from `/deepwork/` on GitHub Pages: the router
 * strips that base already, so the same route produces the same row whether the
 * app is served from a subdirectory or from the root.
 */

import { GOATCOUNTER_PATH_PREFIX, GOATCOUNTER_TITLE_PREFIX } from '../constants/visitor.constants';
import type { GoatCounterPath } from '../models/visitor-stats.model';

/** The page names behind each route, for the dashboard's page titles. */
const PAGE_NAMES: Record<string, string> = {
  '': 'Dashboard',
  dashboard: 'Dashboard',
  today: 'Today',
  matrix: 'Matrix',
  calendar: 'Calendar',
  tasks: 'Tasks',
  analytics: 'Analytics',
  habits: 'Habits',
  journal: 'Journal',
  settings: 'Settings',
  about: 'About',
};

/** A router URL without its query and fragment: only the page matters here. */
function pathOnly(url: string): string {
  return url.split(/[?#]/)[0] ?? '';
}

/** `/` → `/deepwork/`, `/tasks` → `/deepwork/tasks`. Never `/deepwork/deepwork/…`. */
export function countedPath(routerUrl: string): string {
  const raw = pathOnly(routerUrl) || '/';
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;

  // Defensive, not decorative: the router's own URL never carries the base href,
  // but `location.pathname` on a GitHub Pages build does, and a caller that
  // passed that would otherwise file everything twice under the prefix.
  if (isCountedPath(withLeadingSlash)) {
    return withLeadingSlash === GOATCOUNTER_PATH_PREFIX
      ? `${GOATCOUNTER_PATH_PREFIX}/`
      : withLeadingSlash;
  }

  const trimmed = withLeadingSlash.replace(/\/+$/, '');
  return trimmed === '' ? `${GOATCOUNTER_PATH_PREFIX}/` : `${GOATCOUNTER_PATH_PREFIX}${trimmed}`;
}

/** `DeepWork — Settings`, which is what the GoatCounter dashboard will show. */
export function pageTitleFor(routerUrl: string): string {
  const head = pathOnly(routerUrl).split('/').filter(Boolean)[0] ?? '';
  // A route this list has never heard of still gets a name worth reading in the
  // dashboard, so a page added later is not filed as "DeepWork — DeepWork".
  const name = PAGE_NAMES[head] ?? (head ? titleCase(head) : 'DeepWork');
  return `${GOATCOUNTER_TITLE_PREFIX} — ${name}`;
}

/** `release-notes` → `Release notes`, for a route with no name of its own. */
function titleCase(segment: string): string {
  const words = segment.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Does this path belong to DeepWork's slice of the shared site? */
export function isCountedPath(path: string): boolean {
  return path === GOATCOUNTER_PATH_PREFIX || path.startsWith(`${GOATCOUNTER_PATH_PREFIX}/`);
}

/**
 * The path IDs DeepWork's pageviews are stored under.
 *
 * The API filters by path *ID*, not by name, so a scoped question ("how many
 * people read this app, not the other site on this account") starts by looking
 * the app's own paths up and handing their IDs to the rest of the queries.
 */
export function selectPathIds(paths: readonly GoatCounterPath[]): number[] {
  return paths.filter((entry) => isCountedPath(entry.path)).map((entry) => entry.id);
}

/** A path rendered for a reader: the `/deepwork` prefix is noise in the popup. */
export function displayPath(path: string): string {
  if (path === `${GOATCOUNTER_PATH_PREFIX}/`) return '/ (dashboard)';
  if (path === GOATCOUNTER_PATH_PREFIX) return '/ (dashboard)';
  if (path.startsWith(`${GOATCOUNTER_PATH_PREFIX}/`)) {
    return path.slice(GOATCOUNTER_PATH_PREFIX.length);
  }
  return path;
}
