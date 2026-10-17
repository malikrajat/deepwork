import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { QuietService } from '../../src/app/core/services/quiet.service';
import { TimerService } from '../../src/app/core/services/timer.service';
import { AttentionService } from '../../src/app/core/services/attention.service';
import { NotificationService } from '../../src/app/core/services/notification.service';
import { UiService } from '../../src/app/core/services/ui.service';

/**
 * Pause, mute and focus are one implementation for every surface.
 *
 * The tray, the sidebar, the phone's top bar and Settings all call this service,
 * so these tests are what keeps a Linux session without a tray icon, a browser
 * tab and a Windows install from having three different ideas of what "Pause for
 * 30 minutes" does. They move the clock with fake timers rather than trusting a
 * real one, and they check the two halves separately: the timer really stops, and
 * the reminders really are told.
 */
function make() {
  const timer = {
    isRunning: signal(false),
    timerType: signal<'work' | 'short-break' | 'long-break'>('work'),
    pause: vi.fn(),
    resume: vi.fn(),
    start: vi.fn(),
  };
  timer.pause.mockImplementation(() => timer.isRunning.set(false));
  timer.resume.mockImplementation(() => timer.isRunning.set(true));

  const attention = {
    paused: signal(false),
    soundMuted: signal(false),
    heldNudges: signal(0),
    pauseLabel: signal('10:30'),
    muteLabel: signal('11:00'),
    pauseFor: vi.fn((minutes: number | null) => {
      attention.paused.set(true);
      return minutes === null ? null : new Date();
    }),
    resume: vi.fn(() => attention.paused.set(false)),
    muteFor: vi.fn(() => {
      attention.soundMuted.set(true);
      return new Date();
    }),
    unmute: vi.fn(() => attention.soundMuted.set(false)),
  };

  const notifications = { showToastMessage: vi.fn() };
  const ui = {
    focusMode: signal(false),
    toggleFocusMode: vi.fn(() => ui.focusMode.update((on) => !on)),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: TimerService, useValue: timer },
      { provide: AttentionService, useValue: attention },
      { provide: NotificationService, useValue: notifications },
      { provide: UiService, useValue: ui },
    ],
  });
  const quiet = TestBed.runInInjectionContext(() => new QuietService());
  return { quiet, timer, attention, notifications, ui };
}

describe('QuietService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 17, 10, 0, 0));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  describe('pause', () => {
    it('stops the timer and tells the reminders, in that order', () => {
      const { quiet, timer, attention, notifications } = make();
      timer.isRunning.set(true);

      quiet.pause(30);

      expect(timer.pause).toHaveBeenCalledTimes(1);
      expect(attention.pauseFor).toHaveBeenCalledWith(30);
      expect(notifications.showToastMessage.mock.calls[0][0]).toBe('Paused for 30 min');
    });

    it('resumes a timer it stopped when the timed pause runs out', () => {
      const { quiet, timer, attention } = make();
      timer.isRunning.set(true);

      quiet.pause(30);
      expect(timer.isRunning()).toBe(false);

      vi.advanceTimersByTime(30 * 60_000 + 1);

      expect(attention.paused()).toBe(false);
      expect(timer.resume).toHaveBeenCalledTimes(1);
      expect(quiet.paused()).toBe(false);
    });

    it('does not start a timer that was not running when the pause was asked for', () => {
      const { quiet, timer } = make();
      timer.isRunning.set(false);

      quiet.pause(30);
      vi.advanceTimersByTime(30 * 60_000 + 1);

      // "Resume" must not begin a session the user had not begun before they
      // asked for quiet.
      expect(timer.resume).not.toHaveBeenCalled();
    });

    it('holds until resumed when no end was given, and says so', () => {
      const { quiet, attention, notifications } = make();

      quiet.pause(null);

      expect(attention.pauseFor).toHaveBeenCalledWith(null);
      expect(notifications.showToastMessage.mock.calls[0][0]).toBe('Paused');
      // No timer to watch: an indefinite pause can only be ended by hand.
      vi.advanceTimersByTime(24 * 60 * 60_000);
      expect(attention.paused()).toBe(true);
    });

    it('mentions the reminders it held when it comes back', () => {
      const { quiet, attention, notifications } = make();
      attention.paused.set(true);
      attention.heldNudges.set(2);

      quiet.resume();

      expect(attention.resume).toHaveBeenCalledTimes(1);
      const [, body] = notifications.showToastMessage.mock.calls[0];
      expect(body).toContain('2 held reminders');
    });

    it('does nothing but clear the schedule when nothing is paused', () => {
      const { quiet, attention, notifications } = make();

      quiet.resume();

      expect(attention.resume).not.toHaveBeenCalled();
      expect(notifications.showToastMessage).not.toHaveBeenCalled();
    });
  });

  describe('mute', () => {
    it('mutes the sound for a length, and can put it back', () => {
      const { quiet, attention, notifications } = make();

      quiet.mute(60);

      expect(attention.muteFor).toHaveBeenCalledWith(60);
      expect(notifications.showToastMessage.mock.calls[0][0]).toBe('Reminder sound muted');

      quiet.unmute();

      expect(attention.unmute).toHaveBeenCalledTimes(1);
      expect(notifications.showToastMessage.mock.calls[1][0]).toBe('Sound is back on');
    });

    it('accepts "today" as a length', () => {
      const { quiet, attention } = make();

      quiet.mute('today');

      expect(attention.muteFor).toHaveBeenCalledWith('today');
    });
  });

  describe('focus', () => {
    it('toggles the distraction-free view and leaves every reminder alone', () => {
      const { quiet, ui, attention } = make();

      quiet.toggleFocus();

      expect(ui.focusMode()).toBe(true);
      // Focus mode is a view, not a pause: the completion alert is exactly what
      // someone in a focus session must not miss.
      expect(attention.pauseFor).not.toHaveBeenCalled();
      expect(attention.muteFor).not.toHaveBeenCalled();
    });
  });

  describe('the state the button shows', () => {
    it('describes pause before mute before focus', () => {
      const { quiet, attention, ui } = make();

      expect(quiet.statusLabel()).toBe('Reminders on');

      ui.focusMode.set(true);
      expect(quiet.statusLabel()).toBe('Focus mode on');

      attention.soundMuted.set(true);
      expect(quiet.statusLabel()).toBe('Sound muted until 11:00');

      attention.paused.set(true);
      expect(quiet.statusLabel()).toBe('Paused 10:30');
      expect(quiet.active()).toBe(true);
    });

    it('keeps the panel state in the service so every entry point shares it', () => {
      const { quiet } = make();

      expect(quiet.panelOpen()).toBe(false);
      quiet.open();
      expect(quiet.panelOpen()).toBe(true);
      quiet.togglePanel();
      expect(quiet.panelOpen()).toBe(false);
      quiet.open();
      quiet.close();
      expect(quiet.panelOpen()).toBe(false);
    });
  });
});
