/**
 * The shapes GoatCounter's JSON API answers with, and the shapes the details
 * popup renders.
 *
 * The API half mirrors <https://www.goatcounter.com/api.html> and nothing more:
 * every field is optional except the ones the site always sends, so a change on
 * GoatCounter's side shows up as a missing row rather than as a crash.
 */

/** One row of a `browsers`/`systems`/`locations`/`languages`/`sizes`/`campaigns`/`toprefs` list. */
export interface GoatCounterStat {
  id?: string;
  name: string;
  count: number;
  /** How the row was referred: an HTTP header, a generated name, or a campaign. */
  ref_scheme?: string;
}

/** `GET /api/v0/stats/{page}` */
export interface GoatCounterStatsResponse {
  stats: GoatCounterStat[];
  more?: boolean;
}

/** One day (and its hours) in a path's or a site's series. */
export interface GoatCounterDayStat {
  day: string;
  daily?: number;
  hourly?: number[];
  weekly?: number;
  monthly?: number;
}

/** One path in `GET /api/v0/stats/hits`. */
export interface GoatCounterHitList {
  path: string;
  title?: string;
  /** Visitors, not pageviews — GoatCounter counts a visitor once per path. */
  count: number;
  max?: number;
  stats?: GoatCounterDayStat[];
}

/** `GET /api/v0/stats/hits` */
export interface GoatCounterHitsResponse {
  hits: GoatCounterHitList[];
  /** Visitors across the returned paths — a count of people, not a sum of rows. */
  total: number;
  more?: boolean;
}

/** `GET /api/v0/stats/total` */
export interface GoatCounterTotalResponse {
  total: number;
  total_events?: number;
  total_utc?: number;
  stats?: GoatCounterDayStat[];
}

/** One path known to the site, as listed by `GET /api/v0/paths`. */
export interface GoatCounterPath {
  id: number;
  path: string;
  title?: string;
  event?: boolean;
}

/** `GET /api/v0/paths` */
export interface GoatCounterPathsResponse {
  paths: GoatCounterPath[];
  more?: boolean;
}

/** The API token itself, as `GET /api/v0/me` describes it. */
export interface GoatCounterToken {
  name?: string;
  /** Bit flag: which endpoints the token may call. */
  permissions?: number;
  /** Bit flag: which sites the token covers. */
  sites?: number;
  last_used_at?: string;
}

/** `GET /api/v0/me` */
export interface GoatCounterMeResponse {
  user?: { email?: string; site?: number; email_verified?: boolean };
  token?: GoatCounterToken;
}

/** `GET /counter/<path>.json` — the public visitor counter. */
export interface GoatCounterCounterResponse {
  /** Formatted with thousands separators, e.g. `"1,234"`. */
  count: string;
  count_unique?: string;
}

/** A row as the popup renders it: a name, a count, and how full its bar is. */
export interface VisitorStatRow {
  name: string;
  count: number;
  /** `count` as a fraction of the largest count in the same list, for the bar. */
  share: number;
  /**
   * A quieter line under the name, where there is something worth saying: what
   * kind of referral a row is, for instance. The dashboard this popup is modelled
   * on shows exactly that, and "www.aocr.org / Referring site" says more than the
   * bare host does.
   */
  note?: string;
}

/** The four numbers across the top of the popup. */
export interface VisitorKpis {
  /** Everything GoatCounter has recorded for the scope. */
  allTime: number | null;
  /** The selected range — the number the rest of the report is about. */
  range: number | null;
  /** Since local midnight. */
  today: number | null;
  /** Since the first of the month. */
  month: number | null;
}

/** No figures yet: every tile says "reading…" until one arrives. */
export function emptyVisitorKpis(): VisitorKpis {
  return { allTime: null, range: null, today: null, month: null };
}

/** A day in the sparkline. */
export interface VisitorDayPoint {
  day: string;
  visits: number;
}

/** The headline numbers for the chosen range and scope. */
export interface VisitorTotals {
  /** People, not pageviews. */
  visitors: number;
  events: number;
  visitorsUtc: number;
  series: VisitorDayPoint[];
  /** The tallest day, so the sparkline can scale. */
  peak: number;
  /** True when the API had more paths than it was asked for, so the number is a floor. */
  partial: boolean;
}

/** One breakdown the popup can show. */
export type VisitorSectionKey =
  'referrers' | 'browsers' | 'systems' | 'locations' | 'languages' | 'sizes' | 'campaigns';

/** Everything the popup has loaded, as it arrives. */
export interface VisitorStatsBundle {
  totals: VisitorTotals | null;
  /** The app's own pages, newest first by visitors. */
  pages: VisitorStatRow[] | null;
  sections: Partial<Record<VisitorSectionKey, VisitorStatRow[]>>;
}

/** A labelled fact about the person reading the screen, or about this visit. */
export interface VisitorFact {
  label: string;
  value: string;
  /** A quieter second line: the engine, the offset, why something is missing. */
  note?: string;
}

/** A whole group of facts, with a heading, as the popup lays them out. */
export interface VisitorFactGroup {
  title: string;
  facts: VisitorFact[];
}

/** An empty bundle, so the popup can render before anything has been fetched. */
export function emptyVisitorStats(): VisitorStatsBundle {
  return { totals: null, pages: null, sections: {} };
}
