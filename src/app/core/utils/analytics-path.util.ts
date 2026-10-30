/**
 * What DeepWork files its pageviews under.
 *
 * The app has its own GoatCounter site (`app-deepwork.goatcounter.com`), so it
 * owns every path on it. A pageview is filed under the route the router is on,
 * with no prefix and no filtering: `/` is the dashboard, `/tasks` is the task
 * list. GoatCounter records no domain, which is exactly why a dedicated site
 * matters — there is no second app here to tell DeepWork apart from.
 *
 * The router's URL is the right input rather than `location.pathname`, because
 * the address bar carries whatever base the app happens to be served from — the
 * router strips that base already, so the same route produces the same row
 * whether the app is served from the root of its own domain or from a
 * subdirectory.
 */

import { GOATCOUNTER_TITLE_PREFIX } from '../constants/visitor.constants';

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

/** `/` → `/`, `/tasks` → `/tasks`. Never a trailing slash, never a double prefix. */
export function countedPath(routerUrl: string): string {
  const raw = pathOnly(routerUrl) || '/';
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const trimmed = withLeadingSlash.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
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
