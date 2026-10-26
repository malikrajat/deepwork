import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { ReminderService } from '../../src/app/core/services/reminder.service';
import { NotificationService } from '../../src/app/core/services/notification.service';
import { AttentionService } from '../../src/app/core/services/attention.service';
import { REMINDER_REASK_MS } from '../../src/app/core/constants/reminder.constants';

/** A fixed local moment, so nothing here depends on the machine's clock. */
function at(hours: number, minutes = 0, day = 19): Date {
  return new Date(2026, 9, day, hours, minutes, 0, 0);
}

describe('ReminderService', () => {
  let service: ReminderService;
  let paused: WritableSignal<boolean>;
  let actionHandler: ((action: string) => void) | null;
  let dismissHandler: (() => void) | null;

  const notifications = {
    announce: vi.fn(async () => true),
    nextQuote: vi.fn(() => 'a line for the thing that matters'),
    chime: vi.fn(),
    dismissSystemNotification: vi.fn(async () => undefined),
    onToastAction: vi.fn((_tag: string, handler: (action: string) => void) => {
      actionHandler = handler;
      return () => undefined;
    }),
    onToastDismissed: vi.fn((_tag: string, handler: () => void) => {
      dismissHandler = handler;
      return () => undefined;
    }),
  };

  function build(): ReminderService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ReminderService,
        { provide: NotificationService, useValue: notifications },
        { provide: AttentionService, useValue: { paused } },
      ],
    });
    return TestBed.inject(ReminderService);
  }

  /** Writes a reminder that is already due at `now`, without going through the form. */
  async function standUp(now: Date, title = 'Presentation'): Promise<string> {
    const reminder = service.create(
      { title, dueAt: new Date(now.getTime() - 60_000), rhythm: 'insistent' },
      new Date(now.getTime() - 120_000),
    );
    await service.tick(now);
    return reminder.id;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at(9, 0));
    localStorage.clear();
    paused = signal(false);
    actionHandler = null;
    dismissHandler = null;
    notifications.announce.mockClear();
    notifications.announce.mockResolvedValue(true);
    notifications.chime.mockClear();
    notifications.dismissSystemNotification.mockClear();
    notifications.onToastAction.mockClear();
    notifications.onToastDismissed.mockClear();
    service = build();
  });

  afterEach(() => {
    service.stop();
    TestBed.resetTestingModule();
    vi.useRealTimers();
    localStorage.clear();
  });

  describe('when it speaks', () => {
    it('does nothing before the moment arrives', async () => {
      service.create({ title: 'Presentation', dueAt: at(15, 0), rhythm: 'steady' }, at(9, 0));

      await service.tick(at(14, 58));

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(service.active()).toBeNull();
      expect(service.status()).toBe('Next in 2 min');
    });

    it('raises a due reminder once, with the tone and the sticky question', async () => {
      const id = await standUp(at(9, 0));

      expect(service.active()?.id).toBe(id);
      expect(service.standing()).toHaveLength(1);
      expect(notifications.chime).toHaveBeenCalledTimes(1);
      expect(notifications.announce).toHaveBeenCalledTimes(1);
      expect(notifications.announce).toHaveBeenCalledWith(
        'Presentation',
        'It is time.',
        expect.objectContaining({
          tag: ReminderService.NOTIFICATION_TAG,
          sticky: true,
          actions: ReminderService.ACTIONS,
        }),
      );
    });

    it('does not raise it twice while it stands', async () => {
      await standUp(at(9, 0));
      await service.tick(at(9, 1));

      expect(notifications.announce).toHaveBeenCalledTimes(1);
    });

    it('asks again on the insistent ladder, then keeps the longest gap', async () => {
      await standUp(at(9, 0));
      const count = service.active()?.fireCount ?? 1;

      await service.tick(at(9, 3));
      expect(notifications.announce).toHaveBeenCalledTimes(2);
      expect(service.active()?.fireCount).toBe(count + 1);
      expect(notifications.announce).toHaveBeenLastCalledWith(
        'Presentation',
        'Still standing — reminder 2.',
        expect.anything(),
      );

      await service.tick(at(9, 8));
      expect(notifications.announce).toHaveBeenCalledTimes(3);

      // 20 minutes after the third ring, and 30 after the fourth — and the
      // sixth ring would be 30 after that, not a shorter gap.
      await service.tick(at(9, 28));
      expect(notifications.announce).toHaveBeenCalledTimes(4);
      await service.tick(at(9, 58));
      expect(notifications.announce).toHaveBeenCalledTimes(5);
    });

    it('tells the truth when the moment was missed while the app was closed', async () => {
      service.create({ title: 'Class', dueAt: at(9, 0), rhythm: 'steady' }, at(8, 0));
      await service.tick(at(10, 15));

      expect(service.active()?.title).toBe('Class');
      expect(notifications.announce).toHaveBeenCalledWith(
        'Class',
        'It was due at 09:00. We kept it for you.',
        expect.anything(),
      );
    });

    it('holds the asking while the user is paused, and raises it when the pause ends', async () => {
      service.create({ title: 'Presentation', dueAt: at(9, 0), rhythm: 'steady' }, at(8, 0));
      paused.set(true);

      await service.tick(at(9, 30));
      expect(notifications.announce).not.toHaveBeenCalled();
      expect(service.active()).toBeNull();
      expect(service.status()).toBe('Held while you are paused');

      paused.set(false);
      await service.tick(at(9, 31));
      expect(service.active()?.title).toBe('Presentation');
    });
  });

  describe('answering', () => {
    it('ends it as done, takes the notification down and records the time', async () => {
      const id = await standUp(at(9, 0));
      await service.answer('done', at(9, 5));

      expect(service.active()).toBeNull();
      expect(service.reminders().find((item) => item.id === id)).toMatchObject({
        status: 'done',
        finishedAt: at(9, 5).toISOString(),
      });
      expect(notifications.dismissSystemNotification).toHaveBeenCalledWith(
        ReminderService.NOTIFICATION_TAG,
      );
    });

    it('ends it as stopped, which is not the same as done', async () => {
      const id = await standUp(at(9, 0));
      await service.answer('stop', at(9, 1));

      expect(service.reminders().find((item) => item.id === id)?.status).toBe('stopped');
      expect(service.finished().map((item) => item.id)).toEqual([id]);
    });

    it('snoozes it ten minutes on and resets the ring count', async () => {
      const id = await standUp(at(9, 0));
      await service.tick(at(9, 3));
      await service.answer('snooze', at(9, 4));

      const snoozed = service.reminders().find((item) => item.id === id);
      expect(snoozed).toMatchObject({
        status: 'scheduled',
        dueAt: at(9, 14).toISOString(),
        fireCount: 0,
        lastRangAt: null,
        snoozes: 1,
      });

      await service.tick(at(9, 13));
      expect(notifications.announce).toHaveBeenCalledTimes(2);
      await service.tick(at(9, 14));
      expect(notifications.announce).toHaveBeenCalledTimes(3);
    });

    it('raises the next waiting reminder as soon as the first is answered', async () => {
      const first = service.create(
        { title: 'Presentation', dueAt: at(9, 0), rhythm: 'steady' },
        at(8, 0),
      );
      service.create({ title: 'Call home', dueAt: at(9, 1), rhythm: 'steady' }, at(8, 0));
      await service.tick(at(9, 30));

      expect(service.active()?.id).toBe(first.id);
      expect(service.waiting()).toBe(1);

      await service.answer('done', at(9, 31));

      expect(service.active()?.title).toBe('Call home');
      expect(service.waiting()).toBe(0);
      expect(notifications.announce).toHaveBeenCalledTimes(2);
    });

    it('does nothing when nothing is asking', async () => {
      await service.answer('done');
      expect(notifications.dismissSystemNotification).not.toHaveBeenCalled();
    });

    it('answers from the notification’s own buttons', async () => {
      service.start();
      await standUp(at(9, 0));
      expect(actionHandler).not.toBeNull();

      actionHandler?.('done');
      await Promise.resolve();
      await Promise.resolve();

      expect(service.active()).toBeNull();
    });

    it('ignores an action it does not know', async () => {
      service.start();
      await standUp(at(9, 0));
      actionHandler?.('explode');
      await Promise.resolve();

      expect(service.active()).not.toBeNull();
    });

    it('comes back three minutes after a crossed notification, without counting it as a ring', async () => {
      service.start();
      // Stop the main loop so only the re-ask timer is left: otherwise the
      // 15-second tick would legitimately ring at the same moment, and the test
      // could not tell the two apart.
      service.stop();
      await standUp(at(9, 0));
      const count = service.active()?.fireCount ?? 1;

      expect(dismissHandler).not.toBeNull();
      dismissHandler?.();
      await vi.advanceTimersByTimeAsync(REMINDER_REASK_MS);

      expect(notifications.announce).toHaveBeenCalledTimes(2);
      expect(service.active()?.fireCount).toBe(count);
    });
  });

  describe('the list', () => {
    it('completes a scheduled reminder from a row', () => {
      const reminder = service.create(
        { title: 'Call home', dueAt: at(15, 0), rhythm: 'steady' },
        at(9, 0),
      );

      service.complete(reminder.id, at(9, 5));

      expect(service.reminders()[0]).toMatchObject({
        status: 'done',
        finishedAt: at(9, 5).toISOString(),
      });
    });

    it('completing a standing reminder takes its notification down too', async () => {
      const id = await standUp(at(9, 0));
      service.complete(id, at(9, 1));

      expect(service.active()).toBeNull();
      expect(notifications.dismissSystemNotification).toHaveBeenCalledWith(
        ReminderService.NOTIFICATION_TAG,
      );
    });

    it('removes one from the list, and dismisses it if it was asking', async () => {
      const id = await standUp(at(9, 0));
      service.remove(id);

      expect(service.reminders()).toHaveLength(0);
      expect(notifications.dismissSystemNotification).toHaveBeenCalledWith(
        ReminderService.NOTIFICATION_TAG,
      );

      service.remove('missing');
      expect(service.reminders()).toHaveLength(0);
    });

    it('clears the ended ones and leaves the open ones alone', async () => {
      const standing = await standUp(at(9, 0));
      const scheduled = service.create(
        { title: 'Call home', dueAt: at(15, 0), rhythm: 'steady' },
        at(9, 0),
      );
      service.complete(scheduled.id, at(9, 5));

      service.clearFinished();

      expect(service.reminders().map((item) => item.id)).toEqual([standing]);
    });

    it('does nothing when there is nothing finished to clear', () => {
      service.clearFinished();
      expect(service.reminders()).toEqual([]);
    });

    it('counts what is standing and what is behind it', async () => {
      await standUp(at(9, 0));
      expect(service.status()).toBe('Standing now');

      service.create({ title: 'Call home', dueAt: at(9, 1), rhythm: 'steady' }, at(9, 0));
      await service.tick(at(9, 2));
      expect(service.status()).toBe('Standing now · 2 waiting');
    });
  });

  describe('storage', () => {
    it('remembers the list across a restart', async () => {
      const id = await standUp(at(9, 0));
      service.stop();

      service = build();

      expect(service.reminders().map((item) => item.id)).toEqual([id]);
      expect(service.active()?.id).toBe(id);
    });

    it('starts empty when the stored value is not readable', () => {
      localStorage.setItem('deepwork.standingReminders.v1', '{not json');
      service = build();
      expect(service.reminders()).toEqual([]);
    });

    it('starts empty when the stored value is not a list', () => {
      localStorage.setItem('deepwork.standingReminders.v1', JSON.stringify({ not: 'a list' }));
      service = build();
      expect(service.reminders()).toEqual([]);
    });

    it('drops rows that are not reminders and keeps the rest', () => {
      localStorage.setItem(
        'deepwork.standingReminders.v1',
        JSON.stringify([{ id: 'bad' }, 42, { id: 'also-bad', title: '', status: 'scheduled' }]),
      );
      service = build();
      expect(service.reminders()).toEqual([]);
    });

    it('writes the list back after every change', async () => {
      await standUp(at(9, 0));
      const stored = JSON.parse(localStorage.getItem('deepwork.standingReminders.v1') ?? '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].status).toBe('standing');
    });
  });

  describe('bad input', () => {
    it('refuses a reminder with no title', () => {
      expect(() =>
        service.create({ title: '   ', dueAt: at(9, 0), rhythm: 'steady' }, at(8, 0)),
      ).toThrow('A reminder needs a title.');
    });

    it('keeps working when the notification cannot be posted', async () => {
      notifications.announce.mockRejectedValue(new Error('no desktop'));
      await standUp(at(9, 0));

      expect(service.active()).not.toBeNull();
      expect(notifications.chime).toHaveBeenCalled();
    });
  });

  describe('the loop', () => {
    it('creates exactly one timer and gives it back on stop', async () => {
      service.start();
      await service.tick(at(9, 0));
      expect(vi.getTimerCount()).toBe(1);

      service.stop();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('starts only once however often it is asked', async () => {
      service.start();
      service.start();
      await service.tick(at(9, 0));
      expect(vi.getTimerCount()).toBe(1);
    });

    it('does not re-arm after stop', async () => {
      service.start();
      service.stop();
      await service.tick(at(9, 0));
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
