import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SettingsService } from '../../src/app/core/services/settings.service';
import { DbService } from '../../src/app/core/services/db.service';
import { DEFAULT_SETTINGS } from '../../src/app/core/models/settings.model';

const makeMockDb = () => ({
  init: vi.fn().mockResolvedValue(undefined),
  getSettings: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
});

describe('SettingsService', () => {
  let svc: SettingsService;
  let mockDb: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    mockDb = makeMockDb();
    TestBed.configureTestingModule({
      providers: [SettingsService, { provide: DbService, useValue: mockDb }],
    });
    svc = TestBed.inject(SettingsService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('initializes signal with DEFAULT_SETTINGS', () => {
    expect(svc.settings().workDuration).toBe(DEFAULT_SETTINGS.workDuration);
    expect(svc.settings().shortBreak).toBe(DEFAULT_SETTINGS.shortBreak);
    expect(svc.settings().longBreak).toBe(DEFAULT_SETTINGS.longBreak);
    expect(svc.settings().sessionsBeforeLongBreak).toBe(DEFAULT_SETTINGS.sessionsBeforeLongBreak);
    expect(svc.settings().notificationSound).toBe(DEFAULT_SETTINGS.notificationSound);
    expect(svc.settings().trayBehavior).toBe(DEFAULT_SETTINGS.trayBehavior);
  });

  it('loadSettings() fetches from db and updates signal', async () => {
    const custom = { ...DEFAULT_SETTINGS, workDuration: 3000 };
    mockDb.getSettings.mockResolvedValueOnce(custom);
    await svc.loadSettings();
    expect(mockDb.getSettings).toHaveBeenCalledTimes(1);
    expect(svc.settings().workDuration).toBe(3000);
  });

  it('loadSettings() does not update signal when db returns null/undefined', async () => {
    mockDb.getSettings.mockResolvedValueOnce(null);
    await svc.loadSettings();
    // signal keeps DEFAULT_SETTINGS value
    expect(svc.settings().workDuration).toBe(DEFAULT_SETTINGS.workDuration);
  });

  it('saveSettings() persists to db and updates signal', async () => {
    const custom = { ...DEFAULT_SETTINGS, notificationSound: 'chime' };
    await svc.saveSettings(custom);
    expect(mockDb.saveSettings).toHaveBeenCalledWith(custom);
    expect(svc.settings().notificationSound).toBe('chime');
  });

  it('updateField() updates a single field and persists', async () => {
    await svc.updateField('workDuration', 2400);
    expect(svc.settings().workDuration).toBe(2400);
    expect(mockDb.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ workDuration: 2400 })
    );
  });

  it('updateField() preserves other fields when updating one', async () => {
    await svc.updateField('notificationSound', 'ding');
    expect(svc.settings().workDuration).toBe(DEFAULT_SETTINGS.workDuration);
    expect(svc.settings().shortBreak).toBe(DEFAULT_SETTINGS.shortBreak);
    expect(svc.settings().notificationSound).toBe('ding');
  });

  it('multiple updateField() calls accumulate changes', async () => {
    await svc.updateField('workDuration', 1800);
    await svc.updateField('shortBreak', 600);
    expect(svc.settings().workDuration).toBe(1800);
    expect(svc.settings().shortBreak).toBe(600);
  });
});
