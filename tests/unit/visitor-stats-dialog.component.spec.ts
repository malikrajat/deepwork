import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { signal } from '@angular/core';
import { VisitorStatsDialogComponent } from '../../src/app/shared/components/visitor-stats-dialog/visitor-stats-dialog.component';
import { VisitorStatsService } from '../../src/app/core/services/visitor-stats.service';
import { VisitorCounterService } from '../../src/app/core/services/visitor-counter.service';
import { GOATCOUNTER_TOKENS_URL } from '../../src/app/core/constants/visitor.constants';

const SOURCE = resolve(
  __dirname,
  '../../src/app/shared/components/visitor-stats-dialog/visitor-stats-dialog.component.ts',
);
const CONSTANTS = resolve(__dirname, '../../src/app/core/constants/visitor.constants.ts');

/** The parts of the component the template touches, for the tests to call. */
interface DialogInternals {
  rowsFor(key: string): { name: string; count: number; share: number }[] | null;
  rowsOrZero(
    rows: { name: string; count: number; share: number }[] | null,
    loading?: boolean,
  ): { name: string; count: number; share: number }[];
  countOrDash(value: number | null | undefined): string;
  sparkStart(): string;
  sparkEnd(): string;
  scopeNote(): string;
  tokenName(): string;
  rangeLabel(): string;
  scopeLabel(): string;
  siteShare(site: number): string;
  kpiValue(key: string): string | null;
  kpiNote(key: string, fallback: string): string;
  sparkBars(): { day: string; label: string; visits: number; height: number }[];
  panelLeft(): number;
  measureSidebar(): void;
}

/** The popup is a view over two services, so both are mocked whole. */
const makeServices = (
  overrides: {
    token?: string | null;
    tokenFromBuild?: boolean;
    range?: string;
    scope?: string;
  } = {},
) => {
  const stats = {
    dialogOpen: signal(true),
    range: signal(overrides.range ?? '7d'),
    scope: signal(overrides.scope ?? 'deepwork'),
    bundle: signal({
      totals: {
        visitors: 12,
        events: 1,
        visitorsUtc: 13,
        series: [
          { day: '2026-06-01', visits: 5 },
          { day: '2026-06-02', visits: 7 },
        ],
        peak: 7,
        partial: false,
      },
      pages: [{ name: '/tasks', count: 9, share: 1 }],
      sections: { browsers: [{ name: 'Chrome', count: 9, share: 1 }] },
    }),
    loading: signal(false),
    error: signal<string | null>(null),
    failures: signal<Record<string, string>>({}),
    scopeFiltered: signal(true),
    pagesTruncated: signal(false),
    noData: signal(false),
    tokenInfo: signal<{ token?: { name?: string; permissions?: number } } | null>({
      token: { name: 'DeepWork', permissions: 64 },
    }),
    tokenError: signal<string | null>(null),
    verifying: signal(false),
    siteVisitors: signal<number | null>(40),
    kpis: signal({ allTime: 2841, range: 12, today: 0, month: 8 }),
    hasToken: () => overrides.token !== null,
    tokenCannotReadStats: () => false,
    tokenPermissions: () => ['Read statistics'],
    factGroups: () => [
      { title: 'This visit', facts: [{ label: 'Came from', value: 'Google' }] },
      { title: 'This browser', facts: [{ label: 'Browser', value: 'Chrome 131.0' }] },
    ],
    openDialog: vi.fn(),
    closeDialog: vi.fn(),
    setRange: vi.fn(),
    setScope: vi.fn(),
    refresh: vi.fn(),
    saveToken: vi.fn().mockResolvedValue(undefined),
    forgetToken: vi.fn(),
  };
  const counter = {
    isWeb: true,
    token: signal<string | null>(overrides.token ?? 'a-token'),
    tokenFromBuild: () => overrides.tokenFromBuild ?? false,
    countingEnabled: signal(true),
    setCounting: vi.fn((value: boolean) => counter.countingEnabled.set(value)),
  };
  return { stats, counter };
};

/**
 * The popup renders GoatCounter's API answers and, under them, what the page can
 * see about its own visitor. The template is asserted against source rather than
 * rendered: this project mandates signal inputs, and Angular's JIT compiler —
 * the only option under Vitest — cannot resolve them. See
 * `welcome-prefs-dialog.component.spec.ts` for the same constraint.
 */
describe('VisitorStatsDialogComponent', () => {
  let services: ReturnType<typeof makeServices>;
  let dialog: VisitorStatsDialogComponent;
  let internals: DialogInternals;

  beforeEach(() => {
    services = makeServices();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: VisitorStatsService, useValue: services.stats },
        { provide: VisitorCounterService, useValue: services.counter },
      ],
    });
    dialog = TestBed.runInInjectionContext(() => new VisitorStatsDialogComponent());
    internals = dialog as unknown as DialogInternals;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('asks the stats service for everything, and holds no token of its own', () => {
    const src = readFileSync(SOURCE, 'utf8');
    // The dialog never builds an API request itself: the token and the requests
    // live in the service, so there is one place to audit and one place to clear.
    expect(src).not.toContain('fetch(');
    expect(src).not.toContain('Authorization');
    expect(src).toContain('stats.saveToken(value)');
    expect(src).toContain('stats.forgetToken()');
    // Nothing that looks like a token literal: the web build is published, so
    // anything in this file is public.
    expect(src).not.toMatch(/token\s*[:=]\s*['"][A-Za-z0-9_-]{16,}/);
  });

  it('gets the rows for a section, and knows when a section has not arrived', () => {
    expect(internals.rowsFor('browsers')).toEqual([{ name: 'Chrome', count: 9, share: 1 }]);
    expect(internals.rowsFor('languages')).toBeNull();
  });

  it('names the token, or says it has not been checked', () => {
    expect(internals.tokenName()).toBe('DeepWork');

    services.stats.tokenInfo.set(null);
    expect(internals.tokenName()).toBe('saved (not checked yet)');
  });

  it('captions the headline with the range and the scope it covers', () => {
    expect(internals.rangeLabel()).toBe('Last 7 days');
    expect(internals.scopeLabel()).toBe('DeepWork only');

    services.stats.scope.set('site');
    expect(internals.scopeLabel()).toContain('whole GoatCounter site');
  });

  it('scales the sparkline against the tallest day', () => {
    expect(internals.sparkBars().map((bar) => bar.visits)).toEqual([5, 7]);
    expect(internals.sparkBars().map((bar) => bar.height)).toEqual([71, 100]);
    expect(internals.sparkBars()[0].label).toContain('Jun');
  });

  it('has no sparkline to draw when there are no days', () => {
    services.stats.bundle.set({
      totals: { visitors: 0, events: 0, visitorsUtc: 0, series: [], peak: 0, partial: false },
      pages: [],
      sections: {},
    });

    expect(internals.sparkBars()).toEqual([]);
  });

  it('closes the dialog through the service that owns it', () => {
    dialog.close();
    expect(services.stats.closeDialog).toHaveBeenCalledTimes(1);
  });

  it('hands a pasted token to the service, which checks it with GoatCounter', async () => {
    await dialog.saveToken('pasted-token');
    expect(services.stats.saveToken).toHaveBeenCalledWith('pasted-token');
  });

  it('turns counting off from inside the popup', () => {
    // The switch lives here rather than in the settings row: the row is a
    // number, and whether to be counted at all is a decision.
    dialog.toggleCounting();
    expect(services.counter.setCounting).toHaveBeenCalledWith(false);

    services.counter.countingEnabled.set(false);
    dialog.toggleCounting();
    expect(services.counter.setCounting).toHaveBeenLastCalledWith(true);
  });

  it('says what share of the whole site the app own number is', () => {
    // One GoatCounter site carries two apps, so "12 visitors" means something
    // different depending on which of the two numbers it is. The denominator is
    // what stops that being misread.
    expect(internals.siteShare(40)).toBe(
      "12 of this site's 40 visitors in this range were on DeepWork's pages",
    );
  });

  it('says nothing when the site has had no visitors at all', () => {
    expect(internals.siteShare(0)).toBe('');
  });

  it('shows each tile figure, with thousands separated', () => {
    expect(internals.kpiValue('allTime')).toBe('2,841');
    expect(internals.kpiValue('range')).toBe('12');
  });

  it('shows a real zero as a zero rather than as no answer', () => {
    // "0 since midnight" is an answer; a dash would say the app has none.
    expect(internals.kpiValue('today')).toBe('0');
  });

  it('says which range and scope the range tile is about', () => {
    // Four figures on one screen, and this is the one whose period moves.
    expect(internals.kpiNote('range', 'unused')).toBe('Last 7 days · DeepWork only');
    expect(internals.kpiNote('today', 'since midnight')).toBe('since midnight');
  });

  describe('the same view, whatever the filter', () => {
    it('gives every card a row, even a range nobody visited in', () => {
      // A card that empties itself is a shorter report to re-read; the row says
      // "No visitors yet" and counts 0 instead.
      expect(internals.rowsOrZero([], false)).toEqual([
        { name: 'No visitors yet', count: 0, share: 0 },
      ]);
      expect(internals.rowsOrZero(null, false)).toEqual([
        { name: 'No visitors yet', count: 0, share: 0 },
      ]);
    });

    it('does not claim to know a zero before the answer arrives', () => {
      expect(internals.rowsOrZero(null, true)[0].name).toBe('Reading…');
      expect(internals.rowsOrZero(null, true)[0].count).toBe(0);
    });

    it('leaves real rows exactly as they came', () => {
      const rows = [{ name: 'Chrome', count: 3, share: 1 }];
      expect(internals.rowsOrZero(rows, false)).toBe(rows);
    });

    it('shows a zero figure as a zero, and an absent one as a dash', () => {
      expect(internals.countOrDash(0)).toBe('0');
      expect(internals.countOrDash(12)).toBe('12');
      expect(internals.countOrDash(null)).toBe('—');
      expect(internals.countOrDash(undefined)).toBe('—');
    });

    it('labels the chart ends with or without anything plotted', () => {
      expect(internals.sparkStart()).toContain('Jun');
      expect(internals.sparkEnd()).toContain('Jun');

      services.stats.bundle.set({
        totals: { visitors: 0, events: 0, visitorsUtc: 0, series: [], peak: 0, partial: false },
        pages: [],
        sections: {},
      });
      expect(internals.sparkStart()).toBe('Last 7 days');
      expect(internals.sparkEnd()).toBe('now');
    });

    it('always says what the figures cover, in both scopes', () => {
      expect(internals.scopeNote()).toContain("12 of this site's 40");

      services.stats.scope.set('site');
      expect(internals.scopeNote()).toContain('rajatmalik.dev');

      // ...and when the site's own figure did not arrive, the line still says
      // which pages are being counted rather than disappearing.
      services.stats.scope.set('deepwork');
      services.stats.siteVisitors.set(null);
      expect(internals.scopeNote()).toContain('DeepWork');
    });
  });

  // ── Template contract ─────────────────────────────────────────────────────

  it('is opaque, because glass is for a card that has something behind it', () => {
    // The first version of this popup used `--glass-bg`, which is 4.5% white:
    // it read as a see-through sheet with the app's own text showing through it,
    // and nothing in it could be read. `--surface-float` is the token for
    // something that floats above the app, and it is opaque in both themes.
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('background: var(--surface-float');
    expect(src).not.toContain('background: var(--glass-bg');
  });

  it('is announced as a modal dialog and answers to Escape', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
    expect(src).toContain('aria-labelledby');
    expect(src).toContain('document:keydown.escape');
  });

  it('asks for the token in a field, with the one permission it needs spelled out', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('Paste your GoatCounter API token');
    expect(src).toContain('Read statistics');
    // Hidden by default, with a way to look at what was pasted.
    expect(src).toContain("revealToken() ? 'text' : 'password'");
    expect(src).toContain('tokensUrl');
    expect(GOATCOUNTER_TOKENS_URL).toContain('/user/api');
  });

  it('says the token is kept in the browser and out of the exports', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('stays in this browser');
    expect(src).toContain('not in the JSON it exports');
  });

  it('offers both a range and a scope, and a way to ask again', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('stats.setRange(option.key)');
    expect(src).toContain('stats.setScope(option.key)');
    expect(src).toContain('stats.refresh()');
  });

  it('shows every breakdown the constants describe, each with its own footnote', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('statSections');
    expect(src).toContain('section.label');
    // The footnote is what turns a list of names into an answer.
    expect(src).toContain('section.note');

    const constants = readFileSync(CONSTANTS, 'utf8');
    expect(constants).toContain('Where visitors come from');
    expect(constants).toContain('Visitor locations');
    expect(constants).toContain('Browsers');
    expect(constants).toContain('Operating systems');
    expect(constants).toContain('Languages');
    expect(constants).toContain('Screen widths');
    expect(constants).toContain('Campaigns');
    expect(constants).toContain("page: 'toprefs'");
    expect(constants).toContain("page: 'locations'");
  });

  it('draws the same eight cards for every filter, not a shorter report', () => {
    const src = readFileSync(SOURCE, 'utf8');

    // Both kinds of card draw through the same helper, which is what makes an
    // empty range a card with a zero in it rather than a card that is not there.
    expect(src).toContain('rowsOrZero(stats.bundle().pages');
    expect(src).toContain('rowsOrZero(rowsFor(section.key)');
    // The chart frame is unconditional; only its contents change.
    expect(src).toContain('@empty');
    expect(src).toContain('spark-none');
    // The scope line is unconditional too.
    expect(src).toContain('scopeNote()');

    // The state-dependent shapes that used to stand in for a card are gone.
    expect(src).not.toContain('Not loaded.');
    expect(src).not.toContain('Nothing in this range.');
    expect(src).not.toContain('Nothing read in this range.');
  });

  it('annotates an empty counter instead of replacing the report', () => {
    // "Nobody yet" is a line above the tiles; the tiles themselves are still
    // there, at zero, which is the truth in that state.
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('stats.noData()');
    expect(src).toContain('class="is-note"');
    expect(src).toContain('kpi-grid');
  });

  it('has the four tiles the dashboard opens with', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('kpis');
    expect(src).toContain('kpiValue(kpi.key)');
    expect(src).toContain('kpiNote(kpi.key, kpi.note)');

    const constants = readFileSync(CONSTANTS, 'utf8');
    expect(constants).toContain('Total visitors');
    expect(constants).toContain('Unique visitors');
    expect(constants).toContain('Visitors today');
    expect(constants).toContain('Visitors this month');
  });

  it('shows what this page knows about the visitor, without asking anyone', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('stats.factGroups()');
  });

  it('carries the counting switch, which used to sit in the settings row', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('Count my visits');
    expect(src).toContain('role="switch"');
    expect(src).toContain('[attr.aria-checked]="counter.countingEnabled()"');
    expect(src).toContain('(click)="toggleCounting()"');
  });

  it('says which token is in use, and only offers to forget the reader own', () => {
    // A token baked into the build is not the reader's to remove, and offering
    // "Forget" for one would look broken when it came straight back.
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('counter.tokenFromBuild()');
    expect(src).toContain('Using the token built into this app');
    expect(src).toContain('@if (!counter.tokenFromBuild())');
  });

  it('shows the app own number as a share of the whole site', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('stats.siteVisitors()');
    expect(src).toContain('siteShare(');
  });

  it('fills the window instead of sitting in a small centred card', () => {
    const src = readFileSync(SOURCE, 'utf8');
    // The panel is the page: the backdrop stretches, and the card takes the
    // whole of it.
    expect(src).toContain('align-items: stretch');
    expect(src).toContain('width: 100%');
    expect(src).toContain('height: 100%');
    expect(src).not.toContain('max-width: 620px');
  });

  it('leaves the sidebar visible, by starting where it ends', () => {
    // `100vw` cannot say "everything to the right of the sidebar", and a report
    // that hides the way to every other page is worse than a slightly smaller
    // one — so the edge is measured.
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('[style.left.px]="panelLeft()"');
    expect(src).toContain("querySelector('.sidebar')");
  });

  it('measures the sidebar, and copes with there being none', () => {
    const sidebar = document.createElement('nav');
    sidebar.className = 'sidebar';
    sidebar.getBoundingClientRect = () => ({ right: 240, width: 240 }) as DOMRect;
    document.body.appendChild(sidebar);

    internals.measureSidebar();
    expect(internals.panelLeft()).toBe(240);

    sidebar.remove();
    internals.measureSidebar();
    // Focus mode renders no sidebar at all, and then the panel may have the lot.
    expect(internals.panelLeft()).toBe(0);
  });

  it('lays the breakdowns out in columns rather than one long scroll', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('class="blocks"');
    expect(src).toContain('repeat(auto-fit, minmax(300px, 1fr))');
  });

  it('says what a visitor is, so the number cannot be read as pageviews', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('kpi-note');
    // Prettier wraps the caption, so the phrase is matched across a line break.
    expect(src).toMatch(/not a\s+pageview/);
  });

  it('says the desktop app is not counted, at the top where it is read', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('desktop app has no web address');
  });

  it('explains a filter the API ignored rather than mislabelling the numbers', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('!stats.scopeFiltered()');
    expect(src).toContain('ignored the path filter');
  });

  it('warns when the token cannot read statistics at all', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('stats.tokenCannotReadStats()');
  });

  it('links to the GoatCounter dashboard for the raw numbers', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('dashboardUrl');
    expect(src).toContain('Open the dashboard');
    expect(src).toContain('appExternalLink');
  });
});
