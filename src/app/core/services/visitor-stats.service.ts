import { Injectable, computed, inject, signal } from '@angular/core';
import { RmNgDeviceDetectionService, type DeviceInfo } from 'rm-ng-device-detection';
import {
  GOATCOUNTER_API_BASE,
  GOATCOUNTER_API_GAP_MS,
  GOATCOUNTER_API_LIMIT,
  GOATCOUNTER_PATH_PAGES,
  VISITOR_ALL_TIME_START,
  VISITOR_DEFAULT_RANGE,
  VISITOR_DEFAULT_SCOPE,
  VISITOR_LIST_LIMIT,
  VISITOR_RANGES,
  VISITOR_STAT_SECTIONS,
  type VisitorKpiKey,
  type VisitorRangeKey,
  type VisitorScopeKey,
  type VisitorSectionKey,
} from '../constants/visitor.constants';
import {
  emptyVisitorKpis,
  emptyVisitorStats,
  type GoatCounterHitsResponse,
  type GoatCounterMeResponse,
  type GoatCounterPathsResponse,
  type GoatCounterStatsResponse,
  type GoatCounterTotalResponse,
  type VisitorFact,
  type VisitorFactGroup,
  type VisitorKpis,
  type VisitorStatRow,
  type VisitorStatsBundle,
  type VisitorTotals,
} from '../models/visitor-stats.model';
import { displayPath, isCountedPath, selectPathIds } from '../utils/analytics-path.util';
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
 * Two things are deliberately not here. The API token is not in the source and
 * never will be: the web build is published on GitHub Pages, so anything in the
 * bundle is public, and a token in a public bundle is a token anyone can read
 * somebody's statistics with. It is typed in by hand, kept in this browser's
 * `localStorage`, and never written to the database either — DeepWork's database
 * is exported to a JSON file that people share, and an access token has no
 * business travelling in one.
 *
 * The second is retries and background polling. The popup is opened on purpose
 * by someone who wants to look; it asks once, shows what came back, and stops.
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

  /** DeepWork's own pages, or the whole GoatCounter site (which carries rajatmalik.dev). */
  readonly scope = signal<VisitorScopeKey>(VISITOR_DEFAULT_SCOPE);

  readonly bundle = signal<VisitorStatsBundle>(emptyVisitorStats());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly failures = signal<Partial<Record<FailureKey, string>>>({});

  /**
   * False once the API has answered with paths that are not DeepWork's own,
   * which is how a filter that was quietly ignored is noticed.
   */
  readonly scopeFiltered = signal(true);

  /** True when the API has more paths than it was asked for, so the list is a top-N. */
  readonly pagesTruncated = signal(false);

  /** The token's own description, from `/api/v0/me`. */
  readonly tokenInfo = signal<GoatCounterMeResponse | null>(null);
  readonly tokenError = signal<string | null>(null);
  readonly verifying = signal(false);

  /** The app's own visitor count, for the settings row: `null` until it is known. */
  readonly headline = signal<VisitorTotals | null>(null);
  readonly headlineLoading = signal(false);

  /**
   * The same range for the whole GoatCounter site, for context.
   *
   * One GoatCounter site carries both this app and rajatmalik.dev, so "12
   * visitors" on its own is a figure without a denominator. This is what lets the
   * popup say "12 of the site's 40, in this range, were DeepWork's pages" instead
   * of leaving the reader to guess which of the two numbers they are looking at.
   * Fetched only for the DeepWork scope, where that distinction is the point.
   */
  readonly siteVisitors = signal<number | null>(null);

  /**
   * The four numbers across the top: everything ever, the range, today and this
   * month.
   *
   * Each is `null` until it arrives, so a tile can say it is still reading rather
   * than showing a zero nobody has been told yet. The range's own entry is filled
   * from the same request that fills the headline, so the two can never disagree.
   */
  readonly kpis = signal<VisitorKpis>(emptyVisitorKpis());

  /**
   * True when GoatCounter knows nothing under the app's own prefix yet.
   *
   * A fresh counter on a shared site is the case this exists for: the honest
   * answer is "nobody yet", not a page of sections that look like they failed.
   */
  readonly noData = signal(false);

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
  private pathIdCache: number[] | null = null;
  private pathIdScanTruncated = false;

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

  /** Switch between DeepWork's pages and the whole site. */
  setScope(scope: VisitorScopeKey): void {
    if (this.scope() === scope) return;
    this.scope.set(scope);
    if (this.dialogOpen()) void this.loadStats();
  }

  /** Ask again, ignoring the session's caches. */
  async refresh(): Promise<void> {
    this.pathIdCache = null;
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

    this.pathIdCache = null;
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
    this.pathIdCache = null;
    this.scopeFiltered.set(true);
  }

  /**
   * The settings row's own number: this app's visitors over the default range.
   *
   * Only the totals are fetched — two API requests rather than a dozen — because
   * the row is a single figure and the popup is one click away for the rest.
   */
  async loadHeadline(): Promise<void> {
    if (!this.counter.isWeb || !this.counter.token() || this.headline()) return;

    this.headlineLoading.set(true);
    try {
      const token = this.counter.token();
      if (!token) return;
      const pathIds = await this.deepworkPathIds(token);
      const totals = await this.fetchTotals(token, this.range(), pathIds);
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
    this.noData.set(false);
    this.bundle.set(emptyVisitorStats());
    this.scopeFiltered.set(true);
    this.siteVisitors.set(null);
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

      const pathIds = this.scope() === 'deepwork' ? await this.deepworkPathIds(token) : null;

      // Nothing has ever been filed under the app's own prefix: that is a real
      // answer, and a much kinder one than a page of empty sections. The report
      // still draws in full — every tile says `0`, which is the truth here — and
      // the popup prints one line saying why.
      if (pathIds && pathIds.length === 0) {
        this.noData.set(true);
        this.kpis.set({ allTime: 0, range: 0, today: 0, month: 0 });
        this.bundle.set({ ...emptyVisitorStats(), totals: emptyTotals(), pages: [] });
        return;
      }

      await Promise.all([
        this.fetchTotals(token, this.range(), pathIds)
          .then((totals) => {
            this.bundle.update((current) => ({ ...current, totals }));
            this.kpis.update((current) => ({ ...current, range: totals.visitors }));
          })
          .catch((error: unknown) => this.note('totals', error)),
        // The site's own number, so the app's can be read as a share of it.
        // Best effort: a popup with the app's figures and no denominator is
        // still a working popup, so a failure here is swallowed on purpose.
        pathIds === null
          ? Promise.resolve()
          : this.fetchTotals(token, this.range(), null)
              .then((site) => this.siteVisitors.set(site.visitors))
              .catch(() => this.siteVisitors.set(null)),
        // The three figures beside the range total, each best effort for the same
        // reason: one tile that did not answer must not take the report with it.
        this.tile('allTime', token, VISITOR_ALL_TIME_START, nowIso(), pathIds),
        this.tile('today', token, startOfTodayIso(), nowIso(), pathIds),
        this.tile('month', token, startOfMonthIso(), nowIso(), pathIds),
        this.fetchPages(token, start, end, pathIds)
          .then((pages) => this.bundle.update((current) => ({ ...current, pages })))
          .catch((error: unknown) => this.note('pages', error)),
        ...VISITOR_STAT_SECTIONS.map((section) =>
          this.fetchSection(section.key, section.page, token, start, end, pathIds)
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
    // A token that is wrong and a server that is asking for a slower pace both
    // empty the whole popup, so neither is one section's problem.
    if (error instanceof VisitorStatsError && (error.needsToken || error.transient)) {
      this.error.set(message);
      return;
    }
    this.failures.update((current) => ({ ...current, [key]: message }));
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
    pathIds: number[] | null,
  ): Promise<void> {
    try {
      const total = await this.fetchTotalFor(token, start, end, pathIds);
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

  /** The headline numbers for a range and a scope. */
  private async fetchTotals(
    token: string,
    range: VisitorRangeKey,
    pathIds: number[] | null,
  ): Promise<VisitorTotals> {
    const { start, end } = rangeBounds(range);
    const response = await this.api<GoatCounterTotalResponse>(
      '/stats/total',
      { start, end, ...this.pathParam(pathIds) },
      token,
    );
    const { series, peak } = seriesFromStats(response.stats);

    return {
      visitors: response.total ?? 0,
      events: response.total_events ?? 0,
      visitorsUtc: response.total_utc ?? 0,
      series,
      peak,
      partial: this.pathIdScanTruncated && pathIds !== null,
    };
  }

  /** The app's own pages, biggest first. */
  private async fetchPages(
    token: string,
    start: string,
    end: string,
    pathIds: number[] | null,
  ): Promise<VisitorStatRow[]> {
    const response = await this.api<GoatCounterHitsResponse>(
      '/stats/hits',
      {
        start,
        end,
        limit: String(GOATCOUNTER_API_LIMIT),
        group: 'day',
        ...this.pathParam(pathIds),
      },
      token,
    );

    this.pagesTruncated.set(response.more === true);

    const mine =
      pathIds === null ? response.hits : response.hits.filter((hit) => isCountedPath(hit.path));

    // A filter that was ignored answers with the other site's paths mixed in;
    // noticing that here is what stops the popup labelling somebody else's
    // visitors as DeepWork's.
    if (pathIds !== null) this.scopeFiltered.set(mine.length === response.hits.length);

    return rankStats(
      mine.map((hit) => ({ name: displayPath(hit.path), count: hit.count })),
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
    pathIds: number[] | null,
  ): Promise<VisitorStatRow[]> {
    const response = await this.api<GoatCounterStatsResponse>(
      `/stats/${page}`,
      { start, end, limit: String(VISITOR_LIST_LIMIT), ...this.pathParam(pathIds) },
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
   * Used for the three figures that are not the selected range — everything ever,
   * today, and this month — which are the numbers a reader wants beside the range
   * total rather than instead of it.
   */
  private async fetchTotalFor(
    token: string,
    start: string,
    end: string,
    pathIds: number[] | null,
  ): Promise<number> {
    const response = await this.api<GoatCounterTotalResponse>(
      '/stats/total',
      { start, end, ...this.pathParam(pathIds) },
      token,
    );
    return response.total ?? 0;
  }

  /**
   * The IDs of DeepWork's own paths on the shared site.
   *
   * The API filters by ID, not by name, so the app has to know which rows are
   * its own — and since the two apps cannot be told apart by domain, this prefix
   * is the only thing that can say. The answer is remembered for the session:
   * paths come into being, but rarely in the middle of a look at the settings.
   */
  private async deepworkPathIds(token: string): Promise<number[] | null> {
    if (this.pathIdCache) return this.pathIdCache;

    const ids: number[] = [];
    let after = 0;
    this.pathIdScanTruncated = false;

    for (let page = 0; page < GOATCOUNTER_PATH_PAGES; page += 1) {
      const response = await this.api<GoatCounterPathsResponse>(
        '/paths',
        { limit: '200', ...(after ? { after: String(after) } : {}) },
        token,
      );

      ids.push(...selectPathIds(response.paths));

      const last = response.paths[response.paths.length - 1];
      if (!response.more || !last) {
        this.pathIdScanTruncated = false;
        break;
      }
      after = last.id;
      this.pathIdScanTruncated = true;
    }

    this.pathIdCache = ids;
    return ids;
  }

  /** `include_paths=1,2,3`, or nothing at all for the whole site. */
  private pathParam(pathIds: number[] | null): Record<string, string | undefined> {
    if (!pathIds || pathIds.length === 0) return {};
    // Comma-separated, which is how GoatCounter's own dashboard passes a list of
    // path IDs around (see `exclude` in its widget loader).
    return { include_paths: pathIds.join(',') };
  }

  /**
   * One request to the API, with the queue's gap in front of it.
   *
   * GoatCounter allows four requests a second, and the popup asks ten; the gap
   * is taken here rather than by running the requests one after another, because
   * the wait is bookkeeping and the fetches themselves may as well overlap.
   */
  private async api<T>(
    path: string,
    params: Record<string, string | undefined>,
    token: string,
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

  /** Wait out whatever is left of the gap since the last request. */
  private async pace(): Promise<void> {
    const wait = this.apiGapMs - (Date.now() - this.lastCallAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastCallAt = Date.now();
  }
}

/** An empty set of totals, for a site with nothing under the app's prefix yet. */
function emptyTotals(): VisitorTotals {
  return { visitors: 0, events: 0, visitorsUtc: 0, series: [], peak: 0, partial: false };
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
