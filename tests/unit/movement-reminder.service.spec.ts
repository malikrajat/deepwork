import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { MovementReminderService } from '../../src/app/core/services/movement-reminder.service';
import { NotificationService } from '../../src/app/core/services/notification.service';
import { AttentionService } from '../../src/app/core/services/attention.service';
import { SettingsService } from '../../src/app/core/services/settings.service';
import { UiService } from '../../src/app/core/services/ui.service';
import { AppSettings, DEFAULT_SETTINGS } from '../../src/app/core/models/settings.model';
import { formatClockTime } from '../../src/app/core/utils/water.util';

/**
 * The stand-and-walk reminder: when it is allowed to speak, what it asks, and
 * how long it keeps asking. Every test here either pins down a schedule
 * decision, an answer, or the rule that the bell stops the moment the question is
 * answered.
 */

function at(hours: number, minutes = 0, day = 26): Date {
  return new Date(2026, 8, day, hours, minutes, 0, 0);
}

describe('MovementReminderService', () => {
  let service: MovementReminderService;
  let settings: WritableSignal<AppSettings>;
  let miniMode: WritableSignal<boolean>;
  let quoteCursor = 0;

  const notifications = {
    announce: vi.fn(async () => true),
    nextQuote: vi.fn(() => `move line ${(quoteCursor += 1)}`),
    chime: vi.fn(),
    init: vi.fn(),
    canAnswerOnNotification: false,
    onToastAction: vi.fn((_tag: string, _handler: (action: string) => void) => () => undefined),
    dismissSystemNotification: vi.fn(async () => undefined),
  };

  /** Builds the service with a reminder window and cadence of the caller's choosing. */
  function build(overrides: Partial<AppSettings> = {}): MovementReminderService {
    settings = signal<AppSettings>({
      ...DEFAULT_SETTINGS,
      movementReminders: true,
      movementStart: '09:00',
      movementEnd: '18:00',
      movementIntervalMinutes: 45,
      ...overrides,
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        MovementReminderService,
        { provide: SettingsService, useValue: { settings } },
        { provide: NotificationService, useValue: notifications },
        { provide: UiService, useValue: { isMiniMode: miniMode } },
      ],
    });
    return TestBed.inject(MovementReminderService);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at(9, 0));
    localStorage.clear();
    miniMode = signal(false);
    quoteCursor = 0;
    notifications.announce.mockClear();
    notifications.nextQuote.mockClear();
    notifications.chime.mockClear();
    notifications.onToastAction.mockClear();
    notifications.dismissSystemNotification.mockClear();
    notifications.canAnswerOnNotification = false;
    notifications.announce.mockResolvedValue(true);
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
      expect(formatClockTime(service.nextAt()!)).toBe('10:45');

      await service.tick(at(10, 44));
      expect(notifications.announce).not.toHaveBeenCalled();

      await service.tick(at(10, 45));
      expect(notifications.announce).toHaveBeenCalledTimes(1);

      // The card is up, so the cadence is held by the answer rather than by the
      // clock: the next reminder follows the moment it is answered.
      expect(service.nudge()).not.toBeNull();
      expect(service.nextAt()).toBeNull();

      await service.answerNudge('done', at(10, 45));
      expect(formatClockTime(service.nextAt()!)).toBe('11:30');
    });

    it('says nothing outside the working hours', async () => {
      await service.tick(at(20, 0));

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(service.inHours()).toBe(false);
      expect(formatClockTime(service.nextAt()!)).toBe('09:00');
    });

    it('does nothing at all while the switch is off', async () => {
      const off = build({ movementReminders: false });

      await off.tick(at(10, 0));

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(off.nextAt()).toBeNull();
      expect(off.status()).toBe('Stand & walk reminders are off');
    });

    it('stops for a pause, and restarts a full interval after it', async () => {
      const attention = TestBed.inject(AttentionService);
      attention.pauseFor(null);

      await service.tick(at(10, 0));
      expect(notifications.announce).not.toHaveBeenCalled();

      attention.resume();
      await service.tick(at(10, 1));
      expect(formatClockTime(service.nextAt()!)).toBe('10:45');
    });

    it('takes an open question down when the reminder is switched off', async () => {
      await service.tick(at(10, 0));
      await service.tick(at(10, 45));
      expect(service.nudge()).not.toBeNull();

      settings.set({ ...settings(), movementReminders: false });
      await service.tick(at(10, 46));

      expect(service.nudge()).toBeNull();
      expect(service.nextAt()).toBeNull();
      expect(notifications.dismissSystemNotification).toHaveBeenCalledWith('deepwork-move');
    });

    it('does not remind on the doorstep after the app was away', async () => {
      localStorage.setItem('deepwork.movement.lastFired.v1', at(9, 0).toISOString());
      localStorage.removeItem('deepwork.movement.lastAlive.v1');
      const restarted = build();

      await restarted.tick(at(17, 0));

      expect(notifications.announce).not.toHaveBeenCalled();
      // The whole gap counts as time away, so the cadence waits a full interval.
      expect(formatClockTime(restarted.nextAt()!)).toBe('17:45');
    });

    it('starts today afresh instead of carrying yesterday’s cadence', async () => {
      // A reminder from yesterday is not today's debt: the first launch of a new
      // day waits a full interval instead of firing the moment the window opens.
      localStorage.setItem('deepwork.movement.lastFired.v1', at(17, 0, 26).toISOString());
      localStorage.setItem('deepwork.movement.lastAlive.v1', at(18, 0, 26).toISOString());
      const restarted = build();

      await restarted.tick(at(9, 0, 27));

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(formatClockTime(restarted.nextAt()!)).toBe('09:45');
    });
  });

  describe('what it asks', () => {
    it('raises a card with a quote, a walk length and two answers', async () => {
      await service.tick(at(10, 0));
      await service.tick(at(10, 45));

      const nudge = service.nudge();
      expect(nudge).not.toBeNull();
      expect(nudge!.title).toBe('Time to move');
      expect(nudge!.body).toContain('walk for 2 minutes');
      expect(nudge!.walkMinutes).toBe(2);
      expect(nudge!.quote.length).toBeGreaterThan(0);
      expect(nudge!.surfaceWindow).toBe(true);

      const [, , options] = notifications.announce.mock.calls[0];
      expect(options).toEqual({
        quote: nudge!.quote,
        tag: 'deepwork-move',
        sticky: true,
        actions: [
          { id: 'done', label: "I'm up" },
          { id: 'snooze', label: 'Snooze 10 min' },
        ],
      });
      expect(service.status()).toBe('Waiting for your answer');
    });

    it('rings the alert tone when it raises the question', async () => {
      await service.tick(at(10, 0));
      await service.tick(at(10, 45));

      expect(notifications.chime).toHaveBeenCalledTimes(1);
    });

    it('sends one on demand from the Test button', async () => {
      await service.remindNow();

      expect(notifications.announce).toHaveBeenCalledTimes(1);
      expect(notifications.announce.mock.calls[0][0]).toBe('Time to move');
      expect(notifications.announce.mock.calls[0][1]).toContain(
        'what a stand-and-walk reminder looks like',
      );
      expect(service.nudge()).not.toBeNull();
      expect(service.nextAt()).toBeNull();

      await service.answerNudge('snooze', at(9, 0));
      expect(formatClockTime(service.nextAt()!)).toBe('09:10');
    });

    it('describes the next reminder for the dashboard', async () => {
      await service.tick(at(10, 0));
      expect(service.status()).toBe('Next reminder at 10:45');

      await service.tick(at(20, 0));
      expect(service.status()).toBe('Paused — back at 09:00');
    });

    it('walks the quotes so the same line does not come back every time', async () => {
      await service.tick(at(10, 0));
      await service.tick(at(10, 45));
      const first = service.nudge()!.quote;
      await service.answerNudge('done', at(10, 45));

      await service.tick(at(11, 30));

      expect(service.nudge()!.quote).not.toBe(first);
    });
  });

  describe('the answers', () => {
    it('closes the question and takes the notification down on Done', async () => {
      await service.tick(at(10, 0));
      await service.tick(at(10, 45));

      await service.answerNudge('done', at(10, 50));

      expect(service.nudge()).toBeNull();
      expect(notifications.dismissSystemNotification).toHaveBeenCalledWith('deepwork-move');
      expect(formatClockTime(service.nextAt()!)).toBe('11:35');
    });

    it('brings the question back in ten minutes on Snooze', async () => {
      await service.tick(at(10, 0));
      await service.tick(at(10, 45));

      await service.answerNudge('snooze', at(10, 50));

      expect(service.nudge()).toBeNull();
      expect(formatClockTime(service.nextAt()!)).toBe('11:00');

      // The snooze is read by the schedule, not only promised in `nextAt`.
      await service.tick(at(10, 59));
      expect(notifications.announce).toHaveBeenCalledTimes(1);
      await service.tick(at(11, 0));
      expect(notifications.announce).toHaveBeenCalledTimes(2);
      expect(service.nudge()).not.toBeNull();
    });

    it('takes the same two answers from the notification’s own buttons', async () => {
      service.start();
      await vi.advanceTimersByTimeAsync(0);
      await service.tick(at(10, 0));
      await service.tick(at(10, 45));

      const [tag, press] = notifications.onToastAction.mock.calls[0];
      expect(tag).toBe('deepwork-move');

      press('snooze');
      await vi.advanceTimersByTimeAsync(0);

      expect(service.nudge()).toBeNull();
      expect(notifications.dismissSystemNotification).toHaveBeenCalledWith('deepwork-move');
    });
  });

  /**
   * The user asked for the bell to keep ringing until they deal with it. The
   * completion alert is the model: the tone and the notification repeat on the
   * user's own interval, and only an answer stops them.
   */
  describe('the bell that keeps asking', () => {
    it('rings and re-posts on the configured repeat interval', async () => {
      await service.tick(at(10, 0));
      await service.tick(at(10, 45));
      expect(notifications.chime).toHaveBeenCalledTimes(1);
      expect(notifications.announce).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_000);
      await vi.advanceTimersByTimeAsync(0);

      expect(notifications.chime).toHaveBeenCalledTimes(2);
      expect(notifications.announce).toHaveBeenCalledTimes(2);
      expect(notifications.announce.mock.calls[1][2]).toMatchObject({
        tag: 'deepwork-move',
        sticky: true,
        actions: [
          { id: 'done', label: "I'm up" },
          { id: 'snooze', label: 'Snooze 10 min' },
        ],
      });
      // The question is still the same one: a repeat is not a new reminder.
      expect(service.nudge()).not.toBeNull();
    });

    it('stops ringing the moment the question is answered', async () => {
      await service.tick(at(10, 0));
      await service.tick(at(10, 45));

      await service.answerNudge('done', at(10, 46));
      await vi.advanceTimersByTimeAsync(3 * 60_000);

      expect(notifications.chime).toHaveBeenCalledTimes(1);
      expect(notifications.announce).toHaveBeenCalledTimes(1);
    });

    it('does not ring again while the app is paused', async () => {
      await service.tick(at(10, 0));
      await service.tick(at(10, 45));

      TestBed.inject(AttentionService).pauseFor(null);
      await vi.advanceTimersByTimeAsync(2 * 60_000);

      expect(notifications.chime).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * The mini widget is the user saying "I am working elsewhere". Where the
   * notification can carry the answers the question lives there and the window
   * stays put; where it cannot, the card comes forward — a movement break cannot
   * be counted for the user the way a glass of water can.
   */
  describe('while the window is the mini widget', () => {
    it('asks on the notification and leaves the window alone', async () => {
      miniMode.set(true);
      notifications.canAnswerOnNotification = true;

      await service.tick(at(10, 0));
      await service.tick(at(10, 45));

      expect(service.nudge()).not.toBeNull();
      expect(service.nudge()!.surfaceWindow).toBe(false);
    });

    it('brings the card up when the notification cannot carry the answers', async () => {
      miniMode.set(true);
      notifications.canAnswerOnNotification = false;

      await service.tick(at(10, 0));
      await service.tick(at(10, 45));

      expect(service.nudge()).not.toBeNull();
      expect(service.nudge()!.surfaceWindow).toBe(true);
    });
  });

  describe('the loop it holds', () => {
    it('runs exactly one loop, however many times it is started', async () => {
      const tick = vi.spyOn(service, 'tick');
      service.start();
      service.start();
      service.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(tick).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(tick).toHaveBeenCalledTimes(2);
    });

    it('gives the timers back when it is stopped', async () => {
      const tick = vi.spyOn(service, 'tick');
      service.start();
      await vi.advanceTimersByTimeAsync(0);
      const before = tick.mock.calls.length;

      service.stop();
      await vi.advanceTimersByTimeAsync(5 * 60_000);

      expect(tick.mock.calls.length).toBe(before);
    });
  });
});
