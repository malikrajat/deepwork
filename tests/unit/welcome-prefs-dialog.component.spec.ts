import { describe, it, expect, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { signal } from '@angular/core';
import { WelcomePrefsDialogComponent } from '../../src/app/shared/components/welcome-prefs-dialog/welcome-prefs-dialog.component';
import { DesktopPrefsService } from '../../src/app/core/services/desktop-prefs.service';

const makeMockPrefs = (
  options: { ready?: boolean; desktop?: boolean; prompted?: boolean } = {}
) => ({
  isDesktopApp: options.desktop ?? true,
  ready: signal(options.ready ?? true),
  prompted: signal(options.prompted ?? false),
  startWithSystem: signal(false),
  alwaysOnTop: signal(false),
  error: signal<string | null>(null),
  busy: signal(false),
  setStartWithSystem: vi.fn().mockResolvedValue(undefined),
  setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
  markPrompted: vi.fn().mockResolvedValue(undefined),
});

const SOURCE = resolve(
  __dirname,
  '../../src/app/shared/components/welcome-prefs-dialog/welcome-prefs-dialog.component.ts'
);

/**
 * The first-run dialog is the only place a macOS or Linux user is offered the
 * desktop options at all, because their installer formats cannot show a
 * checkbox. It must appear exactly once and never in the browser build.
 *
 * The template is asserted against source rather than rendered: this project
 * mandates signal inputs, which Angular's JIT compiler (the only option under
 * Vitest) cannot resolve — see `timeline-bar.component.spec.ts` for the same
 * documented constraint.
 */
describe('WelcomePrefsDialogComponent', () => {
  let prefs: ReturnType<typeof makeMockPrefs>;
  let dialog: WelcomePrefsDialogComponent;

  const setup = (options: Parameters<typeof makeMockPrefs>[0] = {}) => {
    prefs = makeMockPrefs(options);
    TestBed.configureTestingModule({
      providers: [{ provide: DesktopPrefsService, useValue: prefs }],
    });
    dialog = TestBed.runInInjectionContext(() => new WelcomePrefsDialogComponent());
  };

  afterEach(() => TestBed.resetTestingModule());

  it('stays hidden until preferences have loaded', () => {
    setup({ ready: false });
    expect(dialog.visible()).toBe(false);
  });

  it('shows once preferences are ready and it has not been seen', () => {
    setup({ ready: true, prompted: false });
    expect(dialog.visible()).toBe(true);
  });

  it('never shows after it has been dismissed', () => {
    setup({ ready: true, prompted: true });
    expect(dialog.visible()).toBe(false);
  });

  it('never shows in the browser build', () => {
    setup({ ready: true, desktop: false, prompted: false });
    expect(dialog.visible()).toBe(false);
  });

  it('hides itself as soon as the flag is recorded', async () => {
    setup();
    expect(dialog.visible()).toBe(true);

    // markPrompted() flips the real service flag; mirror that here.
    prefs.prompted.set(true);
    expect(dialog.visible()).toBe(false);
  });

  it('records that it was shown when dismissed', async () => {
    setup();
    await dialog.dismiss();
    expect(prefs.markPrompted).toHaveBeenCalledTimes(1);
  });

  // ── Template contract ─────────────────────────────────────────────────────

  it('hosts the shared preference switches', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('<app-desktop-prefs-panel');
  });

  it('offers the body reminders in the same first-run setup', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('<app-reminder-prefs-panel');
  });

  it('explains the mini widget before the user finds it by accident', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('miniHelp');
    expect(src).toContain('widget-tip');
  });

  it('offers both a neutral and a confirming way out', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('Not now');
    expect(src).toContain('Done');
    expect(src).toContain('document:keydown.escape');
  });

  it('keeps the answers fixed at the foot while the setup scrolls', () => {
    // The dialog grew past a 600px window and its two answers fell off screen.
    // The card is now a column, only the middle scrolls, and the actions are
    // outside that scrolling region so they are always visible.
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('flex-direction: column');
    expect(src).toContain('overflow-y: auto');
    expect(src).toContain('flex: 0 0 auto');

    const body = src.indexOf('class="dialog-body"');
    const actions = src.indexOf('class="dialog-actions"');
    expect(body).toBeGreaterThan(-1);
    expect(actions).toBeGreaterThan(body);
  });

  it('is announced as a modal dialog', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
    expect(src).toContain('aria-labelledby');
  });
});
