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
});
