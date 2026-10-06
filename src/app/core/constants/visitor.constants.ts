/**
 * Everything the web build needs in order to talk to GoatCounter.
 *
 * DeepWork has no server, so its visitor counter is somebody else's server:
 * GoatCounter, which the author already runs for <https://rajatmalik.dev/>. The
 * two share one site — GoatCounter does not record the domain a pageview
 * belongs to, only its path — so DeepWork writes every page under its own
 * `/deepwork` prefix. That single prefix is what keeps the two apps apart in a
 * dashboard that cannot tell them apart by hostname; see
 * <https://www.goatcounter.com/help/domains>.
 *
 * Nothing here is a secret. The API token the details popup needs is *not* in
 * this file, or anywhere else in the source: it is typed in by hand at runtime
 * and kept in this browser's `localStorage` (see `VisitorCounterService`).
 */

/** The GoatCounter site code: `rajatmalik` means rajatmalik.goatcounter.com. */
export const GOATCOUNTER_SITE_CODE = 'rajatmalik';

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

/**
 * The prefix every DeepWork pageview is filed under, and the path the visitor
 * counter reads for its own number.
 *
 * The dashboard route counts as `/deepwork/` rather than `/deepwork` so that
 * the app's own root is a real path in the list — the counter endpoint looks
 * paths up by exact name, and a leading-slash form is what the dashboard shows.
 */
export const GOATCOUNTER_PATH_PREFIX = '/deepwork';

/** The page title sent with each pageview, so the dashboard can name the page. */
export const GOATCOUNTER_TITLE_PREFIX = 'DeepWork';

/** This browser's API token. Kept out of the database on purpose: exports are shared. */
export const VISITOR_TOKEN_KEY = 'deepwork_goatcounter_token';

/**
 * The GoatCounter API token, when the app is built with one baked in.
 *
 * Paste it between the quotes to have the details popup work without anybody
 * having to paste one; leave it empty to ship without.
 *
 * **Read this before filling it in.** Whatever is written here is published:
 *
 * - The web build is served to anyone who opens the site, and this constant ends
 *   up in the JavaScript bundle. A token in a bundle is not a secret — anyone can
 *   read it in devtools and then ask GoatCounter the same questions this app
 *   asks.
 * - It is committed to the repository as well, where it stays in the history even
 *   after it is deleted from this file.
 * - A token is shown once, when it is created, and can be deleted at any time —
 *   <https://rajatmalik.goatcounter.com/user/api> is where both happen. Deleting
 *   it there is the fix if one written here ever needs withdrawing; the app then
 *   falls back to the popup's own field, which keeps its token in the browser.
 *
 * Give it **Read statistics** and nothing else. With only that permission the
 * most a reader can do is read the same visitor numbers this popup exists to
 * show; with "update sites" or "export" it would be worth having.
 */
export const GOATCOUNTER_API_TOKEN = '1c695hmitnua1tky3tyuqkvf41m5zmxfxrgx26x4hca0oy546a';

/** Set to `'1'` when the user asks not to be counted at all. */
export const VISITOR_OPTOUT_KEY = 'deepwork_visit_counting_off';

/** How many times this browser has opened the web app, for the "this visit" list. */
export const VISITOR_VISITS_KEY = 'deepwork_web_visits';

/** How long a fetched public counter is reused before asking again. */
export const VISITOR_COUNTER_TTL_MS = 15 * 60 * 1000;

/**
 * The gap kept between API requests.
 *
 * GoatCounter allows four API requests a second, and the popup asks a dozen
 * questions in one go, so requests are queued rather than fired together: a
 * burst would be answered with 429s for five of them. 300 ms keeps the popup
 * inside three a second with room for the odd retry.
 */
export const GOATCOUNTER_API_GAP_MS = 300;

/** Pages of `/api/v0/paths` read when working out DeepWork's own path IDs (200 each). */
export const GOATCOUNTER_PATH_PAGES = 5;

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
 * Which slice of the site the popup reads.
 *
 * `site` exists because the two apps share one GoatCounter site: someone who
 * wants to know how the whole thing is doing can ask for it, and the toggle is
 * also the workaround if GoatCounter ever refuses to filter by path.
 */
export const VISITOR_SCOPES = [
  { key: 'deepwork', label: 'DeepWork only' },
  { key: 'site', label: 'Whole site' },
] as const;

export type VisitorScopeKey = (typeof VISITOR_SCOPES)[number]['key'];

/** The default scope: this app's own pages. */
export const VISITOR_DEFAULT_SCOPE: VisitorScopeKey = 'deepwork';

/**
 * The breakdowns asked for, in the order the popup shows them.
 *
 * Every one of these is a `/api/v0/stats/{page}` page — the same lists the
 * GoatCounter dashboard puts beside its graph. Each carries the one-line
 * footnote the popup prints at the foot of its card: a list of names and numbers
 * on its own does not say what it counted, and "how did they find this" is the
 * question the whole popup exists to answer.
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
  {
    key: 'languages',
    page: 'languages',
    label: 'Languages',
    note: 'The language the browser asked for, which is not always where the visitor is.',
  },
  {
    key: 'sizes',
    page: 'sizes',
    label: 'Screen widths',
    note: 'How wide the browser window was, in the bands GoatCounter records.',
  },
  {
    key: 'campaigns',
    page: 'campaigns',
    label: 'Campaigns',
    note: 'Visits that arrived on a link carrying utm_ parameters.',
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
 * Everything the popup asks for (`/stats/total`, `/stats/hits`, `/stats/{page}`,
 * `/paths`) is behind this permission, and nothing else is used: a token made
 * with only this ticked can read numbers and cannot change a single thing.
 */
export const GOATCOUNTER_STATS_PERMISSION = 64;

/**
 * Where the API token is made (`/user/api` on a GoatCounter site), and where the
 * raw numbers live. The token needs the "read statistics" permission and
 * nothing else — see `VisitorStatsService` for what each answer means.
 */
export const GOATCOUNTER_TOKENS_URL = `${GOATCOUNTER_ORIGIN}/user/api`;
export const GOATCOUNTER_DASHBOARD_URL = GOATCOUNTER_ORIGIN;
