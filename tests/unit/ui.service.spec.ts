import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { UiService } from '../../src/app/core/services/ui.service';
import { DesktopPrefsService } from '../../src/app/core/services/desktop-prefs.service';

const makeMockPrefs = () => ({
  reapplyAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
});

describe('UiService (behavior)', () => {
  let svc: UiService;
  let mockPrefs: ReturnType<typeof makeMockPrefs>;

  beforeEach(() => {
    mockPrefs = makeMockPrefs();
    TestBed.configureTestingModule({
      providers: [UiService, { provide: DesktopPrefsService, useValue: mockPrefs }],
    });
    svc = TestBed.inject(UiService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('defaults to focusMode false and toggles correctly', () => {
    expect(svc.focusMode()).toBe(false);
    svc.toggleFocusMode();
    expect(svc.focusMode()).toBe(true);
    svc.toggleFocusMode();
    expect(svc.focusMode()).toBe(false);
  });

  it('enterFocusMode and exitFocusMode set state explicitly', () => {
    svc.enterFocusMode();
    expect(svc.focusMode()).toBe(true);
    svc.exitFocusMode();
    expect(svc.focusMode()).toBe(false);
  });

  it('starts outside mini mode', () => {
    expect(svc.isMiniMode()).toBe(false);
  });

  it('only calls itself the native widget inside the desktop shell', () => {
    // In the browser the mini mode is a floating panel over the running app, so
    // the app shell must keep rendering.
    expect(svc.isNativeWidget()).toBe(false);
    svc.isMiniMode.set(true);
    expect(svc.isNativeWidget()).toBe(false);
  });

  it('init() is inert outside the desktop shell', async () => {
    await svc.init();
    expect(svc.isMiniMode()).toBe(false);
  });

  it('enterMiniMode flips the mini flag even without a desktop shell', async () => {
    // jsdom has no __TAURI_INTERNALS__, so this exercises the browser path:
    // the UI still switches to the floating-clock rendering.
    expect(svc.isTauriEnv).toBe(false);
    await svc.enterMiniMode();
    expect(svc.isMiniMode()).toBe(true);
  });

  it('exitMiniMode flips the mini flag back', async () => {
    await svc.enterMiniMode();
    await svc.exitMiniMode();
    expect(svc.isMiniMode()).toBe(false);
  });

  it('does not touch the native window outside the desktop app', async () => {
    // No Tauri runtime means no window to resize, and in particular the stored
    // always-on-top preference must not be reapplied against a missing window.
    await svc.enterMiniMode();
    await svc.exitMiniMode();
    expect(mockPrefs.reapplyAlwaysOnTop).not.toHaveBeenCalled();
  });

  it('brings the full window back before a water nudge is asked', async () => {
    // The nudge is a question, and the widget has no room for one: the widget is
    // left first, whether or not there is a native window to raise.
    svc.isMiniMode.set(true);

    await svc.surfaceForNudge();

    expect(svc.isMiniMode()).toBe(false);
    expect(mockPrefs.reapplyAlwaysOnTop).not.toHaveBeenCalled();
  });

  it('leaves the window alone when there is no desktop shell to raise', async () => {
    await svc.surfaceForNudge();
    await svc.releaseNudgeSurface();

    expect(svc.isMiniMode()).toBe(false);
    expect(mockPrefs.reapplyAlwaysOnTop).not.toHaveBeenCalled();
  });

  /**
   * Every window except the widget keeps its native title bar, and this is the
   * call that guarantees it: at startup, on the way out of the widget, and when
   * the tray hands the app back.
   */
  it('can restore the full window frame, and does nothing outside the desktop app', async () => {
    await svc.restoreWindowFrame();

    // No Tauri runtime means no window to decorate — and in particular no stored
    // preference may be reapplied against a missing window.
    expect(mockPrefs.reapplyAlwaysOnTop).not.toHaveBeenCalled();
  });

  it('claims no macOS title-bar strip in a browser', async () => {
    // jsdom is not a Mac in the desktop shell, so the shell is left alone; the
    // class is what reserves the traffic lights' room on a real Mac.
    await svc.restoreWindowFrame();
    expect(document.documentElement.classList.contains('macos-native-frame')).toBe(false);

    await svc.enterMiniMode();
    expect(document.documentElement.classList.contains('macos-native-frame')).toBe(false);

    await svc.exitMiniMode();
    expect(document.documentElement.classList.contains('macos-native-frame')).toBe(false);
  });

  it('asks for the full window frame only where there is a native window', async () => {
    // The desktop half of this lives in `ui.service.desktop.spec.ts`, where the
    // Tauri window is mocked. Here there is none, so the call has to be inert
    // rather than throwing on a missing window.
    svc.isMiniMode.set(true);
    await svc.restoreWindowFrame();

    expect(mockPrefs.reapplyAlwaysOnTop).not.toHaveBeenCalled();
  });
});
