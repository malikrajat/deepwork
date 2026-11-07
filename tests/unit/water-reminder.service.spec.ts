import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { WaterReminderService } from '../../src/app/core/services/water-reminder.service';
import { WaterService } from '../../src/app/core/services/water.service';
import { NotificationService } from '../../src/app/core/services/notification.service';
import { AttentionService } from '../../src/app/core/services/attention.service';
import { SettingsService } from '../../src/app/core/services/settings.service';
import { UiService } from '../../src/app/core/services/ui.service';
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
  let miniMode: WritableSignal<boolean>;
  /** Walks a small fake deck, so two reminders never quote the same line. */
  let quoteCursor = 0;
  const notifications = {
    announce: vi.fn(async () => true),
    nextQuote: vi.fn(() => `water line ${(quoteCursor += 1)}`),
    chime: vi.fn(),
    init: vi.fn(),
    // True only where the OS notification can carry buttons and report a press
    // (a Windows desktop). The suite opts into it per test; the default is the
    // plugin/browser surface, which cannot.
    canAnswerOnNotification: false,
    // The notification's own two buttons. `start` wires them to `answerNudge`,
    // and the test that presses one reads the handler back off this mock.
    onToastAction: vi.fn((_tag: string, _handler: (action: string) => void) => () => undefined),
    // A crossed toast. The handler is what starts the three-minute re-ask.
    onToastDismissed: vi.fn((_tag: string, _handler: () => void) => () => undefined),
    // Present so the suite can prove the water feature never borrows the
    // Pomodoro's toast.
    fireTimerComplete: vi.fn(async () => undefined),
    showToastMessage: vi.fn(),
    // The notification is taken down once the question has an answer.
    dismissSystemNotification: vi.fn(async () => undefined),
    dismiss: vi.fn(),
  };
  const water = {
    ensureToday: vi.fn(async () => undefined),
    log: vi.fn(async () => undefined),
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
        { provide: UiService, useValue: { isMiniMode: miniMode } },
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
    miniMode = signal(false);
    quoteCursor = 0;
    notifications.announce.mockClear();
    notifications.nextQuote.mockClear();
    notifications.chime.mockClear();
    notifications.onToastAction.mockClear();
    notifications.onToastDismissed.mockClear();
    notifications.fireTimerComplete.mockClear();
    notifications.showToastMessage.mockClear();
    notifications.dismissSystemNotification.mockClear();
    // A test that opts into the desktop's buttons must not leave them on for the
    // next one: most of the suite is the fallback surface, which has none.
    notifications.canAnswerOnNotification = false;
    notifications.announce.mockResolvedValue(true);
    water.ensureToday.mockClear();
    water.log.mockClear();
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

      // The card is up, so the cadence is held by the answer rather than by the
      // clock: the next reminder follows the moment it is answered.
      expect(service.nudge()).not.toBeNull();
      expect(service.nextAt()).toBeNull();

      await service.answerNudge('no', at(11, 0));
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

    it('does not remind on the doorstep after the app was away', async () => {
      // The reminder had been running, the app was closed (or the machine was
      // shut down) and the whole interval went by. The clock measures time at
      // the desk, so the absence does not count and opening the app waits a
      // full interval — it does not ask for water the moment it appears.
      const restarted = build();
      // No heartbeat to go by, as if the store predated this rule: all of the
      // gap counts as time away.
      localStorage.setItem('deepwork.water.lastFired.v1', at(9, 0).toISOString());
      localStorage.removeItem('deepwork.water.lastAlive.v1');

      await restarted.tick(at(17, 0));

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(formatClockTime(restarted.nextAt()!)).toBe('18:00');
    });

    it('pauses the clock for exactly the time the app was not running', async () => {
      // A reminder at 10:00, the app ran on until 10:20 (the heartbeat), then it
      // was closed and reopened at 10:40: the 20 minutes at the desk count, the
      // 20 minutes away do not, so the next reminder is at 11:20 rather than at
      // 11:00 — which is what the app would have asked had it been running.
      const restarted = build();
      localStorage.setItem('deepwork.water.lastFired.v1', at(10, 0).toISOString());
      localStorage.setItem('deepwork.water.lastAlive.v1', at(10, 20).toISOString());

      await restarted.tick(at(10, 40));

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(formatClockTime(restarted.nextAt()!)).toBe('11:20');
    });

    it('starts today afresh instead of carrying yesterday’s cadence', async () => {
      // The report: the app was shut down for the night and the first launch in
      // the morning asked for water immediately, because the previous day's
      // reminder was already overdue. A new day starts its own interval.
      const restarted = build();
      localStorage.setItem('deepwork.water.lastFired.v1', at(17, 0, 26).toISOString());
      localStorage.setItem('deepwork.water.lastAlive.v1', at(18, 0, 26).toISOString());

      await restarted.tick(at(9, 0, 27));

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(formatClockTime(restarted.nextAt()!)).toBe('10:00');
    });

    it('restarts from now when the folded cadence is already overdue', async () => {
      // The app was running at 11:00 but the last reminder was at 9:00 — a
      // pause, a quiet stretch, a switch that was off. Folding only the 30
      // minutes away would leave the reminder due at 10:30, in the past, and it
      // would fire on the doorstep. A launch starts the cadence from now.
      const restarted = build();
      localStorage.setItem('deepwork.water.lastFired.v1', at(9, 0).toISOString());
      localStorage.setItem('deepwork.water.lastAlive.v1', at(11, 0).toISOString());

      await restarted.tick(at(11, 30));

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(formatClockTime(restarted.nextAt()!)).toBe('12:30');
    });

    it('still reminds a full interval after the app comes back', async () => {
      // The same restart, but this time the loop is run on: the cadence fires
      // on the shifted schedule rather than being lost.
      const restarted = build();
      localStorage.setItem('deepwork.water.lastFired.v1', at(10, 0).toISOString());
      localStorage.setItem('deepwork.water.lastAlive.v1', at(10, 20).toISOString());

      await restarted.tick(at(10, 40));
      await restarted.tick(at(11, 20));

      expect(notifications.announce).toHaveBeenCalledTimes(1);
    });

    it('does nothing at all while the switch is off', async () => {
      const off = build({ waterReminders: false });

      await off.tick(at(10, 0));

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(off.nextAt()).toBeNull();
      expect(off.status()).toBe('Water reminders are off');
    });

    it('stops for a pause, and restarts a full interval after it', async () => {
      // The tray's pause is "none of this for a while"; a water reminder that
      // ignored it would be the one nudge still arriving through a pause.
      const attention = TestBed.inject(AttentionService);
      attention.pauseFor(null);

      await service.tick(at(10, 0));
      expect(notifications.announce).not.toHaveBeenCalled();

      attention.resume();
      await service.tick(at(10, 1));
      // The cadence moved forward while it was paused, so the first reminder is
      // a full interval from the pause rather than the one that was overdue.
      expect(formatClockTime(service.nextAt()!)).toBe('11:00');
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
      // A test is a real reminder: it raises the card, and the cadence restarts
      // from the answer to it.
      expect(service.nudge()).not.toBeNull();
      expect(service.nextAt()).toBeNull();

      await service.answerNudge('no', at(9, 30));
      expect(service.nextAt()).not.toBeNull();
    });

    it('describes the next reminder for the dashboard', async () => {
      await service.tick(at(10, 0));
      expect(service.status()).toBe('Next reminder at 11:00');

      await service.tick(at(20, 0));
      expect(service.status()).toBe('Paused — back at 09:00');
    });
  });

  describe('the question it asks', () => {
    it('raises a card that has to be answered, with a quote on it', async () => {
      await service.tick(at(10, 0));
      await service.tick(at(11, 0));

      const nudge = service.nudge();
      expect(nudge).not.toBeNull();
      expect(nudge!.glassLabel).toBe('500 ml');
      expect(nudge!.amountMl).toBe(500);
      expect(nudge!.quote.length).toBeGreaterThan(0);
      // The notification carries the same line, so the quote is not lost on
      // someone who only ever sees the OS popup — and it carries it as a quote,
      // not as the message's last sentence: the toast puts it on a line of its
      // own, and the question is the one post asked to wait on screen.
      const [, body, options] = notifications.announce.mock.calls[0];
      expect(body).not.toContain(nudge!.quote);
      expect(options).toEqual({
        quote: nudge!.quote,
        tag: 'deepwork-water',
        sticky: true,
        // The same two answers the card offers, so the question can be answered
        // where the user is looking rather than by finding the window first.
        actions: [
          { id: 'yes', label: 'Yes, drank' },
          { id: 'no', label: 'Not now' },
        ],
      });
      expect(service.status()).toBe('Waiting for your answer');
    });

    it('rings the alert tone the user chose, and never borrows the Pomodoro toast', async () => {
      await service.tick(at(10, 0));
      await service.tick(at(11, 0));

      expect(notifications.announce).toHaveBeenCalledTimes(1);
      expect(notifications.chime).toHaveBeenCalledTimes(1);
      expect(notifications.fireTimerComplete).not.toHaveBeenCalled();
      expect(notifications.showToastMessage).not.toHaveBeenCalled();
    });

    it('rings nothing while the switch is off, and nothing on a quiet tick', async () => {
      await service.tick(at(10, 0));

      // Arming the next reminder is not an event the user hears.
      expect(notifications.chime).not.toHaveBeenCalled();

      const off = build({ waterReminders: false });
      await off.tick(at(10, 30));
      expect(notifications.chime).not.toHaveBeenCalled();
    });

    it('stays on screen and holds the cadence until it is answered', async () => {
      await service.tick(at(10, 0));
      await service.tick(at(11, 0));
      const first = service.nudge()!.id;

      // Three hours on, with the question still unanswered, there is exactly one
      // card and no second notification — an unanswered question is never buried
      // under a new one.
      await service.tick(at(14, 0));

      expect(service.nudge()!.id).toBe(first);
      expect(notifications.announce).toHaveBeenCalledTimes(1);
      expect(service.nextAt()).toBeNull();
    });

    it('logs one glass at the size in the settings when answered Yes', async () => {
      const small = build({ waterAmountMl: 150 });
      await small.tick(at(10, 0));
      await small.tick(at(11, 0));
      expect(small.nudge()!.glassLabel).toBe('150 ml');

      await small.answerNudge('yes', at(11, 5));

      expect(water.log).toHaveBeenCalledTimes(1);
      expect(water.log).toHaveBeenCalledWith(150);
      expect(small.nudge()).toBeNull();
      expect(formatClockTime(small.nextAt()!)).toBe('12:05');
    });

    it('takes the same two answers from the notification’s own buttons', async () => {
      service.start();
      // The first pass settles before the clock is moved, so the reminder is
      // armed exactly as it is in the app.
      await vi.advanceTimersByTimeAsync(0);
      await service.tick(at(10, 0));
      await service.tick(at(11, 0));

      // One handler, registered under the water reminder's own handle, so a pin
      // prompt's buttons can never log a glass.
      const [tag, press] = notifications.onToastAction.mock.calls[0];
      expect(tag).toBe('deepwork-water');

      press('yes');
      await vi.advanceTimersByTimeAsync(0);

      expect(water.log).toHaveBeenCalledWith(500);
      expect(service.nudge()).toBeNull();
      // The notification asked the same question; once it is answered it is
      // taken down, so it cannot stay on screen asking again.
      expect(notifications.dismissSystemNotification).toHaveBeenCalledWith('deepwork-water');
    });

    it('closes without logging anything when answered Not now', async () => {
      await service.tick(at(10, 0));
      await service.tick(at(11, 0));

      await service.answerNudge('no', at(11, 1));

      expect(water.log).not.toHaveBeenCalled();
      expect(service.nudge()).toBeNull();
      expect(formatClockTime(service.nextAt()!)).toBe('12:01');
    });

    it('walks the quotes so the same line does not come back every hour', async () => {
      await service.tick(at(10, 0));
      await service.tick(at(11, 0));
      const first = service.nudge()!.quote;
      await service.answerNudge('no', at(11, 0));

      await service.tick(at(12, 0));

      expect(service.nudge()!.quote).not.toBe(first);
    });

    it('takes the card back when the reminder is switched off', async () => {
      await service.tick(at(10, 0));
      await service.tick(at(11, 0));
      expect(service.nudge()).not.toBeNull();

      settings.set({ ...settings(), waterReminders: false });
      await service.tick(at(11, 30));

      expect(service.nudge()).toBeNull();
      expect(service.nextAt()).toBeNull();
    });
  });

  /**
   * Crossing the notification is not answering it. The user may swipe it away
   * because they are in the middle of something, so the glass is still not
   * drunk and the question comes back three minutes later — until it is answered.
   */
  describe('when the question is crossed', () => {
    /** Raises a reminder and hands back the dismissal handler `start` registered. */
    async function askedReminder(): Promise<{ nudge: number; dismiss: () => void }> {
      service.start();
      await vi.advanceTimersByTimeAsync(0);
      await service.tick(at(10, 0));
      await service.tick(at(11, 0));

      const dismiss = notifications.onToastDismissed.mock.calls[0]?.[1] as unknown as () => void;
      return { nudge: service.nudge()!.id, dismiss };
    }

    it('asks again three minutes later, and leaves the question open', async () => {
      const { nudge, dismiss } = await askedReminder();
      expect(notifications.announce).toHaveBeenCalledTimes(1);

      dismiss();
      await vi.advanceTimersByTimeAsync(3 * 60_000 - 1);
      expect(notifications.announce).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);

      expect(notifications.announce).toHaveBeenCalledTimes(2);
      expect(water.log).not.toHaveBeenCalled();
      // It is the same question, still waiting: crossing does not close it.
      expect(service.nudge()!.id).toBe(nudge);
      // The re-ask carries the answers too, or it would be a question the
      // desktop cannot answer.
      expect(notifications.announce.mock.calls[1][2]).toMatchObject({
        tag: 'deepwork-water',
        sticky: true,
        actions: [
          { id: 'yes', label: 'Yes, drank' },
          { id: 'no', label: 'Not now' },
        ],
      });
    });

    it('rings again with the re-ask, so a reappearing toast is noticed', async () => {
      const { dismiss } = await askedReminder();
      expect(notifications.chime).toHaveBeenCalledTimes(1);

      dismiss();
      await vi.advanceTimersByTimeAsync(3 * 60_000);

      expect(notifications.chime).toHaveBeenCalledTimes(2);
    });

    it('keeps asking after every crossing until it is answered', async () => {
      const { dismiss } = await askedReminder();

      dismiss();
      await vi.advanceTimersByTimeAsync(3 * 60_000);
      expect(notifications.announce).toHaveBeenCalledTimes(2);

      // The re-posted toast is crossed too.
      dismiss();
      await vi.advanceTimersByTimeAsync(3 * 60_000);
      expect(notifications.announce).toHaveBeenCalledTimes(3);

      await service.answerNudge('yes', at(11, 10));
      dismiss();
      await vi.advanceTimersByTimeAsync(3 * 60_000);

      // Answered: the timer is gone, so the old crossings cannot resurrect it.
      expect(notifications.announce).toHaveBeenCalledTimes(3);
      expect(water.log).toHaveBeenCalledTimes(1);
    });

    it('does not re-ask once the reminder is answered', async () => {
      await askedReminder();

      await service.answerNudge('no', at(11, 5));
      await vi.advanceTimersByTimeAsync(3 * 60_000);

      expect(notifications.announce).toHaveBeenCalledTimes(1);
    });

    it('does not re-ask after the reminder is turned off', async () => {
      const { dismiss } = await askedReminder();

      dismiss();
      settings.set({ ...settings(), waterReminders: false });
      await service.tick(at(11, 1));
      await vi.advanceTimersByTimeAsync(3 * 60_000);

      expect(notifications.announce).toHaveBeenCalledTimes(1);
      expect(service.nudge()).toBeNull();
    });

    it('stays quiet if a pause or a switch-off lands before the re-ask fires', async () => {
      await askedReminder();
      TestBed.inject(AttentionService).pauseFor(null);

      // The timer callback itself checks the state, so even a crossing that
      // slipped in just before the pause cannot speak through it.
      await (service as any).repostNudge();
      expect(notifications.announce).toHaveBeenCalledTimes(1);

      settings.set({ ...settings(), waterReminders: false });
      await (service as any).repostNudge();
      expect(notifications.announce).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * The mini widget is the user saying "I am working elsewhere". A reminder that
   * lands then must not pull the full window back over what they are doing — but
   * it is still a question, and it is asked wherever the user is looking. Where
   * the notification can carry the two answers that is the notification; only a
   * surface that cannot carry them falls back to counting the glass.
   */
  describe('while the window is the mini widget', () => {
    it('asks on the notification, with both answers, instead of counting for the user', async () => {
      // A Windows desktop: the sticky toast reports the press, so the question
      // can live there and the widget can stay exactly where it is. This is the
      // case that used to arrive with no buttons at all.
      miniMode.set(true);
      notifications.canAnswerOnNotification = true;

      await service.tick(at(10, 0));
      await service.tick(at(11, 0));

      expect(water.log).not.toHaveBeenCalled();
      expect(service.nudge()).not.toBeNull();
      const [, , options] = notifications.announce.mock.calls[0];
      expect(options).toMatchObject({
        tag: 'deepwork-water',
        sticky: true,
        actions: [
          { id: 'yes', label: 'Yes, drank' },
          { id: 'no', label: 'Not now' },
        ],
      });
      // The card is hidden in the widget, so the window is not brought forward
      // for it: the notification is the question, and it waits there.
      expect(service.nudge()!.surfaceWindow).toBe(false);
    });

    it('logs the glass when Yes is pressed on the notification', async () => {
      miniMode.set(true);
      notifications.canAnswerOnNotification = true;
      service.start();
      await vi.advanceTimersByTimeAsync(0);
      await service.tick(at(10, 0));
      await service.tick(at(11, 0));

      const [, press] = notifications.onToastAction.mock.calls[0];
      press('yes');
      await vi.advanceTimersByTimeAsync(0);

      expect(water.log).toHaveBeenCalledTimes(1);
      expect(water.log).toHaveBeenCalledWith(500);
      expect(service.nudge()).toBeNull();
      // The question was answered where it was asked; nothing surfaced, so
      // nothing has to be handed back.
    });

    it('brings the card up when the notification could not carry the answers', async () => {
      // The shell refused the toast, or an old build ignored the buttons. The
      // question still has to be answerable, so the window comes back after all.
      miniMode.set(true);
      notifications.canAnswerOnNotification = true;
      notifications.announce.mockResolvedValue(false);

      await service.tick(at(10, 0));
      await service.tick(at(11, 0));

      // Flipping the flag is the service's half: the card's component sees it
      // and is what actually brings the window up.
      expect(service.nudge()!.surfaceWindow).toBe(true);
      expect(water.log).not.toHaveBeenCalled();
    });

    it('counts the glass itself where a notification cannot carry the answers', async () => {
      // The plugin and browser surfaces have no buttons. Asking there would hold
      // the cadence behind a question nobody can answer, so the glass is counted.
      miniMode.set(true);

      await service.tick(at(10, 0));
      await service.tick(at(11, 0));

      expect(water.log).toHaveBeenCalledTimes(1);
      expect(water.log).toHaveBeenCalledWith(500);
      // Nothing is asked, so nothing is waiting for an answer…
      expect(service.nudge()).toBeNull();
      // …and the cadence runs on from the moment it counted.
      expect(formatClockTime(service.nextAt()!)).toBe('12:00');
    });

    it('rings, and says the glass is in the day', async () => {
      miniMode.set(true);

      await service.tick(at(10, 0));
      await service.tick(at(11, 0));

      expect(notifications.chime).toHaveBeenCalledTimes(1);
      const [title, body] = notifications.announce.mock.calls[0];
      expect(title).toContain('500 ml');
      expect(body).toContain('is in today');
      expect(body).toContain('stayed out of the way');
    });

    it('counts the size the settings chose, not a number of its own', async () => {
      miniMode.set(true);
      const small = build({ waterAmountMl: 150 });

      await small.tick(at(10, 0));
      await small.tick(at(11, 0));

      expect(water.log).toHaveBeenCalledWith(150);
    });

    it('asks instead when the user has turned the shortcut off', async () => {
      miniMode.set(true);
      notifications.canAnswerOnNotification = true;
      const asking = build({ waterAutoLogWhenMinimized: false });

      await asking.tick(at(10, 0));
      await asking.tick(at(11, 0));

      expect(water.log).not.toHaveBeenCalled();
      expect(asking.nudge()).not.toBeNull();
      // With the shortcut off the full window is the surface, as it always was.
      expect(asking.nudge()!.surfaceWindow).toBe(true);
    });

    it('never counts a glass for a Test', async () => {
      miniMode.set(true);
      notifications.canAnswerOnNotification = true;

      await service.remindNow();

      expect(water.log).not.toHaveBeenCalled();
      expect(service.nudge()).not.toBeNull();
      expect(service.nudge()!.surfaceWindow).toBe(true);
    });

    it('is asked about, not counted for, once the window is back', async () => {
      miniMode.set(true);
      await service.tick(at(10, 0));

      // The widget is expanded before the reminder comes due.
      miniMode.set(false);
      await service.tick(at(11, 0));

      expect(water.log).not.toHaveBeenCalled();
      expect(service.nudge()).not.toBeNull();
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
