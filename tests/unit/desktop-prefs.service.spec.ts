import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DesktopPrefsService } from '../../src/app/core/services/desktop-prefs.service';
import { DbService } from '../../src/app/core/services/db.service';
import { SettingsService } from '../../src/app/core/services/settings.service';
import { AppSettings, DEFAULT_SETTINGS } from '../../src/app/core/models/settings.model';

/**
 * The service only talks to the OS through Tauri's `invoke`, and only when the
 * app runs inside a Tauri shell. Both are faked here so the reconcile/rollback
 * logic can be tested without a window.
 */
const hoisted = vi.hoisted(() => {
  (globalThis as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
  return { invoke: vi.fn() };
});

vi.mock('@tauri-apps/api/core', () => ({ invoke: hoisted.invoke }));

const makeMockDb = () => ({
  init: vi.fn().mockResolvedValue(undefined),
});

/** Minimal stand-in for SettingsService backed by a mutable object. */
const makeMockSettings = (initial: Partial<AppSettings> = {}) => {
  let state: AppSettings = { ...DEFAULT_SETTINGS, ...initial };
  return {
    settings: () => state,
    loadSettings: vi.fn().mockImplementation(async () => undefined),
    saveSettings: vi.fn().mockImplementation(async (next: AppSettings) => {
      state = next;
    }),
    current: () => state,
  };
};

describe('DesktopPrefsService (desktop shell)', () => {
  let svc: DesktopPrefsService;
  let settings: ReturnType<typeof makeMockSettings>;

  const setup = (initial: Partial<AppSettings> = {}) => {
    settings = makeMockSettings(initial);
    TestBed.configureTestingModule({
      providers: [
        DesktopPrefsService,
        { provide: DbService, useValue: makeMockDb() },
        { provide: SettingsService, useValue: settings },
      ],
    });
    svc = TestBed.inject(DesktopPrefsService);
  };

  beforeEach(() => {
    hoisted.invoke.mockReset();
    // Default: the OS reports "startup off", and any window call succeeds.
    hoisted.invoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === 'autostart_is_enabled' ? false : undefined)
    );
  });

  afterEach(() => TestBed.resetTestingModule());

  it('defaults both preferences to off', () => {
    setup();
    expect(svc.startWithSystem()).toBe(false);
    expect(svc.alwaysOnTop()).toBe(false);
    expect(svc.ready()).toBe(false);
  });

  it('detects the desktop shell', () => {
    setup();
    expect(svc.isDesktopApp).toBe(true);
  });

  it('init() reads the real autostart state from the OS', async () => {
    hoisted.invoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === 'autostart_is_enabled' ? true : undefined)
    );
    setup();

    await svc.init();

    expect(hoisted.invoke).toHaveBeenCalledWith('autostart_is_enabled', undefined);
    expect(svc.startWithSystem()).toBe(true);
    expect(svc.ready()).toBe(true);
  });

  it('init() trusts the OS over stale stored state', async () => {
    // The Windows installer can enable startup before the app ever runs, and a
    // user can delete the entry by hand — the OS wins either way.
    hoisted.invoke.mockResolvedValue(false);
    setup({ startWithSystem: true });

    await svc.init();

    expect(svc.startWithSystem()).toBe(false);
    expect(settings.current().startWithSystem).toBe(false);
  });

  it('init() does not rewrite storage when the stored value already matches', async () => {
    hoisted.invoke.mockResolvedValue(false);
    setup({ startWithSystem: false });

    await svc.init();

    expect(settings.saveSettings).not.toHaveBeenCalled();
  });

  it('init() applies the stored always-on-top preference to the window', async () => {
    hoisted.invoke.mockResolvedValue(true);
    setup({ alwaysOnTop: true });

    await svc.init();

    expect(hoisted.invoke).toHaveBeenCalledWith('window_set_always_on_top', { enabled: true });
    expect(svc.alwaysOnTop()).toBe(true);
  });

  it('init() remembers the loaded onboarding flag', async () => {
    setup({ desktopPrefsPrompted: true });
    await svc.init();
    expect(svc.prompted()).toBe(true);
  });

  it('init() is idempotent', async () => {
    setup();
    await svc.init();
    const callsAfterFirst = hoisted.invoke.mock.calls.length;

    await svc.init();

    expect(hoisted.invoke.mock.calls.length).toBe(callsAfterFirst);
  });

  it('setStartWithSystem() writes the OS entry and persists the preference', async () => {
    setup();
    await svc.init();
    hoisted.invoke.mockClear();

    await svc.setStartWithSystem(true);

    expect(hoisted.invoke).toHaveBeenCalledWith('autostart_set_enabled', { enabled: true });
    expect(svc.startWithSystem()).toBe(true);
    expect(settings.current().startWithSystem).toBe(true);
    expect(svc.error()).toBeNull();
  });

  it('setStartWithSystem() is a no-op when the value is unchanged', async () => {
    setup();
    await svc.init();
    hoisted.invoke.mockClear();

    await svc.setStartWithSystem(false);

    expect(hoisted.invoke).not.toHaveBeenCalled();
    expect(settings.saveSettings).not.toHaveBeenCalled();
  });

  it('setStartWithSystem() rolls the switch back when the OS rejects it', async () => {
    setup();
    await svc.init();
    hoisted.invoke.mockRejectedValueOnce('Access denied');

    await svc.setStartWithSystem(true);

    // The switch must never claim a state the OS refused to accept.
    expect(svc.startWithSystem()).toBe(false);
    expect(svc.error()).toBe('Access denied');
    expect(settings.current().startWithSystem).toBe(false);
  });

  it('setAlwaysOnTop() drives the window and persists the preference', async () => {
    setup();
    await svc.init();
    hoisted.invoke.mockClear();

    await svc.setAlwaysOnTop(true);

    expect(hoisted.invoke).toHaveBeenCalledWith('window_set_always_on_top', { enabled: true });
    expect(svc.alwaysOnTop()).toBe(true);
    expect(settings.current().alwaysOnTop).toBe(true);
  });

  it('setAlwaysOnTop() rolls back when the window call fails', async () => {
    setup();
    await svc.init();
    hoisted.invoke.mockRejectedValueOnce(new Error('window gone'));

    await svc.setAlwaysOnTop(true);

    expect(svc.alwaysOnTop()).toBe(false);
    expect(svc.error()).toBe('window gone');
    expect(settings.current().alwaysOnTop).toBe(false);
  });

  it('adoptTrayChange() stores a change the tray already made', async () => {
    setup();
    await svc.init();
    hoisted.invoke.mockClear();

    // Rust flipped the real state before emitting the event, so this must not
    // invoke anything — only remember it.
    await svc.adoptTrayChange('alwaysOnTop', true);

    expect(hoisted.invoke).not.toHaveBeenCalled();
    expect(svc.alwaysOnTop()).toBe(true);
    expect(settings.current().alwaysOnTop).toBe(true);
  });

  it('adoptTrayChange() ignores a repeat of the current value', async () => {
    setup();
    await svc.init();
    settings.saveSettings.mockClear();

    await svc.adoptTrayChange('startWithSystem', false);

    expect(settings.saveSettings).not.toHaveBeenCalled();
  });

  it('reapplyAlwaysOnTop() restores the user preference after the widget', async () => {
    hoisted.invoke.mockResolvedValue(true);
    setup({ alwaysOnTop: true });
    await svc.init();
    hoisted.invoke.mockClear();

    await svc.reapplyAlwaysOnTop();

    expect(hoisted.invoke).toHaveBeenCalledWith('window_set_always_on_top', { enabled: true });
  });

  it('markPrompted() shows the dialog only once', async () => {
    setup();
    await svc.init();

    await svc.markPrompted();
    expect(svc.prompted()).toBe(true);
    expect(settings.current().desktopPrefsPrompted).toBe(true);

    settings.saveSettings.mockClear();
    await svc.markPrompted();
    expect(settings.saveSettings).not.toHaveBeenCalled();
  });

  it('surfaces a friendly message when reading the startup state fails', async () => {
    hoisted.invoke.mockImplementation((cmd: string) =>
      cmd === 'autostart_is_enabled'
        ? Promise.reject(new Error('registry unavailable'))
        : Promise.resolve(undefined)
    );
    setup();

    await svc.init();

    expect(svc.error()).toBe('registry unavailable');
    // Falls back to the stored preference instead of claiming "off".
    expect(svc.startWithSystem()).toBe(false);
    expect(svc.ready()).toBe(true);
  });

  it('init() still resolves when the window rejects the always-on-top call', async () => {
    // init() runs from an APP_INITIALIZER: throwing would stop the app booting.
    hoisted.invoke.mockImplementation((cmd: string) =>
      cmd === 'window_set_always_on_top'
        ? Promise.reject(new Error('no window'))
        : Promise.resolve(false)
    );
    setup({ alwaysOnTop: true });

    await expect(svc.init()).resolves.toBeUndefined();

    expect(svc.ready()).toBe(true);
    expect(svc.error()).toBe('no window');
  });
});
