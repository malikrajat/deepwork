import { Injectable, computed, inject, signal } from '@angular/core';
import { RmNgDeviceDetectionService, type DeviceInfo } from 'rm-ng-device-detection';
import {
  GOATCOUNTER_API_BASE,
  GOATCOUNTER_API_GAP_MS,
  GOATCOUNTER_API_LIMIT,
  VISITOR_ALL_TIME_START,
  VISITOR_DEFAULT_RANGE,
  VISITOR_LIST_LIMIT,
  VISITOR_RANGES,
  VISITOR_STAT_SECTIONS,
  type VisitorKpiKey,
  type VisitorRangeKey,
  type VisitorSectionKey,
} from '../constants/visitor.constants';
import {
  emptyVisitorKpis,
  emptyVisitorStats,
  type GoatCounterHitsResponse,
  type GoatCounterMeResponse,
  type GoatCounterStatsResponse,
  type GoatCounterTotalResponse,
  type VisitorFact,
  type VisitorFactGroup,
  type VisitorKpis,
  type VisitorStatRow,
  type VisitorStatsBundle,
  type VisitorTotals,
} from '../models/visitor-stats.model';
import {
  canReadStatistics,
  describePermissions,
  describeSession,
  describeVisit,
  rankStats,
  referrerNote,
  seriesFromStats,
  type ConnectionInfo,
  type SessionEnvironment,
} from '../utils/visitor-stats.util';
import { VisitorCounterService } from './visitor-counter.service';

/** A failure that knows whether the answer is "your token, not your network". */
export class VisitorStatsError extends Error {
  constructor(
    message: string,
    /** True when a different token would fix this, so the popup shows the form. */
    readonly needsToken = false,
    /** True when it is worth asking again: a rate limit, or no network yet. */
    readonly transient = false,
  ) {
    super(message);
    this.name = 'VisitorStatsError';
  }
}

/** What a section's failure is filed under, alongside the section keys. */
type FailureKey = VisitorSectionKey | 'totals' | 'pages';

/** The browser readings that are not on the standard TypeScript `Navigator`. */
interface NavigatorExtras {
  deviceMemory?: number;
  connection?: ConnectionInfo;
}

/**
 * Reads the GoatCounter dashboard through its JSON API, for the details popup.
 *
 * DeepWork has its own GoatCounter site (`app-deepwork.goatcounter.com`), so
 * every path on it is this app's: there is no second app to filter out and no
 * path-ID scan to run before the first number can be shown. What the popup asks
 * for is exactly what the dashboard shows — a total for a range, the pages, and
 * the breakdowns beside them.
 *
 * The API token is not in the source: the web build is published on GitHub
 * Pages, so anything in the bundle is public, and a token in a public bundle is
 * a token anyone can read somebody's statistics with. It is typed in by hand,
 * kept in this browser's `localStorage`, and never written to the database
 * either — DeepWork's database is exported to a JSON file that people share, and
 * an access token has no business travelling in one. The one baked into
 * `visitor.constants.ts` is a read-only token for this site alone.
 *
 * The second thing deliberately not here is retries and background polling. The
 * popup is opened on purpose by someone who wants to look; it asks once, shows
 * what came back, and stops.
 *
 * What the numbers mean: GoatCounter counts *visitors*, not pageviews, and a
 * visitor is a browser session rather than a person being followed. It stores
 * no cookies of its own for this and keeps no IP addresses, which is why the
 * app is happy to leave it switched on by default — see `VisitorCounterService`.
 */
@Injectable({ providedIn: 'root' })
export class VisitorStatsService {
  private readonly counter = inject(VisitorCounterService);

  /**
   * The User-Agent, read by the library rather than by hand.
   *
   * Declared before `environment` because that field is built from it: class
   * fields initialise in the order they are written.
   */
  private readonly devices = inject(RmNgDeviceDetectionService);

  /** Whether the popup is on screen. */
  readonly dialogOpen = signal(false);

  /** The range the popup is reading. */
  readonly range = signal<VisitorRangeKey>(VISITOR_DEFAULT_RANGE);

  readonly bundle = signal<VisitorStatsBundle>(emptyVisitorStats());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly failures = signal<Partial<Record<FailureKey, string>>>({});

  /** True when the API has more pages than it was asked for, so the list is a top-N. */
  readonly pagesTruncated = signal(false);

  /** The token's own description, from `/api/v0/me`. */
  readonly tokenInfo = signal<GoatCounterMeResponse | null>(null);
  readonly tokenError = signal<string | null>(null);
  readonly verifying = signal(false);

  /** The app's own visitor count, for the settings row: `null` until it is known. */
  readonly headline = signal<VisitorTotals | null>(null);
  readonly headlineLoading = signal(false);

  /**
   * The four numbers across the top: everything ever, the range, today and this
   * month.
   *
   * Each is `null` until it arrives, so a tile can say it is still reading rather
   * than showing a zero nobody has been told yet. The range's own entry is filled
   * from the same request that fills the headline, so the two can never disagree.
   */
  readonly kpis = signal<VisitorKpis>(emptyVisitorKpis());

  readonly hasToken = computed(() => !!this.counter.token());

  /** The token's permissions in words, for the popup's token section. */
  readonly tokenPermissions = computed(() =>
    describePermissions(this.tokenInfo()?.token?.permissions),
  );

  /** True when the saved token cannot read statistics — the one thing it must do. */
  readonly tokenCannotReadStats = computed(() => {
    const mask = this.tokenInfo()?.token?.permissions;
    return typeof mask === 'number' && !canReadStatistics(mask);
  });

  /**
   * True when the site has recorded nothing at all yet.
   *
   * A brand-new counter is the case this exists for: the honest answer is
   * "nobody yet", not a page of sections that look like they failed. It is only
   * said after the all-time figure has actually arrived.
   */
  readonly noData = computed(
    () => !this.loading() && this.hasToken() && this.kpis().allTime === 0,
  );

  /**
   * The environment is read once, when this service is first built.
   *
   * These are facts about the machine rather than about the visit, and none of
   * them change while the app is open; reading them on every render would only
   * give the popup something to disagree with itself about.
   */
  private readonly environment: SessionEnvironment = readEnvironment(this.devices.getDeviceInfo());

  /** This visit, in the popup's words. */
  readonly visitFacts = computed<VisitorFact[]>(() =>
    describeVisit({
      entryPath: this.counter.entryPath,
      referrer: this.counter.referrer,
      selfOrigin: this.counter.selfOrigin,
      search: searchOf(this.counter.entryPath),
      startedAt: this.counter.startedAt,
      timeZone: this.environment.timeZone,
      visitNumber: this.counter.visitNumber(),
      counted: this.counter.countingEnabled() && this.counter.counted(),
      skippedBecause: this.counter.skippedBecause(),
    }),
  );

  /** The machine they are reading on. */
  readonly browserFacts = computed<VisitorFact[]>(() => describeSession(this.environment));

  /** Both, with their headings, ready for the popup to lay out. */
  readonly factGroups = computed<VisitorFactGroup[]>(() => [
    { title: 'This visit', facts: this.visitFacts() },
    { title: 'This browser', facts: this.browserFacts() },
  ]);

  /**
   * How long to leave between API requests.
   *
   * A field rather than a constant so the tests do not have to sit through a
   * dozen real delays; see `GOATCOUNTER_API_GAP_MS` for why the delay exists.
   */
  protected apiGapMs = GOATCOUNTER_API_GAP_MS;

  private lastCallAt = 0;

  /** Open the popup and read everything it shows. */
  openDialog(): void {
    this.dialogOpen.set(true);
    void this.loadStats();
  }

  /** Close the popup. Nothing is cleared: reopening is instant on the same range. */
  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  /** Switch range, and re-read if the popup is open. */
  setRange(range: VisitorRangeKey): void {
    if (this.range() === range) return;
    this.range.set(range);
    if (this.dialogOpen()) void this.loadStats();
  }

  /** Ask again, ignoring the session's caches. */
  async refresh(): Promise<void> {
    this.lastCallAt = 0;
    await this.loadStats();
  }

  /** Save the token the user pasted, and check that GoatCounter accepts it. */
  async saveToken(raw: string): Promise<void> {
    this.counter.saveToken(raw);
    this.tokenInfo.set(null);
    this.tokenError.set(null);

    if (!this.counter.token()) {
      this.bundle.set(emptyVisitorStats());
      this.headline.set(null);
      return;
    }

    await this.verifyToken();
    await this.loadStats();
    await this.loadHeadline();
  }

  /** Forget the token, here and in GoatCounter's eyes alike. */
  forgetToken(): void {
    this.counter.forgetToken();
    this.tokenInfo.set(null);
    this.tokenError.set(null);
    this.bundle.set(emptyVisitorStats());
    this.headline.set(null);
  }

  /**
   * The settings row's own number: this app's visitors over the default range.
   *
   * Only the totals are fetched — one API request rather than a dozen — because
   * the row is a single figure and the popup is one click away for the rest.
   */
  async loadHeadline(): Promise<void> {
    if (!this.counter.isWeb || !this.counter.token() || this.headline()) return;

    this.headlineLoading.set(true);
    try {
      const token = this.counter.token();
      if (!token) return;
      const totals = await this.fetchTotals(token, this.range());
      this.headline.set(totals);
    } catch (error) {
      this.failures.update((current) => ({ ...current, totals: failureText(error) }));
    } finally {
      this.headlineLoading.set(false);
    }
  }

  /** Read every part of the popup, in parallel but paced. */
  async loadStats(): Promise<void> {
    if (!this.counter.isWeb) return;

    this.error.set(null);
    this.failures.set({});
    this.bundle.set(emptyVisitorStats());
    this.kpis.set(emptyVisitorKpis());

    const token = this.counter.token();
    if (!token) {
      this.tokenInfo.set(null);
      return;
    }

    this.loading.set(true);
    const { start, end } = rangeBounds(this.range());

    try {
      if (!this.tokenInfo()) await this.verifyToken();

      await Promise.all([
        this.fetchTotals(token, this.range())
          .then((totals) => {
            this.bundle.update((current) => ({ ...current, totals }));
            this.kpis.update((current) => ({ ...current, range: totals.visitors }));
          })
          .catch((error: unknown) => this.note('totals', error)),
        // The all-time figure comes from the public counter, which is one small
        // request and covers the whole site; the API would answer with a day-by-
        // day series back to 2000 to say the same thing.
        this.allTimeTile(token),
        // The two figures beside the range total, each best effort: one tile
        // that did not answer must not take the report with it.
        this.tile('today', token, startOfTodayIso(), nowIso()),
        this.tile('month', token, startOfMonthIso(), nowIso()),
        this.fetchPages(token, start, end)
          .then((pages) => this.bundle.update((current) => ({ ...current, pages })))
          .catch((error: unknown) => this.note('pages', error)),
        ...VISITOR_STAT_SECTIONS.map((section) =>
          this.fetchSection(section.key, section.page, token, start, end)
            .then((rows) =>
              this.bundle.update((current) => ({
                ...current,
                sections: { ...current.sections, [section.key]: rows },
              })),
            )
            .catch((error: unknown) => this.note(section.key, error)),
        ),
      ]);
    } catch (error) {
      this.error.set(failureText(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** File a failure against the part of the popup it belongs to. */
  private note(key: FailureKey, error: unknown): void {
    const message = failureText(error);
    // A token GoatCounter will not accept empties the whole popup, so it is not
    // one section's problem. A network blip only takes the headline with it when
    // the headline is what failed; one slow list reports on its own card and the
    // rest of the report stays readable.
    const global =
      error instanceof VisitorStatsError &&
      (error.needsToken || (error.transient && key === 'totals'));
    if (global) {
      this.error.set(message);
      return;
    }
    this.failures.update((current) => ({ ...current, [key]: message }));
  }

  /**
   * The all-time tile, from the public counter where it is available.
   *
   * GoatCounter's `/counter/TOTAL.json` answers with one number and needs no
   * token; it is the same counter the settings row already reads. The API call
   * is the fallback for a site that has turned public counts off.
   */
  private async allTimeTile(token: string): Promise<void> {
    await this.counter.loadTotal();
    const parsed = Number.parseInt((this.counter.total() ?? '').replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(parsed)) {
      this.kpis.update((current) => ({ ...current, allTime: parsed }));
      return;
    }
    await this.tile('allTime', token, VISITOR_ALL_TIME_START, nowIso());
  }

  /**
   * One tile: a total for a window, put where the popup can show it.
   *
   * Failures land in the tile as a dash rather than as an error across the page —
   * a missing "this month" is not a broken report, and a reader who wants the
   * reason has the dashboard link at the foot of it.
   */
  private async tile(
    key: VisitorKpiKey,
    token: string,
    start: string,
    end: string,
  ): Promise<void> {
    try {
      const total = await this.fetchTotalFor(token, start, end);
      this.kpis.update((current) => ({ ...current, [key]: total }));
    } catch {
      /* the tile stays empty and says so */
    }
  }

  /** Ask GoatCounter who this token is. */
  private async verifyToken(): Promise<void> {
    const token = this.counter.token();
    if (!token) return;

    this.verifying.set(true);
    try {
      const info = await this.api<GoatCounterMeResponse>('/me', {}, token);
      this.tokenInfo.set(info);
      this.tokenError.set(null);
    } catch (error) {
      this.tokenInfo.set(null);
      this.tokenError.set(failureText(error));
    } finally {
      this.verifying.set(false);
    }
  }

  /** The headline numbers for a range. */
  private async fetchTotals(token: string, range: VisitorRangeKey): Promise<VisitorTotals> {
    const { start, end } = rangeBounds(range);
    const response = await this.api<GoatCounterTotalResponse>(
      '/stats/total',
      { start, end },
      token,
    );
    const { series, peak } = seriesFromStats(response.stats);

    return {
      visitors: response.total ?? 0,
      events: response.total_events ?? 0,
      visitorsUtc: response.total_utc ?? 0,
      series,
      peak,
      partial: false,
    };
  }

  /** The app's own pages, biggest first. */
  private async fetchPages(
    token: string,
    start: string,
    end: string,
  ): Promise<VisitorStatRow[]> {
    const response = await this.api<GoatCounterHitsResponse>(
      '/stats/hits',
      { start, end, limit: String(GOATCOUNTER_API_LIMIT), group: 'day' },
      token,
    );

    this.pagesTruncated.set(response.more === true);

    return rankStats(
      response.hits.map((hit) => ({ name: hit.path || hit.title || '/', count: hit.count })),
      VISITOR_LIST_LIMIT,
    );
  }

  /** One breakdown — browsers, countries, referrers and the rest. */
  private async fetchSection(
    key: VisitorSectionKey,
    page: string,
    token: string,
    start: string,
    end: string,
  ): Promise<VisitorStatRow[]> {
    const response = await this.api<GoatCounterStatsResponse>(
      `/stats/${page}`,
      { start, end, limit: String(VISITOR_LIST_LIMIT) },
      token,
    );

    // The referrer list is the one that says more than a name and a number: each
    // row is a search result, a link, a campaign or a hidden referrer, and the
    // dashboard this is modelled on says so under every row.
    return key === 'referrers'
      ? rankStats(response.stats, VISITOR_LIST_LIMIT, (stat) => referrerNote(stat.ref_scheme))
      : rankStats(response.stats, VISITOR_LIST_LIMIT);
  }

  /**
   * One tile's worth of visitors for an explicit window.
   *
   * Used for the figures that are not the selected range, which are the numbers
   * a reader wants beside the range total rather than instead of it.
   */
  private async fetchTotalFor(token: string, start: string, end: string): Promise<number> {
    const response = await this.api<GoatCounterTotalResponse>(
      '/stats/total',
      { start, end },
      token,
    );
    return response.total ?? 0;
  }

  /**
   * One request to the API, with the queue's gap in front of it.
   *
   * GoatCounter allows four requests a second, and the popup asks a dozen; the gap
   * is taken here rather than by running the requests one after another, because
   * the wait is bookkeeping and the fetches themselves may as well overlap.
   */
  private async api<T>(
    path: string,
    params: Record<string, string | undefined>,
    token: string,
    attempt = 0,
  ): Promise<T> {
    await this.pace();

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, value);
    }
    const search = query.toString();
    const url = `${GOATCOUNTER_API_BASE}${path}${search ? `?${search}` : ''}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
    } catch {
      throw new VisitorStatsError(
        'GoatCounter could not be reached — check the connection and try again.',
        false,
        true,
      );
    }

    if (response.status === 401) {
      throw new VisitorStatsError('GoatCounter did not accept this API token.', true);
    }
    if (response.status === 403) {
      throw new VisitorStatsError(
        'This token is not allowed to read statistics — make one with “Read statistics” ticked.',
        true,
      );
    }
    if (response.status === 429) {
      // A burst can still catch the limiter — a preflight is not visible to
      // `fetch`, so the browser cannot warn about it in advance. One retry after
      // a full gap is usually enough, and the second is the honest failure.
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, this.apiGapMs));
        return this.api(path, params, token, attempt + 1);
      }
      throw new VisitorStatsError(
        'GoatCounter is asking for a slower pace; try again in a moment.',
        false,
        true,
      );
    }
    if (!response.ok) {
      throw new VisitorStatsError(`GoatCounter answered ${response.status}.`);
    }

    return (await response.json()) as T;
  }

  /**
   * Wait out whatever is left of the gap since the last request.
   *
   * The slot is reserved *before* the wait, not after it. The popup starts its
   * requests together, so a version that set `lastCallAt` after awaiting had
   * every caller read the same old timestamp, compute the same zero wait, and
   * fire as one burst — which is exactly the 429 this gap exists to prevent.
   */
  private async pace(): Promise<void> {
    const now = Date.now();
    const startAt = Math.max(now, this.lastCallAt + this.apiGapMs);
    this.lastCallAt = startAt;
    const wait = startAt - now;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

/** `start` is rounded to the hour, as the API asks; `end` is now, so the last hour counts. */
function rangeBounds(range: VisitorRangeKey): { start: string; end: string } {
  const preset = VISITOR_RANGES.find((entry) => entry.key === range) ?? VISITOR_RANGES[1];
  const end = new Date();
  const start = new Date(end.getTime() - preset.days * 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Now, in the shape the API wants it. */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Local midnight this morning.
 *
 * "Today" means the reader's today, not UTC's: the API measures in UTC, so the
 * window is worked out on the local clock and handed over as an instant. A reader
 * in India asking at 02:00 is asking about a today that started two hours ago,
 * not six and a half.
 */
function startOfTodayIso(): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

/** Local first of the month, for the "this month" tile. */
function startOfMonthIso(): string {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

/** The query part of an address, with its `?`, for the campaign reader. */
function searchOf(url: string): string {
  const at = url.indexOf('?');
  if (at === -1) return '';
  return url.slice(at + 1).split('#')[0] ?? '';
}

/** One line for the popup, without a stack trace or a raw exception name. */
function failureText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong reading the statistics.';
}

/** Everything the browser will say about itself, read once. */
function readEnvironment(device: DeviceInfo): SessionEnvironment {
  const navigator_ = globalThis.navigator as (Navigator & NavigatorExtras) | undefined;
  const screen_ = globalThis.screen;

  return {
    device,
    language: navigator_?.language,
    languages: navigator_?.languages ? [...navigator_.languages] : undefined,
    maxTouchPoints: navigator_?.maxTouchPoints,
    hardwareConcurrency: navigator_?.hardwareConcurrency,
    deviceMemory: navigator_?.deviceMemory,
    online: navigator_?.onLine,
    connection: navigator_?.connection,
    cookiesEnabled: navigator_?.cookieEnabled,
    webdriver: navigator_?.webdriver,
    screen: screen_
      ? {
          width: screen_.width,
          height: screen_.height,
          availWidth: screen_.availWidth,
          availHeight: screen_.availHeight,
          colorDepth: screen_.colorDepth,
          orientation: screen_.orientation?.type,
        }
      : undefined,
    viewport: { width: globalThis.innerWidth, height: globalThis.innerHeight },
    pixelRatio: globalThis.devicePixelRatio,
    timeZone: localTimeZone(),
    utcOffsetMinutes: -new Date().getTimezoneOffset(),
    darkMode: prefers('(prefers-color-scheme: dark)'),
    reducedMotion: prefers('(prefers-reduced-motion: reduce)'),
    standalone: prefers('(display-mode: standalone)'),
    storageAvailable: storageWorks(),
  };
}

/** `undefined` when the browser cannot answer, rather than a confident `false`. */
function prefers(query: string): boolean | undefined {
  try {
    return globalThis.matchMedia?.(query)?.matches;
  } catch {
    return undefined;
  }
}

/** The zone name the browser reports, if it reports one. */
function localTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Can this browser keep anything? Private mode says no, loudly, when asked. */
function storageWorks(): boolean {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    storage.setItem('deepwork_storage_probe', '1');
    storage.removeItem('deepwork_storage_probe');
    return true;
  } catch {
    return false;
  }
}
