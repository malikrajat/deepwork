import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { RmNgDeviceDetectionService } from 'rm-ng-device-detection';
import {
  VisitorStatsService,
  VisitorStatsError,
} from '../../src/app/core/services/visitor-stats.service';
import { VisitorCounterService } from '../../src/app/core/services/visitor-counter.service';

/** One request the service made, kept so the tests can read what was asked. */
interface SentRequest {
  path: string;
  params: URLSearchParams;
  headers: Record<string, string>;
}

const BODY = {
  me: {
    user: { email: 'rajat@example.com' },
    token: { name: 'DeepWork', permissions: 64, sites: 3 },
  },
  paths: {
    paths: [
      { id: 1, path: '/deepwork/tasks' },
      { id: 2, path: '/about' },
      { id: 3, path: '/deepwork' },
    ],
    more: false,
  },
  total: {
    total: 12,
    total_events: 1,
    total_utc: 13,
    stats: [
      { day: '2026-06-01', daily: 5 },
      { day: '2026-06-02', daily: 7 },
    ],
  },
  hits: {
    hits: [
      { path: '/deepwork/tasks', count: 9 },
      { path: '/deepwork', count: 3 },
    ],
    total: 12,
    more: false,
  },
  stats: {
    stats: [
      { name: 'Chrome', count: 9 },
      { name: 'Firefox', count: 3 },
    ],
    more: false,
  },
  /** The referrer list is the one whose rows carry a second line. */
  refs: {
    stats: [
      { name: 'Google', count: 4, ref_scheme: 'g' },
      { name: 'Direct / typed', count: 2 },
    ],
    more: false,
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/**
 * The popup's whole job is to ask GoatCounter the right questions and to be
 * honest about the answers — including the awkward ones: a token that cannot
 * read statistics, a filter the API ignored, and a site with nothing under the
 * app's own prefix yet.
 */
describe('VisitorStatsService', () => {
  let service: VisitorStatsService;
  let counter: ReturnType<typeof makeCounter>;
  let sent: SentRequest[];
  let respond: (request: SentRequest) => Response;
  const realFetch = globalThis.fetch;

  /** The counter service, as the stats service sees it. */
  function makeCounter(token: string | null = 'a-token') {
    return {
      isWeb: true,
      token: signal<string | null>(token),
      countingEnabled: signal(true),
      counted: signal(true),
      skippedBecause: signal<string | null>(null),
      visitNumber: signal(2),
      entryPath: '/deepwork/settings?utm_source=news',
      referrer: 'https://www.google.com/',
      selfOrigin: 'https://malikrajat.github.io',
      startedAt: new Date('2026-06-05T14:12:00Z'),
      start: vi.fn(),
      setCounting: vi.fn(),
      saveToken: vi.fn((raw: string) => {
        counter.token.set(raw.trim() || null);
      }),
      forgetToken: vi.fn(() => counter.token.set(null)),
      loadTotal: vi.fn().mockResolvedValue(undefined),
    };
  }

  /** An answer for everything, unless a test overrides one of them. */
  function defaultRespond(request: SentRequest): Response {
    if (request.path.endsWith('/me')) return jsonResponse(BODY.me);
    if (request.path.endsWith('/paths')) return jsonResponse(BODY.paths);
    if (request.path.endsWith('/stats/total')) return jsonResponse(totalFor(request));
    if (request.path.endsWith('/stats/hits')) return jsonResponse(BODY.hits);
    if (request.path.endsWith('/stats/toprefs')) return jsonResponse(BODY.refs);
    return jsonResponse(BODY.stats);
  }

  /**
   * The four `/stats/total` requests are told apart by the window they ask for.
   *
   * Only "everything ever" can be recognised by its start alone — the other two
   * boundaries are worked out on the local clock, which a test should not be
   * re-deriving — so the tiles are proved from this one, and the rest by the
   * requests themselves.
   */
  function totalFor(request: SentRequest): unknown {
    return (request.params.get('start') ?? '').startsWith('2000-') ? { total: 99 } : BODY.total;
  }

  function setup(token: string | null = 'a-token'): VisitorStatsService {
    counter = makeCounter(token);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: VisitorCounterService, useValue: counter },
        // The User-Agent is read by `rm-ng-device-detection` in the real
        // service; this is what it would say about the test browser.
        {
          provide: RmNgDeviceDetectionService,
          useValue: {
            getDeviceInfo: () => ({
              userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              os: 'Windows',
              os_version: 'windows-11',
              browser: 'Chrome',
              browser_version: '131.0.6778.86',
              device: 'Windows PC',
              deviceType: 'desktop',
              orientation: 'landscape',
              osDistro: 'Unknown',
              isBot: false,
              width: 1280,
              height: 800,
              resolution: '1920x1080',
              devicePixelRatio: 2,
            }),
          },
        },
      ],
    });
    const built = TestBed.inject(VisitorStatsService);
    // The real service waits 300 ms between requests to stay inside
    // GoatCounter's four-a-second limit; the queue itself is tested by the
    // order of the requests, not by making every test sit through it.
    (built as unknown as { apiGapMs: number }).apiGapMs = 0;
    return built;
  }

  beforeEach(() => {
    sent = [];
    respond = defaultRespond;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const request: SentRequest = {
        path: url.pathname,
        params: url.searchParams,
        headers: (init?.headers ?? {}) as Record<string, string>,
      };
      sent.push(request);
      return respond(request);
    }) as unknown as typeof fetch;
    localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.clear();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('asks nothing at all until there is a token', async () => {
    service = setup(null);

    await service.loadStats();

    expect(sent).toEqual([]);
    expect(service.hasToken()).toBe(false);
    expect(service.bundle().totals).toBeNull();
  });

  it('reads the totals, the pages and every breakdown when there is one', async () => {
    service = setup();

    await service.loadStats();

    const totals = service.bundle().totals;
    expect(totals?.visitors).toBe(12);
    expect(totals?.events).toBe(1);
    expect(totals?.visitorsUtc).toBe(13);
    expect(totals?.series).toEqual([
      { day: '2026-06-01', visits: 5 },
      { day: '2026-06-02', visits: 7 },
    ]);
    expect(totals?.peak).toBe(7);

    // The prefix is dropped for the reader; the dashboard path says so plainly.
    expect(service.bundle().pages).toEqual([
      { name: '/tasks', count: 9, share: 1 },
      { name: '/ (dashboard)', count: 3, share: 3 / 9 },
    ]);
    expect(service.bundle().sections.browsers?.[0]).toEqual({
      name: 'Chrome',
      count: 9,
      share: 1,
    });
    expect(service.bundle().sections.referrers?.length).toBe(2);
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('sends the token as a bearer header, which is how GoatCounter wants it', async () => {
    service = setup('secret-token');

    await service.loadStats();

    expect(sent.length).toBeGreaterThan(3);
    for (const request of sent) {
      expect(request.headers['Authorization']).toBe('Bearer secret-token');
    }
  });

  it('fills the four tiles, each from its own window', async () => {
    service = setup();

    await service.loadStats();

    const totals = sent.filter((request) => request.path.endsWith('/stats/total'));
    // Four: the selected range, the whole site for context, everything ever,
    // today, and this month — minus the site one, which only runs when the scope
    // is the app's own pages… which it is here, so five in all.
    expect(totals.length).toBe(5);

    // The window that can be recognised from the outside is "everything ever".
    const allTime = totals.find((request) =>
      (request.params.get('start') ?? '').startsWith('2000-'),
    );
    expect(allTime?.params.get('include_paths')).toBe('1,3');
    expect(service.kpis().allTime).toBe(99);

    // Each of the others asks for a real window, and the range tile is the one
    // the rest of the report is about.
    for (const request of totals) {
      expect(request.params.get('start')).toBeTruthy();
      expect(request.params.get('end')).toBeTruthy();
    }
    expect(service.kpis().range).toBe(12);
    expect(service.kpis().today).toBe(12);
    expect(service.kpis().month).toBe(12);
  });

  it('says what kind of referral each row is', async () => {
    service = setup();

    await service.loadStats();

    const referrers = service.bundle().sections.referrers ?? [];
    expect(referrers[0]).toEqual({
      name: 'Google',
      count: 4,
      share: 1,
      note: 'Search engine',
    });
    // A row with no scheme at all is a referrer that never arrived.
    expect(referrers[1].note).toBe('No referrer');
  });

  it('filters by the app own path IDs, so the other app on the site is left out', async () => {
    service = setup();

    await service.loadStats();

    const totals = sent.filter((request) => request.path.endsWith('/stats/total'));
    // Two of them: the app's own visitors, and the whole site's for context —
    // which is what lets the popup say which of the two numbers it is showing.
    const [mine, site] = totals;
    // Paths 1 and 3 are DeepWork's; 2 is not. Comma-separated is how
    // GoatCounter's own dashboard passes a list of path IDs around.
    expect(mine.params.get('include_paths')).toBe('1,3');
    expect(site.params.get('include_paths')).toBeNull();
    expect(service.siteVisitors()).toBe(12);

    const browsers = sent.find((request) => request.path.endsWith('/stats/browsers'));
    expect(browsers?.params.get('include_paths')).toBe('1,3');
    // The list depth the popup draws: twenty rows, as GoatCounter's own
    // dashboard shows.
    expect(browsers?.params.get('limit')).toBe('20');
  });

  it('asks without a filter when the whole site is what was wanted', async () => {
    service = setup();
    respond = (request) =>
      request.path.endsWith('/stats/hits')
        ? jsonResponse({
            hits: [
              { path: '/', count: 40 },
              { path: '/deepwork/tasks', count: 9 },
            ],
            total: 49,
          })
        : defaultRespond(request);

    service.setScope('site');
    await service.loadStats();

    const total = sent.find((request) => request.path.endsWith('/stats/total'));
    expect(total?.params.get('include_paths')).toBeNull();
    // The other site's pages are in the answer now, and are shown as they are.
    expect(service.bundle().pages?.map((row) => row.name)).toEqual(['/', '/tasks']);
  });

  it('notices a filter the API quietly ignored', async () => {
    service = setup();
    respond = (request) =>
      request.path.endsWith('/stats/hits')
        ? jsonResponse({
            hits: [
              { path: '/about', count: 20 },
              { path: '/deepwork/tasks', count: 9 },
            ],
            total: 29,
          })
        : defaultRespond(request);

    await service.loadStats();

    // GoatCounter answered with the other app's pages, so the sections below
    // cannot be labelled as DeepWork's.
    expect(service.scopeFiltered()).toBe(false);
    expect(service.bundle().pages).toEqual([{ name: '/tasks', count: 9, share: 1 }]);
  });

  it('says nobody has been counted yet rather than showing empty lists', async () => {
    service = setup();
    respond = (request) =>
      request.path.endsWith('/paths')
        ? jsonResponse({ paths: [{ id: 2, path: '/about' }], more: false })
        : defaultRespond(request);

    await service.loadStats();

    expect(service.noData()).toBe(true);
    expect(service.bundle().totals?.visitors).toBe(0);
    // The report still draws in full, so the four tiles say zero rather than
    // nothing: there is a counter, and nobody has been counted on it yet.
    expect(service.kpis()).toEqual({ allTime: 0, range: 0, today: 0, month: 0 });
    expect(sent.some((request) => request.path.includes('/stats/'))).toBe(false);
  });

  it('reads every page of paths until the API says there are no more', async () => {
    service = setup();
    let call = 0;
    respond = (request) => {
      if (!request.path.endsWith('/paths')) return defaultRespond(request);
      call += 1;
      return call === 1
        ? jsonResponse({ paths: [{ id: 1, path: '/deepwork/a' }], more: true })
        : jsonResponse({ paths: [{ id: 2, path: '/deepwork/b' }], more: false });
    };

    await service.loadStats();

    const totals = sent.find((request) => request.path.endsWith('/stats/total'));
    expect(totals?.params.get('include_paths')).toBe('1,2');
  });

  it('says so when the token is not one GoatCounter knows', async () => {
    service = setup();
    respond = (request) =>
      request.path.endsWith('/me') ? jsonResponse({}, 401) : defaultRespond(request);

    await service.loadStats();

    expect(service.tokenError()).toContain('did not accept this API token');
  });

  it('shows the token form again when the statistics endpoints reject the token', async () => {
    service = setup();
    respond = (request) =>
      request.path.includes('/stats/') || request.path.endsWith('/paths')
        ? jsonResponse({ error: 'unknown token' }, 401)
        : defaultRespond(request);

    await service.loadStats();

    expect(service.error()).toContain('did not accept this API token');
  });

  it('names the missing permission when the token cannot read statistics', async () => {
    service = setup();
    respond = (request) =>
      request.path.includes('/stats/')
        ? jsonResponse({ error: 'forbidden' }, 403)
        : defaultRespond(request);

    await service.loadStats();

    expect(service.error()).toContain('Read statistics');
  });

  it('explains a rate limit rather than showing a broken popup', async () => {
    service = setup();
    respond = (request) =>
      request.path.includes('/stats/') ? jsonResponse({}, 429) : defaultRespond(request);

    await service.loadStats();

    expect(service.error()).toContain('slower pace');
  });

  it('files a failure against the part of the popup it belongs to', async () => {
    service = setup();
    respond = (request) =>
      request.path.endsWith('/stats/browsers') ? jsonResponse({}, 500) : defaultRespond(request);

    await service.loadStats();

    expect(service.failures()['browsers']).toContain('500');
    // One broken list does not take the others down with it.
    expect(service.bundle().totals?.visitors).toBe(12);
    expect(service.bundle().sections.systems?.length).toBe(2);
  });

  it('reports a network that is not there', async () => {
    service = setup();
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    await service.loadStats();

    expect(service.error() ?? service.tokenError()).toContain('could not be reached');
  });

  describe('the token itself', () => {
    it('describes what it may do', async () => {
      service = setup();

      await service.saveToken('a-token');

      expect(service.tokenInfo()?.token?.name).toBe('DeepWork');
      expect(service.tokenPermissions()).toEqual(['Read statistics']);
      expect(service.tokenCannotReadStats()).toBe(false);
    });

    it('warns when it may not read statistics', async () => {
      service = setup();
      respond = (request) =>
        request.path.endsWith('/me')
          ? jsonResponse({ token: { name: 'Wrong', permissions: 2 } })
          : defaultRespond(request);

      await service.saveToken('a-token');

      expect(service.tokenCannotReadStats()).toBe(true);
      expect(service.tokenPermissions()).toEqual(['Record pageviews']);
    });

    it('forgets everything when the token is cleared', async () => {
      service = setup();
      await service.loadStats();

      service.forgetToken();

      expect(counter.forgetToken).toHaveBeenCalled();
      expect(service.bundle().totals).toBeNull();
      expect(service.tokenInfo()).toBeNull();
    });

    it('clears the popup when an empty paste forgets the token', async () => {
      service = setup();
      await service.loadStats();

      await service.saveToken('  ');

      expect(counter.token()).toBeNull();
      expect(service.bundle().totals).toBeNull();
    });
  });

  describe('the settings row', () => {
    it('reads just the headline number, not the whole popup', async () => {
      service = setup();

      await service.loadHeadline();

      expect(service.headline()?.visitors).toBe(12);
      expect(sent.map((request) => request.path)).toEqual(['/api/v0/paths', '/api/v0/stats/total']);
    });

    it('asks only once', async () => {
      service = setup();

      await service.loadHeadline();
      await service.loadHeadline();

      expect(sent.length).toBe(2);
    });

    it('does nothing without a token', async () => {
      service = setup(null);

      await service.loadHeadline();

      expect(sent).toEqual([]);
      expect(service.headline()).toBeNull();
    });
  });

  describe('the popup state', () => {
    it('reads the statistics when it opens', async () => {
      service = setup();

      service.openDialog();

      expect(service.dialogOpen()).toBe(true);
      await vi.waitFor(() => expect(service.bundle().totals).not.toBeNull());
    });

    it('closes without throwing anything away', async () => {
      service = setup();
      service.openDialog();

      service.closeDialog();

      expect(service.dialogOpen()).toBe(false);
    });

    it('re-reads a new range, but only while it is on screen', async () => {
      service = setup();
      service.setRange('30d');
      expect(sent).toEqual([]);

      service.openDialog();
      await vi.waitFor(() => expect(service.bundle().totals).not.toBeNull());
      const before = sent.length;

      service.setRange('90d');
      await vi.waitFor(() => expect(sent.length).toBeGreaterThan(before));

      const last = sent[sent.length - 1];
      expect(last.params.get('start')).toBeDefined();
      expect(service.range()).toBe('90d');
    });

    it('ignores a range or scope that is already the one being shown', () => {
      service = setup();

      service.setRange('7d');
      service.setScope('deepwork');

      expect(sent).toEqual([]);
    });
  });

  describe('the facts about this visitor', () => {
    it('describes two groups: the visit and the browser', () => {
      service = setup();

      const groups = service.factGroups();

      expect(groups.map((group) => group.title)).toEqual(['This visit', 'This browser']);
      expect(groups[0].facts.some((fact) => fact.label === 'Came from')).toBe(true);
      expect(groups[0].facts.find((fact) => fact.label === 'Came from')?.value).toBe('Google');
      // Browser and system come from `rm-ng-device-detection`, formatted for a
      // reader: the version trimmed, the OS version out of its slug.
      expect(groups[1].facts.find((fact) => fact.label === 'Browser')?.value).toBe('Chrome 131.0');
      expect(groups[1].facts.find((fact) => fact.label === 'Browser')?.note).toBe('Blink engine');
      expect(groups[1].facts.find((fact) => fact.label === 'System')?.value).toBe('Windows · 11');
      expect(groups[1].facts.find((fact) => fact.label === 'Device')?.value).toBe('Desktop');
    });

    it('says the visit was counted', () => {
      service = setup();

      const counted = service.visitFacts().find((fact) => fact.label === 'Counted');

      expect(counted?.value).toBe('Yes, by GoatCounter');
    });

    it('says when counting is switched off', () => {
      service = setup();
      counter.countingEnabled.set(false);

      const counted = service.visitFacts().find((fact) => fact.label === 'Counted');

      expect(counted?.value).toBe('No');
    });
  });

  it('knows a token problem when it sees one', () => {
    const failure = new VisitorStatsError('nope', true);
    expect(failure.needsToken).toBe(true);
    expect(failure.transient).toBe(false);
    expect(failure.name).toBe('VisitorStatsError');
    expect(new VisitorStatsError('nope').needsToken).toBe(false);
    expect(new VisitorStatsError('nope', false, true).transient).toBe(true);
  });
});
