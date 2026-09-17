import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { signal } from '@angular/core';
import { DesktopPrefsPanelComponent } from '../../src/app/shared/components/desktop-prefs-panel/desktop-prefs-panel.component';
import { DesktopPrefsService } from '../../src/app/core/services/desktop-prefs.service';

const makeMockPrefs = (
  options: { desktop?: boolean; start?: boolean; onTop?: boolean; busy?: boolean } = {}
) => ({
  isDesktopApp: options.desktop ?? true,
  startWithSystem: signal(options.start ?? false),
  alwaysOnTop: signal(options.onTop ?? false),
  error: signal<string | null>(null),
  busy: signal(options.busy ?? false),
  setStartWithSystem: vi.fn().mockResolvedValue(undefined),
  setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
});

const SOURCE = resolve(
  __dirname,
  '../../src/app/shared/components/desktop-prefs-panel/desktop-prefs-panel.component.ts'
);

/**
 * The panel is a thin view over DesktopPrefsService, which is where the real
 * behaviour (OS writes, persistence, rollback) is tested.
 *
 * NOTE: the template is not rendered here. This project mandates signal inputs
 * (`docs/angular-best-practices.md`), and Angular's JIT compiler — the only
 * option under Vitest — cannot resolve signal inputs, so `TestBed.createComponent`
 * on a template that binds them fails. The same constraint is documented in
 * `timeline-bar.component.spec.ts`. Behaviour is therefore exercised by building
 * the component inside an injection context, and the template's required
 * affordances are asserted against the source.
 */
describe('DesktopPrefsPanelComponent', () => {
  let prefs: ReturnType<typeof makeMockPrefs>;
  let panel: DesktopPrefsPanelComponent;

  const setup = (options: Parameters<typeof makeMockPrefs>[0] = {}) => {
    // Tests may re-configure mid-test (e.g. to flip a preference), so the module
    // has to be reset before every configuration.
    TestBed.resetTestingModule();
    prefs = makeMockPrefs(options);
    TestBed.configureTestingModule({
      providers: [{ provide: DesktopPrefsService, useValue: prefs }],
    });
    panel = TestBed.runInInjectionContext(() => new DesktopPrefsPanelComponent());
  };

  beforeEach(() => setup());
  afterEach(() => TestBed.resetTestingModule());

  it('turns start-with-system on when it is currently off', async () => {
    await panel.toggleStartWithSystem();
    expect(prefs.setStartWithSystem).toHaveBeenCalledWith(true);
  });

  it('turns start-with-system off when it is currently on', async () => {
    setup({ start: true });
    await panel.toggleStartWithSystem();
    expect(prefs.setStartWithSystem).toHaveBeenCalledWith(false);
  });

  it('turns always-on-top on when it is currently off', async () => {
    await panel.toggleAlwaysOnTop();
    expect(prefs.setAlwaysOnTop).toHaveBeenCalledWith(true);
  });

  it('turns always-on-top off when it is currently on', async () => {
    setup({ onTop: true });
    await panel.toggleAlwaysOnTop();
    expect(prefs.setAlwaysOnTop).toHaveBeenCalledWith(false);
  });

  it('leaves the other preference alone', async () => {
    await panel.toggleAlwaysOnTop();
    expect(prefs.setStartWithSystem).not.toHaveBeenCalled();
  });

  it('disables the switches outside the desktop app', () => {
    setup({ desktop: false });
    expect(panel.disabled()).toBe(true);
  });

  it('disables the switches while a change is in flight', () => {
    setup({ busy: true });
    expect(panel.disabled()).toBe(true);
  });

  it('enables the switches in the desktop app when idle', () => {
    expect(panel.disabled()).toBe(false);
  });

  // ── Template contract ─────────────────────────────────────────────────────
  // Guards the affordances this feature exists to provide, so a later refactor
  // cannot quietly drop the switches or the user education.

  it('renders both preference switches bound to the service', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('role="switch"');
    expect((src.match(/role="switch"/g) ?? []).length).toBe(2);
    expect(src).toContain('prefs.startWithSystem()');
    expect(src).toContain('prefs.alwaysOnTop()');
    expect(src).toContain('[attr.aria-checked]');
  });

  it('explains each switch and the mini widget', () => {
    const src = readFileSync(SOURCE, 'utf8');
    // Three <app-info-tip> explainers: start-with-system, always-on-top, widget.
    expect((src.match(/<app-info-tip/g) ?? []).length).toBe(3);
    expect(src).toContain('startHelp');
    expect(src).toContain('onTopHelp');
    expect(src).toContain('miniHelp');
    expect(src).toContain('mini widget');
  });

  it('surfaces failures and the browser fallback message', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('prefs.error()');
    expect(src).toContain('role="alert"');
    expect(src).toContain('!prefs.isDesktopApp');
  });
});
