import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { signal } from '@angular/core';
import { VisitorCounterPanelComponent } from '../../src/app/shared/components/visitor-counter-panel/visitor-counter-panel.component';
import { VisitorCounterService } from '../../src/app/core/services/visitor-counter.service';
import { VisitorStatsService } from '../../src/app/core/services/visitor-stats.service';

const SOURCE = resolve(
  __dirname,
  '../../src/app/shared/components/visitor-counter-panel/visitor-counter-panel.component.ts',
);

/** The parts of the component the template touches, for the tests to call. */
interface PanelInternals {
  visitorCount(): string;
  countNote(): string;
}

/** The panel is a view over two services, so both are mocked whole. */
function makeServices(
  options: {
    web?: boolean;
    token?: string | null;
    total?: string | null;
    headline?: number | null;
    headlineLoading?: boolean;
    failure?: string;
  } = {},
) {
  const counter = {
    isWeb: options.web ?? true,
    countingEnabled: signal(true),
    total: signal<string | null>(options.total ?? null),
    counterLoading: signal(false),
    counterError: signal<string | null>(null),
    token: signal<string | null>(options.token ?? null),
    loadTotal: vi.fn().mockResolvedValue(undefined),
    setCounting: vi.fn(),
  };
  const stats = {
    headline: signal(
      options.headline === undefined || options.headline === null
        ? null
        : {
            visitors: options.headline,
            events: 0,
            visitorsUtc: 0,
            series: [],
            peak: 0,
            partial: false,
          },
    ),
    headlineLoading: signal(options.headlineLoading ?? false),
    failures: signal<Record<string, string>>(options.failure ? { totals: options.failure } : {}),
    range: signal('7d'),
    loadHeadline: vi.fn().mockResolvedValue(undefined),
    openDialog: vi.fn(),
  };
  return { stats, counter };
}

/**
 * The settings row is one number and one button: the figure is the only thing
 * worth a row, and it has to be honest about which figure it is — the app's own
 * (with a token), or the whole GoatCounter site's (without one, because the
 * public counter cannot separate two apps).
 *
 * The template is asserted against source rather than rendered: this project
 * mandates signal inputs, and Angular's JIT compiler — the only option under
 * Vitest — cannot resolve them. See `welcome-prefs-dialog.component.spec.ts`.
 */
describe('VisitorCounterPanelComponent', () => {
  let services: ReturnType<typeof makeServices>;
  let panel: VisitorCounterPanelComponent;
  let internals: PanelInternals;

  const setup = (options: Parameters<typeof makeServices>[0] = {}) => {
    services = makeServices(options);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: VisitorCounterService, useValue: services.counter },
        { provide: VisitorStatsService, useValue: services.stats },
      ],
    });
    panel = TestBed.runInInjectionContext(() => new VisitorCounterPanelComponent());
    internals = panel as unknown as PanelInternals;
  };

  beforeEach(() => setup());
  afterEach(() => TestBed.resetTestingModule());

  it('reads the public counter and the app own number when it is opened', () => {
    panel.ngOnInit();

    expect(services.counter.loadTotal).toHaveBeenCalledTimes(1);
    expect(services.stats.loadHeadline).toHaveBeenCalledTimes(1);
  });

  describe('the number', () => {
    it('prefers the app own count, which is what the row is about', () => {
      setup({ token: 'a-token', headline: 12, total: '28' });
      expect(internals.visitorCount()).toBe('12');
    });

    it('falls back to the public site counter when there is no token', () => {
      setup({ total: '28' });
      expect(internals.visitorCount()).toBe('28');
    });

    it('says it is still reading rather than showing a zero', () => {
      setup({ headlineLoading: true });
      expect(internals.visitorCount()).toBe('…');
    });

    it('shows a dash when there is nothing to show', () => {
      expect(internals.visitorCount()).toBe('—');
    });
  });

  describe('the note under the number', () => {
    it('names the range and says it is this app alone', () => {
      setup({ token: 'a-token', headline: 12 });
      expect(internals.countNote()).toBe('Last 7 days · this web app only, from the API');
    });

    it('says the public counter covers both apps, because it does', () => {
      setup({ total: '28' });
      const note = internals.countNote();
      expect(note).toContain('rajatmalik.dev');
      expect(note).toContain('token in the popup');
    });

    it('says it is reading while it is', () => {
      setup({ headlineLoading: true });
      expect(internals.countNote()).toBe('Reading the GoatCounter API…');
    });

    it('shows why there is no number instead of an empty row', () => {
      setup({ failure: 'GoatCounter did not accept this API token.' });
      expect(internals.countNote()).toBe('GoatCounter did not accept this API token.');
    });
  });

  // ── Template contract ─────────────────────────────────────────────────────

  it('offers the details popup', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('stats.openDialog()');
    expect(src).toContain('Details');
  });

  it('is one row: the number and the way into the popup, and nothing else', () => {
    const src = readFileSync(SOURCE, 'utf8');
    // The two rows that used to sit under the number — the counting switch and
    // the token's state — were moved out: the switch into the popup, which is
    // where a decision rather than a number belongs, and the token state away
    // entirely, because the popup already says what the token can do.
    expect(src).not.toContain('Count my visits');
    expect(src).not.toContain('What the popup can show');
    // One row in the web branch, one line in the desktop branch — and no switch
    // styling left behind.
    expect((src.match(/class="setting-item"/g) ?? []).length).toBe(2);
    expect(src).not.toContain('.switch');
  });

  it('opens the popup rather than rendering it inside its own card', () => {
    // The panel is rendered by the app shell, because this row sits in a
    // `.setting-group` whose `backdrop-filter` makes it the containing block for
    // `position: fixed` — so a popup rendered from here was the width of the card
    // instead of the window. It is not even imported here now.
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('stats.openDialog()');
    expect(src).not.toContain('VisitorStatsDialogComponent');
  });

  it('explains the desktop app rather than hiding the setting', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('is not counted');
    expect(src).toContain('malikrajat.github.io/deepwork');
  });

  it('says the popup can only show the site total without a token', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('public counter cannot separate them');
  });
});
