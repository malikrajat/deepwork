import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { UiService } from '../../src/app/core/services/ui.service';
import { DesktopPrefsService } from '../../src/app/core/services/desktop-prefs.service';

/**
 * The window's frame, driven through the desktop shell.
 *
 * The rule this file exists to hold: **every window keeps its native title bar
 * except the mini widget**, and the app asserts that rather than hoping for it.
 * `ui.service.spec.ts` covers the browser half of the service, where there is no
 * native window at all; here the Tauri window is mocked so the calls the app
 * makes to it can be read back.
 */

/** One window's worth of calls, recorded. */
const hoisted = vi.hoisted(() => {
  const win = {
    setDecorations: vi.fn().mockResolvedValue(undefined),
    setResizable: vi.fn().mockResolvedValue(undefined),
    setMinSize: vi.fn().mockResolvedValue(undefined),
    setSize: vi.fn().mockResolvedValue(undefined),
    setPosition: vi.fn().mockResolvedValue(undefined),
    setFocus: vi.fn().mockResolvedValue(undefined),
    unminimize: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
    show: vi.fn().mockResolvedValue(undefined),
    maximize: vi.fn().mockResolvedValue(undefined),
    setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
    startDragging: vi.fn().mockResolvedValue(undefined),
    onResized: vi.fn().mockResolvedValue(() => undefined),
    outerSize: vi.fn().mockResolvedValue({ width: 1200, height: 800 }),
    outerPosition: vi.fn().mockResolvedValue({ x: 100, y: 100 }),
    scaleFactor: vi.fn().mockResolvedValue(1),
    isMaximized: vi.fn().mockResolvedValue(false),
    isFullscreen: vi.fn().mockResolvedValue(false),
    isDecorated: vi.fn().mockResolvedValue(true),
  };
  return { win, listen: vi.fn().mockResolvedValue(() => undefined) };
});

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => hoisted.win,
  currentMonitor: vi.fn().mockResolvedValue(null),
  monitorFromPoint: vi.fn().mockResolvedValue(null),
  LogicalSize: class {},
}));

vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalSize: class {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
  PhysicalSize: class {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
  PhysicalPosition: class {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
}));

vi.mock('@tauri-apps/api/event', () => ({ listen: hoisted.listen }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));

const makeMockPrefs = () => ({
  reapplyAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
});

/** A Macintosh user agent, so the title-bar inset is claimed. */
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)';

const setUserAgent = (value: string) =>
  Object.defineProperty(globalThis.navigator, 'userAgent', { value, configurable: true });

const frameCalls = () => hoisted.win.setDecorations.mock.calls.map(([value]) => value as boolean);

describe('UiService (desktop window frame)', () => {
  let svc: UiService;

  beforeEach(() => {
    (globalThis as Record<string, unknown>)['__TAURI_INTERNALS__'] = {};
    setUserAgent(MAC_UA);
    vi.clearAllMocks();
    hoisted.win.isDecorated.mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [UiService, { provide: DesktopPrefsService, useValue: makeMockPrefs() }],
    });
    svc = TestBed.inject(UiService);
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__TAURI_INTERNALS__'];
    TestBed.resetTestingModule();
  });

  it('asserts the frame for the window it starts with', async () => {
    await svc.init();

    expect(svc.isTauriEnv).toBe(true);
    expect(hoisted.win.setDecorations).toHaveBeenCalledWith(true);
    expect(hoisted.win.setResizable).toHaveBeenCalledWith(true);
    // The main window's own minimum, back from the widget's 136x76.
    expect(hoisted.win.setMinSize).toHaveBeenCalledWith(expect.objectContaining({ width: 800 }));
  });

  it('takes the frame away for the widget and hands it straight back', async () => {
    await svc.enterMiniMode();
    expect(frameCalls()).toContain(false);
    expect(hoisted.win.setResizable).toHaveBeenCalledWith(false);

    await svc.exitMiniMode();

    // Off for the widget, on again for the full window — and the last word is
    // "decorated", whatever happened in between.
    expect(frameCalls().at(-1)).toBe(true);
    expect(hoisted.win.setResizable).toHaveBeenCalledWith(true);
  });

  it('forces the frame when the window says it has none', async () => {
    // The state macOS can end up in: the desktop layer believes the window is
    // decorated while it has no title bar, and skips a plain request. Toggling it
    // off first is what makes the request act again.
    hoisted.win.isDecorated.mockResolvedValue(false);

    await svc.restoreWindowFrame();

    // Off, then on: the pair is what gets past the desktop layer's cached idea of
    // the window — and the window ends up decorated either way.
    expect(frameCalls().slice(0, 2)).toEqual([false, true]);
    expect(frameCalls().at(-1)).toBe(true);
  });

  it('leaves a window that is already decorated alone', async () => {
    await svc.restoreWindowFrame();

    expect(frameCalls()).toEqual([true]);
  });

  it('reserves the native title bar only on a Mac, and only for the full window', async () => {
    await svc.init();
    expect(document.documentElement.classList.contains('macos-native-frame')).toBe(true);

    await svc.enterMiniMode();
    expect(document.documentElement.classList.contains('macos-native-frame')).toBe(false);

    await svc.exitMiniMode();
    expect(document.documentElement.classList.contains('macos-native-frame')).toBe(true);
  });

  it('reserves nothing on Windows, where the webview sits below the frame', async () => {
    TestBed.resetTestingModule();
    setUserAgent(WINDOWS_UA);
    TestBed.configureTestingModule({
      providers: [UiService, { provide: DesktopPrefsService, useValue: makeMockPrefs() }],
    });
    const windows = TestBed.inject(UiService);

    await windows.restoreWindowFrame();

    expect(document.documentElement.classList.contains('macos-native-frame')).toBe(false);
  });
});
