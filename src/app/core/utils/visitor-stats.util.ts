/**
 * What can be said about one visitor, and how GoatCounter's numbers are turned
 * into rows.
 *
 * Two kinds of fact live here. "This visit" is what the page can see about the
 * person in front of it — the referrer, the campaign, the entry page, how many
 * times this browser has opened the app. "This browser" is the machine itself:
 * screen, language, time zone, connection, and whether it is an installed app.
 * Both are computed on the spot from the browser's own readings; nothing is
 * looked up anywhere, and nothing is sent anywhere to find it out.
 *
 * The ranking helpers at the bottom are the opposite: they turn the aggregate
 * numbers the GoatCounter API answers with into the lists the popup draws.
 */

import type { DeviceInfo } from 'rm-ng-device-detection';
import type {
  GoatCounterDayStat,
  GoatCounterStat,
  VisitorFact,
  VisitorStatRow,
} from '../models/visitor-stats.model';
import {
  GOATCOUNTER_PERMISSION_FLAGS,
  GOATCOUNTER_STATS_PERMISSION,
} from '../constants/visitor.constants';

/** What the browser will say about its connection, when it says anything at all. */
export interface ConnectionInfo {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

/** The screen, as far as the page is allowed to know it. */
export interface ScreenInfo {
  width?: number;
  height?: number;
  availWidth?: number;
  availHeight?: number;
  colorDepth?: number;
  orientation?: string;
}

/** The reading of the browser that the facts are built from. */
export interface SessionEnvironment {
  /**
   * What `rm-ng-device-detection` made of the User-Agent.
   *
   * The library owns that parse rather than this app: browser, OS and device
   * identification is a moving list — a new phone, a new distro, a new
   * Chromium-based browser every few months — and a hand-rolled version of it
   * goes stale quietly. What is left here is the reading of the *session*
   * (screen, language, zone, connection), which the library has no opinion on.
   */
  device?: DeviceInfo;
  language?: string;
  languages?: readonly string[];
  platform?: string;
  maxTouchPoints?: number;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  online?: boolean;
  connection?: ConnectionInfo;
  cookiesEnabled?: boolean;
  webdriver?: boolean;
  screen?: ScreenInfo;
  viewport?: { width?: number; height?: number };
  pixelRatio?: number;
  timeZone?: string;
  utcOffsetMinutes?: number;
  darkMode?: boolean;
  reducedMotion?: boolean;
  standalone?: boolean;
  storageAvailable?: boolean;
}

/** The reading of this particular visit. */
export interface VisitEnvironment {
  entryPath?: string;
  entryTitle?: string;
  referrer?: string;
  /** This app's own origin, so an internal hop is not reported as a referral. */
  selfOrigin?: string;
  search?: string;
  startedAt?: Date;
  timeZone?: string;
  visitNumber?: number;
  /** Whether GoatCounter was told about this visit. */
  counted?: boolean;
  /** Why it was not, in `count.js`'s own words. */
  skippedBecause?: string | null;
}

/** The campaign parameters worth naming, in the order a link usually carries them. */
const CAMPAIGN_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'ref',
  'referrer',
  'source',
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'ttclid',
  'twclid',
  'igshid',
];

/** `0` → `UTC+00:00`, `-330` → `UTC-05:30`. */
export function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(Math.round(minutes));
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const rest = String(absolute % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${rest}`;
}

/** `2026-06-05T14:12:00Z` in the visitor's own zone, or `Unknown` if it cannot be said. */
export function formatLocalTime(at: Date, timeZone?: string): string {
  if (Number.isNaN(at.getTime())) return 'Unknown';

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    }).format(at);
  } catch {
    // An unknown zone name is not worth failing over: the local clock is still
    // the visitor's, it is only the label that would have been nicer.
    return at.toLocaleString();
  }
}

/** `"1920 × 1080"`, or an empty string when the screen will not say. */
export function formatScreen(screen?: ScreenInfo): string {
  if (!screen?.width || !screen?.height) return '';
  return `${screen.width} × ${screen.height}`;
}

/** One sentence about the connection, or an empty string when the browser keeps quiet. */
export function summariseConnection(connection?: ConnectionInfo): string {
  if (!connection) return '';

  const parts: string[] = [];
  if (connection.effectiveType) {
    parts.push(connection.effectiveType.toUpperCase());
  }
  if (typeof connection.downlink === 'number' && connection.downlink > 0) {
    parts.push(`about ${connection.downlink} Mbps`);
  }
  if (typeof connection.rtt === 'number' && connection.rtt > 0) {
    parts.push(`${connection.rtt} ms round trip`);
  }
  if (connection.saveData) {
    parts.push('data saver on');
  }
  return parts.join(' · ');
}

/** The campaign parameters in a query string, in the order the link wrote them. */
export function campaignParams(search: string): { name: string; value: string }[] {
  if (!search) return [];

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  } catch {
    return [];
  }

  const found: { name: string; value: string }[] = [];
  for (const key of CAMPAIGN_KEYS) {
    const value = params.get(key);
    if (value) found.push({ name: key, value });
  }
  return found;
}

/** How the visitor got here, in words rather than a URL. */
export function referrerFact(referrer: string | undefined, selfOrigin?: string): VisitorFact {
  if (!referrer) {
    return {
      label: 'Came from',
      value: 'Nowhere in particular',
      note: 'No referrer was sent — a bookmark, a typed address, or a link that hides it',
    };
  }

  let host: string;
  let external: boolean;
  try {
    const url = new URL(referrer);
    host = url.host;
    external = !selfOrigin || url.origin !== selfOrigin;
  } catch {
    // A referrer does not have to be a URL: GoatCounter accepts any string, and
    // so does this, because "a newsletter" is a perfectly good answer.
    return { label: 'Came from', value: referrer };
  }

  if (!external) {
    return { label: 'Came from', value: `Another page in DeepWork (${host})` };
  }

  const known: Record<string, string> = {
    'google.com': 'Google',
    'bing.com': 'Bing',
    'duckduckgo.com': 'DuckDuckGo',
    'github.com': 'GitHub',
    'news.ycombinator.com': 'Hacker News',
    'reddit.com': 'Reddit',
    'linkedin.com': 'LinkedIn',
    'twitter.com': 'Twitter',
    'x.com': 'X',
    'facebook.com': 'Facebook',
    'youtube.com': 'YouTube',
    'producthunt.com': 'Product Hunt',
  };
  const bare = host.replace(/^www\./, '');
  const name = known[bare] ?? host;

  return { label: 'Came from', value: name, note: referrer };
}

/** The browser and the machine it is running on. */
export function describeSession(environment: SessionEnvironment): VisitorFact[] {
  const facts: VisitorFact[] = [];
  const device = environment.device;

  facts.push({
    label: 'Browser',
    value: formatBrowser(device),
    note: `${engineFor(device?.browser)} engine`,
  });
  facts.push({ label: 'System', value: osNameOf(device) });
  facts.push({
    label: 'Device',
    value: deviceTypeOf(device),
    ...(deviceModelOf(device) ? { note: deviceModelOf(device)! } : {}),
  });

  // A distro is the one part of "Linux" worth naming: Ubuntu and Arch are not
  // the same reader.
  if (device?.osDistro && device.osDistro !== 'Unknown') {
    facts.push({ label: 'Distribution', value: device.osDistro });
  }

  if (device?.isBot) {
    facts.push({
      label: 'Crawler',
      value: 'A bot rather than a person',
      note: 'GoatCounter ignores the crawlers it recognises, so this visit is probably not in the count',
    });
  }

  const screen = formatScreen(environment.screen);
  if (screen) {
    const notes: string[] = [];
    const { availWidth, availHeight, colorDepth, orientation } = environment.screen ?? {};
    if (availWidth && availHeight) notes.push(`${availWidth} × ${availHeight} usable`);
    if (colorDepth) notes.push(`${colorDepth}-bit colour`);
    if (orientation) notes.push(orientation);
    facts.push({
      label: 'Screen',
      value: screen,
      ...(notes.length ? { note: notes.join(' · ') } : {}),
    });
  } else {
    facts.push({ label: 'Screen', value: 'Not reported' });
  }

  const { width, height } = environment.viewport ?? {};
  if (width && height) {
    facts.push({
      label: 'Window',
      value: `${width} × ${height}`,
      ...(environment.pixelRatio ? { note: `${environment.pixelRatio}× pixel density` } : {}),
    });
  }

  const languages = environment.languages ?? [];
  const language = environment.language ?? languages[0];
  if (language) {
    const others = languages.filter((entry) => entry !== language);
    facts.push({
      label: 'Language',
      value: language,
      ...(others.length ? { note: `also ${others.slice(0, 4).join(', ')}` } : {}),
    });
  }

  if (environment.timeZone) {
    const offset =
      typeof environment.utcOffsetMinutes === 'number'
        ? ` · ${formatUtcOffset(environment.utcOffsetMinutes)}`
        : '';
    facts.push({ label: 'Time zone', value: environment.timeZone, note: `Local clock${offset}` });
  }

  const connection = summariseConnection(environment.connection);
  facts.push({
    label: 'Connection',
    value: connection || 'Not reported',
    ...(connection ? {} : { note: 'Only Chromium browsers expose this' }),
  });

  const storage: string[] = [];
  storage.push(environment.cookiesEnabled === false ? 'cookies off' : 'cookies on');
  storage.push(
    environment.storageAvailable === false
      ? 'local storage unavailable'
      : 'local storage available',
  );
  if (environment.online === false) storage.push('offline');
  facts.push({ label: 'Storage', value: storage.join(' · ') });

  facts.push({
    label: 'Display mode',
    value: environment.standalone ? 'Installed app (standalone)' : 'Browser tab',
  });

  const preferences: string[] = [];
  if (typeof environment.darkMode === 'boolean') {
    preferences.push(environment.darkMode ? 'prefers dark' : 'prefers light');
  }
  if (environment.reducedMotion) preferences.push('prefers reduced motion');
  if (preferences.length) {
    facts.push({ label: 'Preferences', value: preferences.join(' · ') });
  }

  const machine: string[] = [];
  if (environment.hardwareConcurrency) {
    machine.push(`${environment.hardwareConcurrency} CPU threads`);
  }
  if (environment.deviceMemory) machine.push(`${environment.deviceMemory} GB memory`);
  if (typeof environment.maxTouchPoints === 'number' && environment.maxTouchPoints > 0) {
    machine.push(`${environment.maxTouchPoints} touch points`);
  }
  if (machine.length) {
    facts.push({ label: 'Hardware', value: machine.join(' · ') });
  }

  if (environment.webdriver) {
    facts.push({
      label: 'Automation',
      value: 'Script-controlled browser',
      note: 'navigator.webdriver is set — GoatCounter does not count these',
    });
  }

  if (device?.userAgent) {
    facts.push({ label: 'User agent', value: device.userAgent });
  }

  return facts;
}

/**
 * `Chrome 131.0` — the browser's own name and version.
 *
 * The version is trimmed to its first two parts: `131.0.0.0` and `131.0` are the
 * same browser, and the popup is not a changelog.
 */
function formatBrowser(device?: DeviceInfo): string {
  if (!device?.browser) return 'Unknown';
  const version = shortVersion(device.browser_version);
  return version ? `${device.browser} ${version}` : device.browser;
}

/** The names the library uses that read better with a space in them. */
const OS_NAMES: Record<string, string> = {
  Mac: 'macOS',
  'Chrome-OS': 'ChromeOS',
  'Firefox-OS': 'Firefox OS',
  'Windows-Phone': 'Windows Phone',
};

/** `Windows` — with its version as the note, because "Windows · 11" reads. */
function osNameOf(device?: DeviceInfo): string {
  if (!device?.os || device.os === 'Unknown') return 'Unknown';
  const name = OS_NAMES[device.os] ?? device.os;
  const version = versionNote(device.os, device.os_version);
  return version ? `${name} · ${version}` : name;
}

/**
 * `windows-11` and `mac-os-x-15` are slugs, not sentences.
 *
 * The OS name is already on screen, so it comes off the front, and "OS X" in the
 * middle of macOS's version is the same name said twice.
 */
function versionNote(os: string, version?: string): string {
  if (!version) return '';

  const slug = os.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  let tail = version.toLowerCase();
  if (tail.startsWith(slug)) tail = tail.slice(slug.length);

  return tail
    .replace(/^-/, '')
    .replace(/^os-?x-?/, '')
    .replace(/-/g, ' ')
    .trim();
}

/** `desktop` → `Desktop`. */
function deviceTypeOf(device?: DeviceInfo): string {
  const type = device?.deviceType;
  if (!type || type === 'unknown') return deviceModelOf(device) ?? 'Unknown';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** `Google Pixel`, `Steam Deck` — or nothing when the library has no model. */
function deviceModelOf(device?: DeviceInfo): string | null {
  const model = device?.device;
  return !model || model === 'Unknown' ? null : model;
}

/** Which engine draws the page, from the browser's own name. */
function engineFor(browser?: string): string {
  if (!browser || browser === 'Unknown') return 'Unknown';
  if (browser === 'Firefox') return 'Gecko';
  if (browser === 'Safari') return 'WebKit';
  if (browser === 'IE') return 'Trident';
  return 'Blink';
}

/** `131.0.0.0` → `131.0`, `17` → `17`, anything unparseable → nothing. */
function shortVersion(version?: string): string {
  if (!version || version === '0') return '';
  return version.split('.').slice(0, 2).join('.');
}

/** This visit: how they arrived, when, and whether it was counted. */
export function describeVisit(visit: VisitEnvironment): VisitorFact[] {
  const facts: VisitorFact[] = [];

  if (visit.entryPath) {
    facts.push({
      label: 'Landed on',
      value: visit.entryPath,
      ...(visit.entryTitle ? { note: visit.entryTitle } : {}),
    });
  }

  facts.push(referrerFact(visit.referrer, visit.selfOrigin));

  const campaigns = campaignParams(visit.search ?? '');
  if (campaigns.length) {
    facts.push({
      label: 'Campaign',
      value: campaigns.map((entry) => `${entry.name}=${entry.value}`).join(', '),
    });
  }

  if (visit.startedAt) {
    facts.push({
      label: 'Arrived at',
      value: formatLocalTime(visit.startedAt, visit.timeZone),
      ...(visit.timeZone ? { note: `your local time in ${visit.timeZone}` } : {}),
    });
  }

  if (typeof visit.visitNumber === 'number' && visit.visitNumber > 0) {
    facts.push({
      label: 'Visits from this browser',
      value: String(visit.visitNumber),
      note: 'Counted locally, on this device only',
    });
  }

  if (visit.counted === true) {
    facts.push({
      label: 'Counted',
      value: 'Yes, by GoatCounter',
      note: 'Anonymous: no cookies, no cross-site tracking, no personal data',
    });
  } else if (visit.skippedBecause) {
    facts.push({
      label: 'Counted',
      value: 'No',
      note: `GoatCounter skipped it: ${visit.skippedBecause}`,
    });
  } else if (visit.counted === false) {
    facts.push({
      label: 'Counted',
      value: 'No',
      note: 'Visit counting is switched off in Settings',
    });
  }

  return facts;
}

/**
 * Rank a list of stats, biggest first, with each bar as a share of the biggest.
 *
 * `note` is how a caller adds a second line to every row — the referrer list uses
 * it to say what *kind* of referral each row is, which is the difference between
 * "www.aocr.org" and "www.aocr.org / Referring site".
 */
export function rankStats(
  stats: readonly GoatCounterStat[] | undefined,
  limit: number,
  note?: (stat: GoatCounterStat) => string | undefined,
): VisitorStatRow[] {
  if (!stats?.length) return [];

  const sorted = [...stats].sort((a, b) => b.count - a.count).slice(0, limit);
  const top = sorted[0]?.count || 1;

  return sorted.map((stat) => {
    const second = note?.(stat);
    return {
      name: stat.name || '(unknown)',
      count: stat.count,
      share: stat.count / top,
      ...(second ? { note: second } : {}),
    };
  });
}

/**
 * `1234` → `1,234`.
 *
 * Thousands separators, worked out here rather than through `toLocaleString`,
 * so a four-figure visitor count reads the same in every locale and in every
 * test: this is a dashboard figure, not prose.
 */
export function formatCount(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * What kind of referral a row in the referrer list is.
 *
 * GoatCounter sends a `ref_scheme` letter with each one and its own dashboard
 * leans on it — a bare host tells you where somebody came from, this tells you
 * *how*: a search result, a link on another site, a campaign, or nothing at all
 * because the referrer was hidden or typed by hand (`(no data)` there, "No
 * referrer" here).
 */
export function referrerNote(refScheme?: string): string {
  switch (refScheme) {
    case 'h':
      return 'Referring site';
    case 'g':
      return 'Search engine';
    case 'c':
      return 'Campaign';
    case 'o':
      return 'Other';
    default:
      return 'No referrer';
  }
}

/**
 * The per-day series behind a total, ready to draw.
 *
 * GoatCounter sends a row per day with the hourly counts beside it; only the
 * daily number matters here, because the popup shows a bar per day.
 */
export function seriesFromStats(stats: readonly GoatCounterDayStat[] | undefined): {
  series: { day: string; visits: number }[];
  peak: number;
} {
  const series = (stats ?? [])
    .filter((entry) => !!entry.day)
    .map((entry) => ({ day: entry.day, visits: entry.daily ?? 0 }));
  const peak = series.reduce((highest, point) => Math.max(highest, point.visits), 0);
  return { series, peak };
}

/** `2026-06-05` → `5 Jun`, for the axis under the sparkline. */
export function shortDay(day: string): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;

  try {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(parsed);
  } catch {
    return day;
  }
}

/**
 * The permissions an API token carries, in the words GoatCounter's own token
 * screen uses.
 *
 * `1` is GoatCounter's "nothing selected" value, not a permission, so it reads
 * as an empty list rather than as a permission with no name.
 */
export function describePermissions(mask?: number): string[] {
  if (typeof mask !== 'number' || mask <= 1) return [];
  return GOATCOUNTER_PERMISSION_FLAGS.filter((entry) => (mask & entry.flag) === entry.flag).map(
    (entry) => entry.label,
  );
}

/** Can this token read the numbers the popup is built from? */
export function canReadStatistics(mask?: number): boolean {
  return (
    typeof mask === 'number' &&
    (mask & GOATCOUNTER_STATS_PERMISSION) === GOATCOUNTER_STATS_PERMISSION
  );
}
