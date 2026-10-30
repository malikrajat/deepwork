/**
 * Everything the web build needs in order to talk to GoatCounter.
 *
 * DeepWork has no server, so its visitor counter is somebody else's server:
 * GoatCounter. The app has a site of its own — `app-deepwork.goatcounter.com` —
 * so every pageview in it belongs to DeepWork and the paths can stay exactly as
 * the router writes them (`/`, `/tasks`, `/settings`). Nothing needs a prefix and
 * nothing needs filtering: one site, one app.
 *
 * Nothing here is a secret. The API token is public by nature once it is in this
 * file — it is compiled into the bundle — so it should be a read-only token
 * (`Read statistics` and nothing else). A token pasted into the popup overrides
 * it on that machine; see `VisitorCounterService`.
 */

/** The GoatCounter site code: `app-deepwork` means app-deepwork.goatcounter.com. */
export const GOATCOUNTER_SITE_CODE = 'app-deepwork';

/** The site's origin — the dashboard, the counter endpoints and the API alike. */
export const GOATCOUNTER_ORIGIN = `https://${GOATCOUNTER_SITE_CODE}.goatcounter.com`;

/** Where pageviews are posted. `count.js` appends nothing to this. */
export const GOATCOUNTER_COUNT_ENDPOINT = `${GOATCOUNTER_ORIGIN}/count`;

/** The documented JSON API, used by the details popup. */
export const GOATCOUNTER_API_BASE = `${GOATCOUNTER_ORIGIN}/api/v0`;

/**
 * The script itself, pinned and integrity-checked.
 *
 * GoatCounter serves `count.js` forever-fresh and also publishes numbered
 * versions that never change, so that a page can verify what it loads. The
 * unversioned file would run whatever the CDN holds today; this one cannot
 * change without the hash below failing, and the browser refuses to run it if it
 * does. Bumping it is a deliberate act: take the new version and hash from
 * <https://www.goatcounter.com/help/countjs-versions>.
 */
export const GOATCOUNTER_SCRIPT_URL = 'https://gc.zgo.at/count.v5.js';
export const GOATCOUNTER_SCRIPT_INTEGRITY =
  'sha384-atnOLvQb9t+jTSipvd75X2yginT4PjVbqDdlJAmxMm+wYElFmeR6EmLP5bYeoRVQ';

/** The title sent with each pageview, so the dashboard can name the page. */
export const GOATCOUNTER_TITLE_PREFIX = 'DeepWork';

/** This browser's API token. Kept out of the database on purpose: exports are shared. */
export const VISITOR_TOKEN_KEY = 'deepwork_goatcounter_token';

/**
 * The GoatCounter API token the app ships with, so the details popup works
 * without anyone having to paste one.
 *
 * **Read this before replacing it.** Whatever is written here is published: the
 * web build is served to anyone who opens the site and this constant ends up in
 * the JavaScript bundle, where it can be read in devtools. Make the token at
 * <https://app-deepwork.goatcounter.com/user/api> with **Read statistics** and
 * nothing else — with only that permission the most a reader can do is read the
 * same numbers this popup exists to show.
 *
 * A token is shown once, when it is created, and can be deleted at any time;
 * deleting it is the fix if one written here ever needs withdrawing. The popup
 * then falls back to its own field, which keeps a token in this browser.
 */
export const GOATCOUNTER_API_TOKEN = '1c695hmitnua1tky3tyuqkvf41m5zmxfxrgx26x4hca0oy546a';

/** Where the API token is made (`/user/api` on a GoatCounter site). */
export const GOATCOUNTER_TOKENS_URL = `${GOATCOUNTER_ORIGIN}/user/api`;

/** Where the raw numbers live. */
export const GOATCOUNTER_DASHBOARD_URL = GOATCOUNTER_ORIGIN;

/** Set to `'1'` when the user asks not to be counted at all. */
export const VISITOR_OPTOUT_KEY = 'deepwork_visit_counting_off';

/** How many times this browser has opened the web app, for the "this visit" list. */
export const VISITOR_VISITS_KEY = 'deepwork_web_visits';

/** How long a fetched public counter is reused before asking again. */
export const VISITOR_COUNTER_TTL_MS = 15 * 60 * 1000;

/**
 * The gap kept between API requests.
 *
 * GoatCounter allows four API requests a second — and every authenticated call
 * costs a CORS preflight OPTIONS *plus* the GET, so one question is two requests
 * against that budget. A 300 ms gap looked safe and was not: a dozen questions
 * drew 429s on the preflight, which the browser reports as an opaque CORS
 * failure. One second keeps a batch at roughly two requests a second, which is
 * what the reference site's own panel measured as reliably clean.
 */
export const GOATCOUNTER_API_GAP_MS = 1000;

/**
 * How many rows a list in the details popup shows.
 *
 * Twenty, which is what GoatCounter's own dashboard shows and what the API
 * returns by default: long enough to be a real breakdown, short enough that the
 * popup is a report rather than a scroll.
 */
export const VISITOR_LIST_LIMIT = 20;

/** How many rows the API is asked for at once (its own maximum is 100). */
export const GOATCOUNTER_API_LIMIT = 100;

/** The date ranges the popup offers, in days back from now. */
export const VISITOR_RANGES = [
  { key: '1d', label: 'Last 24 hours', days: 1 },
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: '365d', label: 'Last 12 months', days: 365 },
] as const;

export type VisitorRangeKey = (typeof VISITOR_RANGES)[number]['key'];

/** The default range: a week, which is what GoatCounter's own dashboard opens on. */
export const VISITOR_DEFAULT_RANGE: VisitorRangeKey = '7d';

/**
 * The breakdowns asked for, in the order the popup shows them.
 *
 * Every one of these is a `/api/v0/stats/{page}` page — the same lists the
 * GoatCounter dashboard puts beside its graph. Each carries the one-line
 * footnote the popup prints at the foot of its card: a list of names and numbers
 * on its own does not say what it counted, and "how did they find this" is the
 * question the whole popup exists to answer.
 *
 * These four are the reference panel's set, plus the operating systems that sit
 * under "browsers & platforms" there. Every request costs a preflight and a GET
 * against a four-a-second limit, so the report stays to the lists a reader
 * actually acts on; the dashboard has the rest.
 */
export const VISITOR_STAT_SECTIONS = [
  {
    key: 'referrers',
    page: 'toprefs',
    label: 'Where visitors come from',
    note: 'Search engines, other sites, campaigns and the links people typed, as GoatCounter records them. “No referrer” is a bookmark, a typed address, or a link that hides where it came from.',
  },
  {
    key: 'locations',
    page: 'locations',
    label: 'Visitor locations',
    note: 'The country GoatCounter worked out from the request. It keeps no IP address of its own.',
  },
  {
    key: 'browsers',
    page: 'browsers',
    label: 'Browsers',
    note: 'The browser each visit came from, as it identifies itself.',
  },
  {
    key: 'systems',
    page: 'systems',
    label: 'Operating systems',
    note: 'The system behind the browser, including the Linux distribution where one can be named.',
  },
] as const;

/** The key of one breakdown: `referrers`, `browsers`, … */
export type VisitorSectionKey = (typeof VISITOR_STAT_SECTIONS)[number]['key'];

/**
 * The tiles across the top of the popup, in the order they are shown.
 *
 * Four numbers that answer four different questions, which is why each one says
 * in its own footnote what it counts: "total" and "unique" mean the same thing
 * to GoatCounter — one browser session — and the difference a reader cares about
 * is the *period*, not the noun.
 */
export const VISITOR_KPIS = [
  { key: 'allTime', label: 'Total visitors', note: 'everything GoatCounter has recorded' },
  { key: 'range', label: 'Unique visitors', note: 'the range below — sessions, not pageviews' },
  { key: 'today', label: 'Visitors today', note: 'since midnight, your time' },
  { key: 'month', label: 'Visitors this month', note: 'since the first of the month' },
] as const;

/** Which tile: `allTime`, `range`, `today` or `month`. */
export type VisitorKpiKey = (typeof VISITOR_KPIS)[number]['key'];

/**
 * What "all time" is asked for with.
 *
 * The API wants a start date and defaults it to a week back, so a date before
 * any site could exist is how "everything" is spelled.
 */
export const VISITOR_ALL_TIME_START = '2000-01-01T00:00:00.000Z';

/**
 * The API token's permission bits.
 *
 * These numbers are stored in GoatCounter's own database, so they are part of
 * its data model rather than of its documentation; the labels are the ones its
 * token screen shows. Only one of them is needed here.
 */
export const GOATCOUNTER_PERMISSION_FLAGS = [
  { flag: 2, label: 'Record pageviews' },
  { flag: 4, label: 'Export' },
  { flag: 8, label: 'Read sites' },
  { flag: 16, label: 'Create sites' },
  { flag: 32, label: 'Update sites' },
  { flag: 64, label: 'Read statistics' },
] as const;

/**
 * "Read statistics" — the one box to tick when making the token.
 *
 * Everything the popup asks for (`/stats/total`, `/stats/hits`, `/stats/{page}`)
 * is behind this permission, and nothing else is used: a token made with only
 * this ticked can read numbers and cannot change a single thing.
 */
export const GOATCOUNTER_STATS_PERMISSION = 64;
