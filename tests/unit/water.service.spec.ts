import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { WaterService } from '../../src/app/core/services/water.service';
import { DbService } from '../../src/app/core/services/db.service';
import { SettingsService } from '../../src/app/core/services/settings.service';
import { AppSettings, DEFAULT_SETTINGS } from '../../src/app/core/models/settings.model';
import { WaterEntry } from '../../src/app/core/models/water.model';
import { localDayStart } from '../../src/app/core/utils/water.util';

/**
 * Today's water: the tally is what the dashboard shows and what the reminder
 * quotes, so how it adds up — and what it does when the day turns over — is
 * worth holding still.
 */

function entry(amountMl: number, minutesAgo = 0): WaterEntry {
  return {
    id: `entry-${amountMl}-${minutesAgo}`,
    amountMl,
    loggedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  };
}

describe('WaterService', () => {
  let service: WaterService;
  let stored: WaterEntry[];
  let settings: WritableSignal<AppSettings>;
  const db = {
    getWaterIntakeSince: vi.fn(async (since: string) =>
      stored.filter((row) => row.loggedAt >= since),
    ),
    addWaterEntry: vi.fn(async (row: WaterEntry) => {
      stored.push(row);
    }),
    deleteWaterEntry: vi.fn(async (id: string) => {
      stored = stored.filter((row) => row.id !== id);
    }),
  };

  function build(overrides: Partial<typeof DEFAULT_SETTINGS> = {}): WaterService {
    settings = signal<AppSettings>({
      ...DEFAULT_SETTINGS,
      waterGoalMl: 2000,
      waterAmountMl: 500,
      ...overrides,
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        WaterService,
        { provide: DbService, useValue: db },
        { provide: SettingsService, useValue: { settings } },
      ],
    });
    return TestBed.inject(WaterService);
  }

  beforeEach(() => {
    stored = [];
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 26, 10, 0, 0));
    service = build();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  describe('reading today', () => {
    it('asks the database for the drinks logged since local midnight', async () => {
      stored = [entry(500, 60), entry(250, 10)];

      await service.load();

      expect(db.getWaterIntakeSince).toHaveBeenCalledWith(localDayStart().toISOString());
      expect(service.totalMl()).toBe(750);
      expect(service.drinkCount()).toBe(2);
      expect(service.loaded()).toBe(true);
    });

    it('replaces what it held, so a reload cannot double the day', async () => {
      stored = [entry(500, 60)];
      await service.load();
      await service.load();

      expect(service.totalMl()).toBe(500);
    });

    it('starts the day over when the calendar day has moved on', async () => {
      stored = [entry(500, 60)];
      await service.load();
      expect(service.totalMl()).toBe(500);

      // Midnight passed while the app was open: yesterday's drinks are gone.
      vi.setSystemTime(new Date(2026, 8, 27, 9, 0, 0));
      stored = [];
      await service.ensureToday();

      expect(service.totalMl()).toBe(0);

      // …and a second call the same day does not ask again.
      db.getWaterIntakeSince.mockClear();
      await service.ensureToday();
      expect(db.getWaterIntakeSince).not.toHaveBeenCalled();
    });
  });

  describe('logging a drink', () => {
    it('uses the glass size the user chose when no amount is given', async () => {
      await service.log();

      expect(db.addWaterEntry).toHaveBeenCalledTimes(1);
      expect(service.totalMl()).toBe(500);
      expect(service.entries()).toHaveLength(1);
    });

    it('takes an explicit amount', async () => {
      await service.log(250);

      expect(service.totalMl()).toBe(250);
    });

    it('ignores an amount that is not a drink', async () => {
      await service.log(0);
      await service.log(-250);

      expect(db.addWaterEntry).not.toHaveBeenCalled();
      expect(service.entries()).toHaveLength(0);
    });

    it('does not hold a drink the database refused', async () => {
      db.addWaterEntry.mockRejectedValueOnce(new Error('disk is full'));

      await expect(service.log(500)).rejects.toThrow('disk is full');
      expect(service.entries()).toHaveLength(0);
    });
  });

  describe('undoing one', () => {
    it('removes the last drink and nothing else', async () => {
      await service.log(250);
      await service.log(500);

      await service.undoLast();

      expect(db.deleteWaterEntry).toHaveBeenCalledTimes(1);
      expect(service.totalMl()).toBe(250);
    });

    it('does nothing at all on an empty day', async () => {
      await service.undoLast();

      expect(db.deleteWaterEntry).not.toHaveBeenCalled();
    });
  });

  describe('the day against its target', () => {
    it('counts up, and stops counting at the target', async () => {
      await service.log(1500);
      expect(service.percent()).toBe(75);
      expect(service.remainingMl()).toBe(500);
      expect(service.goalReached()).toBe(false);

      await service.log(1000);
      expect(service.percent()).toBe(100);
      expect(service.remainingMl()).toBe(0);
      expect(service.goalReached()).toBe(true);
    });

    it('is not "reached" on a day where nothing has been drunk', () => {
      expect(service.goalReached()).toBe(false);
      expect(service.percent()).toBe(0);
    });

    it('reports when the last drink was, or nothing at all', async () => {
      expect(service.lastAt()).toBeNull();

      const justNow = new Date().toISOString();
      stored = [{ id: 'a', amountMl: 500, loggedAt: justNow }];
      await service.load();

      expect(service.lastAt()).toBe(justNow);
    });

    it('follows the target when the user changes it', async () => {
      await service.log(1000);
      expect(service.percent()).toBe(50);

      settings.set({ ...DEFAULT_SETTINGS, waterGoalMl: 3000 });
      expect(service.percent()).toBe(33);
    });
  });
});
