import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DesktopPrefsService } from '../../src/app/core/services/desktop-prefs.service';
import { DbService } from '../../src/app/core/services/db.service';
import { SettingsService } from '../../src/app/core/services/settings.service';
import { DEFAULT_SETTINGS } from '../../src/app/core/models/settings.model';

/**
 * Browser / PWA build: there is no window to keep on top and no login item to
 * register, so the service must stay inert and — importantly — must not show the
 * desktop onboarding dialog.
 *
 * This file deliberately does NOT define `__TAURI_INTERNALS__`, which is how the
 * service decides it is running outside a desktop shell.
 */
const makeMockDb = () => ({
  init: vi.fn().mockResolvedValue(undefined),
});

const makeMockSettings = () => ({
  settings: () => ({ ...DEFAULT_SETTINGS }),
  loadSettings: vi.fn().mockResolvedValue(undefined),
  saveSettings: vi.fn().mockResolvedValue(undefined),
});

describe('DesktopPrefsService (browser build)', () => {
  let svc: DesktopPrefsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DesktopPrefsService,
        { provide: DbService, useValue: makeMockDb() },
        { provide: SettingsService, useValue: makeMockSettings() },
      ],
    });
    svc = TestBed.inject(DesktopPrefsService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('reports that it is not the desktop app', () => {
    expect(svc.isDesktopApp).toBe(false);
  });

  it('init() loads without touching any OS state', async () => {
    await svc.init();
    expect(svc.ready()).toBe(true);
    expect(svc.startWithSystem()).toBe(false);
    expect(svc.alwaysOnTop()).toBe(false);
  });

  it('setStartWithSystem() does nothing outside the desktop app', async () => {
    await svc.init();
    await svc.setStartWithSystem(true);
    expect(svc.startWithSystem()).toBe(false);
  });

  it('setAlwaysOnTop() does nothing outside the desktop app', async () => {
    await svc.init();
    await svc.setAlwaysOnTop(true);
    expect(svc.alwaysOnTop()).toBe(false);
  });

  it('still allows the onboarding flag to be recorded', async () => {
    await svc.init();
    await svc.markPrompted();
    expect(svc.prompted()).toBe(true);
  });
});
