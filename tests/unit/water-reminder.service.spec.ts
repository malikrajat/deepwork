import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { WaterReminderService } from '../../src/app/core/services/water-reminder.service';
import { WaterService } from '../../src/app/core/services/water.service';
import { NotificationService } from '../../src/app/core/services/notification.service';
import { SettingsService } from '../../src/app/core/services/settings.service';
import { AppSettings, DEFAULT_SETTINGS } from '../../src/app/core/models/settings.model';
import { formatClockTime } from '../../src/app/core/utils/water.util';

/**
 * The water reminder: when it is allowed to speak, and — just as important —
 * how much it holds while it waits. Every test here either pins down a decision
 * about the schedule or counts the timers, because "no leak" is a property that
 * has to be asserted, not hoped for.
 */

function at(hours: number, minutes = 0, day = 26): Date {
  return new Date(2026, 8, day, hours, minutes, 0, 0);
}

describe('WaterReminderService', () => {
  let service: WaterReminderService;
  let settings: WritableSignal<AppSettings>;
  let totalMl: WritableSignal<number>;
  let goalReached: WritableSignal<boolean>;
  const notifications = { announce: vi.fn(async () => undefined), init: vi.fn() };
  const water = {
    ensureToday: vi.fn(async () => undefined),
  };

  /** Builds the service with a reminder window and cadence of the caller's choosing. */
  function build(overrides: Partial<AppSettings> = {}): WaterReminderService {
    settings = signal<AppSettings>({
      ...DEFAULT_SETTINGS,
      waterReminders: true,
      waterStart: '09:00',
      waterEnd: '18:00',
      waterIntervalMinutes: 60,
      waterAmountMl: 500,
      waterGoalMl: 2000,
      ...overrides,
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        WaterReminderService,
        { provide: SettingsService, useValue: { settings } },
        { provide: NotificationService, useValue: notifications },
        {
          provide: WaterService,
          useValue: { ...water, totalMl, goalReached },
        },
      ],
    });
    return TestBed.inject(WaterReminderService);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at(9, 0));
    localStorage.clear();
    totalMl = signal(0);
    goalReached = signal(false);
    notifications.announce.mockClear();
    water.ensureToday.mockClear();
    service = build();
  });

  afterEach(() => {
    service.ngOnDestroy();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  describe('when it speaks', () => {
    it('waits a full interval after the user switches it on', async () => {
      await service.tick(at(10, 0));

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(formatClockTime(service.nextAt()!)).toBe('11:00');

      await service.tick(at(10, 59));
      expect(notifications.announce).not.toHaveBeenCalled();

      await service.tick(at(11, 0));
      expect(notifications.announce).toHaveBeenCalledTimes(1);
      expect(formatClockTime(service.nextAt()!)).toBe('12:00');
    });

    it('says nothing at all outside the working hours', async () => {
      await service.tick(at(20, 0));

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(service.inHours()).toBe(false);
      expect(formatClockTime(service.nextAt()!)).toBe('09:00');
    });

    it('leaves the night alone when the window is a night shift', async () => {
      const nightly = build({ waterStart: '22:00', waterEnd: '06:00' });

      await nightly.tick(at(23, 0));
      expect(nightly.nextAt()).not.toBeNull();

      await nightly.tick(at(23, 30));
      // The baseline was 23:00, so the next one is not due until midnight —
      // which is still inside this window, and 23:30 is not there yet.
      expect(notifications.announce).not.toHaveBeenCalled();
    });

    it('fires once when the machine slept through the window', async () => {
      await service.tick(at(9, 0));
      localStorage.setItem('deepwork.water.lastFired.v1', at(9, 0).toISOString());

      const restarted = build();
      await restarted.tick(at(17, 0));

      expect(notifications.announce).toHaveBeenCalledTimes(1);
    });

    it('keeps the cadence across a restart instead of starting over', async () => {
      localStorage.setItem('deepwork.water.lastFired.v1', at(10, 30).toISOString());

      const restarted = build();
      await restarted.tick(at(11, 0));

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(formatClockTime(restarted.nextAt()!)).toBe('11:30');
    });

    it('does nothing at all while the switch is off', async () => {
      const off = build({ waterReminders: false });

      await off.tick(at(10, 0));

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(off.nextAt()).toBeNull();
      expect(off.status()).toBe('Water reminders are off');
    });

    it('asks for reminder hours rather than guessing when they are unreadable', async () => {
      const broken = build({ waterStart: 'soon', waterEnd: '18:00' });

      await broken.tick(at(10, 0));

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(broken.nextAt()).toBeNull();
      expect(broken.status()).toContain('Settings');
    });

    it('starts the cadence fresh when the switch is turned back on', async () => {
      await service.tick(at(10, 0));
      settings.set({ ...settings(), waterReminders: false });
      await service.tick(at(10, 30));

      settings.set({ ...settings(), waterReminders: true });
      await service.tick(at(10, 31));

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(formatClockTime(service.nextAt()!)).toBe('11:31');
    });
  });

  describe('what it says', () => {
    it('uses an OS notification with the glass and the day so far', async () => {
      totalMl.set(1500);
      await service.tick(at(10, 0));
      await service.tick(at(11, 0));

      const [title, body] = notifications.announce.mock.calls[0];
      expect(title).toContain('500 ml');
      expect(body).toContain('1.5 L');
      expect(body).toContain('2 L');
    });

    it('acknowledges a target that is already met', async () => {
      totalMl.set(2000);
      goalReached.set(true);
      await service.tick(at(10, 0));
      await service.tick(at(11, 0));

      expect(notifications.announce.mock.calls[0][1]).toContain('nicely done');
    });

    it('sends one on demand from the Test button', async () => {
      await service.remindNow();

      expect(notifications.announce).toHaveBeenCalledTimes(1);
      expect(notifications.announce.mock.calls[0][1]).toContain('what a water reminder looks like');
      // A test is a real reminder: the cadence restarts from it.
      expect(service.nextAt()).not.toBeNull();
    });

    it('describes the next reminder for the dashboard', async () => {
      await service.tick(at(10, 0));
      expect(service.status()).toBe('Next reminder at 11:00');

      await service.tick(at(20, 0));
      expect(service.status()).toBe('Paused — back at 09:00');
    });
  });

  describe('the loop it holds', () => {
    /**
     * How many times the loop has run.
     *
     * Every tick asks the water service for today's tally first, so counting
     * those calls measures the loop itself — the pending-timer count cannot:
     * jsdom schedules a timer of its own for every `localStorage` write, and
     * this feature writes one. A single loop is a single tick per window, and no
     * loop at all is a call count that never moves.
     */
    const ticks = () => water.ensureToday.mock.calls.length;

    it('runs exactly one loop, however many times it is started', async () => {
      service.start();
      service.start();
      service.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(ticks()).toBe(1);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(ticks()).toBe(2);
    });

    it('does not double up when something asks for a tick by hand', async () => {
      service.start();
      await vi.advanceTimersByTimeAsync(0);

      await service.tick(at(10, 0));
      const before = ticks();
      await vi.advanceTimersByTimeAsync(30_000);

      expect(ticks()).toBe(before + 1);
    });

    it('gives the timer back when it is stopped', async () => {
      service.start();
      await vi.advanceTimersByTimeAsync(0);
      const before = ticks();

      service.stop();
      await vi.advanceTimersByTimeAsync(5 * 60_000);

      expect(ticks()).toBe(before);
    });

    it('gives the timer back when it is destroyed', async () => {
      service.start();
      await vi.advanceTimersByTimeAsync(0);
      const before = ticks();

      service.ngOnDestroy();
      await vi.advanceTimersByTimeAsync(5 * 60_000);

      expect(ticks()).toBe(before);
    });

    it('can be started again after a stop, still with one loop', async () => {
      service.start();
      await vi.advanceTimersByTimeAsync(0);
      service.stop();

      service.start();
      await vi.advanceTimersByTimeAsync(0);
      const before = ticks();
      await vi.advanceTimersByTimeAsync(30_000);

      expect(ticks()).toBe(before + 1);
    });

    it('a stop during a tick still leaves nothing running', async () => {
      service.start();
      await vi.advanceTimersByTimeAsync(0);

      // Stop while the tick is in flight, then let it finish.
      const pending = service.tick(at(10, 0));
      service.stop();
      await pending;

      const before = ticks();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(ticks()).toBe(before);
    });
  });
});
