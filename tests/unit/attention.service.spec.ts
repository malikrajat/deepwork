import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AttentionService } from '../../src/app/core/services/attention.service';

/**
 * The gate every reminder asks before it speaks.
 *
 * A timed mute and a pause are ordinary state, but they are state with an end,
 * and the end is the feature: the old mute had none, so it outlived the reason
 * it was turned on. These tests move the clock rather than trusting a timer to
 * be noticed, and they pin down the one rule that matters for the desktop's
 * quiet state: a card is held, and the OS notification is not the app's to hold.
 */

function make(): AttentionService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [AttentionService] });
  return TestBed.inject(AttentionService);
}

describe('AttentionService', () => {
  let service: AttentionService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 17, 10, 0, 0));
    localStorage.clear();
    service = make();
  });

  afterEach(() => {
    service.ngOnDestroy();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  describe('the timed mute', () => {
    it('silences the sound for the length asked for, then puts it back', () => {
      service.muteFor(30);

      expect(service.soundMuted()).toBe(true);
      expect(service.muteLabel()).toBe('10:30');

      vi.advanceTimersByTime(29 * 60_000 + 45_000);
      expect(service.soundMuted()).toBe(true);

      vi.advanceTimersByTime(20_000);
      expect(service.soundMuted()).toBe(false);
      expect(service.muteLabel()).toBe('');
    });

    it('reads a mute that runs past midnight as tomorrow', () => {
      vi.setSystemTime(new Date(2026, 9, 17, 22, 0, 0));

      service.muteFor('today');

      expect(service.soundMuted()).toBe(true);
      expect(service.muteLabel()).toMatch(/^tomorrow 00:00$/);
    });

    it('keeps the mute across a restart, and ends it on time anyway', () => {
      // The mute is remembered, because a restart is not a change of mind; but
      // the memory is an instant, so it still ends when it said it would.
      service.muteFor(60);
      service.ngOnDestroy();

      const restarted = make();
      expect(restarted.soundMuted()).toBe(true);

      vi.advanceTimersByTime(60 * 60_000 + 20_000);
      expect(restarted.soundMuted()).toBe(false);
      restarted.ngOnDestroy();
    });

    it('does not remember a mute that has already run out', () => {
      service.muteFor(30);
      service.ngOnDestroy();

      vi.advanceTimersByTime(31 * 60_000);

      const restarted = make();
      expect(restarted.soundMuted()).toBe(false);
      restarted.ngOnDestroy();
    });

    it('unmutes on request', () => {
      service.muteFor(240);
      expect(service.soundMuted()).toBe(true);

      service.unmute();

      expect(service.soundMuted()).toBe(false);
    });
  });

  describe('the pause', () => {
    it('holds reminders until a timed pause runs out', () => {
      service.pauseFor(10);

      expect(service.paused()).toBe(true);
      expect(service.pauseLabel()).toBe('10:10');

      vi.advanceTimersByTime(10 * 60_000 + 20_000);

      expect(service.paused()).toBe(false);
    });

    it('holds them until resumed when it was asked for without an end', () => {
      service.pauseFor(null);

      expect(service.paused()).toBe(true);
      expect(service.pauseLabel()).toBe('until you resume');

      service.resume();
      expect(service.paused()).toBe(false);
    });

    it('does not turn an indefinite pause into a permanent one across a restart', () => {
      // A pause is for the session it was asked for. One that outlived the app
      // would keep the reminders silent for as long as the user kept opening it,
      // which is the state nobody remembers setting.
      service.pauseFor(null);
      service.ngOnDestroy();

      const restarted = make();
      void restarted.init();

      expect(restarted.paused()).toBe(false);
      restarted.ngOnDestroy();
    });
  });

  describe('the desktop’s quiet state', () => {
    it('is normal on an ordinary desktop', () => {
      expect(service.quietNow()).toBe(false);
    });

    it('holds the card while the desktop is quiet', () => {
      service.quiet.set('quiet');

      expect(service.quietNow()).toBe(true);
    });

    it('treats a fullscreen app and a locked screen as quiet too', () => {
      service.quiet.set('busy');
      expect(service.quietNow()).toBe(true);

      service.quiet.set('away');
      expect(service.quietNow()).toBe(true);

      // An unreadable answer is not quiet: silence on a question nothing could
      // answer is how a reminder feature disappears for good.
      service.quiet.set('unknown');
      expect(service.quietNow()).toBe(false);
    });
  });

  describe('what was held', () => {
    it('counts the reminders that could not be delivered, and empties on release', () => {
      service.holdNudge();
      service.holdNudge();

      expect(service.heldNudges()).toBe(2);
      expect(service.releaseHeld()).toBe(2);
      expect(service.heldNudges()).toBe(0);
    });
  });
});
