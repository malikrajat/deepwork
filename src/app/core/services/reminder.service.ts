import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { REMINDER_REASK_MS, REMINDER_SNOOZE_MINUTES } from '../constants/reminder.constants';
import { ReminderDraft, StandingReminder } from '../models/reminder.model';
import {
  clockTime,
  countdownFromMs,
  createReminder,
  isDue,
  nextRingAt,
  parseReminder,
  quoteForRing,
  reminderBody,
  sortReminders,
} from '../utils/reminder.util';
import { AttentionService } from './attention.service';
import { LogService } from './log.service';
import { NotificationAction, NotificationService } from './notification.service';

/** How often the clock is looked at. */
const TICK_MS = 15_000;

/** Where the list is remembered, so a restart is not a forgetting. */
const STORAGE_KEY = 'deepwork.standingReminders.v1';

/** What the user can answer a standing reminder with, wherever it is shown. */
export type ReminderAnswer = 'done' | 'snooze' | 'stop';

/**
 * Reminders that stand until they are answered.
 *
 * Most reminders in the world are announcements: they appear, they fade, and if
 * nobody was looking the thing is simply lost. That is the wrong shape for the
 * events this feature exists for — a presentation, a class, a dose, a train —
 * because those are exactly the moments when the user cannot answer: they are
 * on stage, in front of a room, in a call. A reminder that gives up then is a
 * reminder that was never really there.
 *
 * Six decisions shape this service.
 *
 * - **A reminder has two ends, and both are the user's.** *Done* is the promise
 *   kept; *stop* is the honest "not this one after all". Nothing times out,
 *   nothing auto-dismisses, and nothing decides on the user's behalf that they
 *   probably saw it.
 * - **It escalates rather than repeats on a stopwatch.** The first re-ask comes
 *   quickly and the gaps lengthen on the rhythm's ladder (see
 *   `RHYTHM_LADDERS`). A reminder every three minutes forever is one the user
 *   learns to ignore; one that comes back at 3, 5, 10, 20 and then every 30
 *   minutes is one that stays noticeable without becoming noise.
 * - **It survives a restart, and a missed moment is not a lost one.** The list
 *   is in storage, not in a timer, and it is compared with the wall clock on
 *   every tick. Open the app after lunch and the 09:00 reminder is standing
 *   with the time it was due, because "you were not at the desk" is not an
 *   answer.
 * - **It arrives on every surface the app already has.** A sticky OS
 *   notification carrying the same three answers as the card, the alert tone
 *   the user chose, and an in-app card that cannot be closed by clicking away.
 *   No new delivery mechanism, no new volume: it borrows the notification
 *   service's question machinery exactly as the water reminder does.
 * - **One reminder asks at a time.** Several things can come due together, and
 *   a stack of cards is a stack the user dismisses without reading. The list is
 *   queued by time: answer the one in front and the next is raised at once.
 * - **A pause is still a pause, but it does not erase the reminder.** The tray's
 *   pause is the user saying "nothing for a while"; it holds the card and the
 *   tone. The reminder itself stays due, and speaks the moment the pause ends —
 *   which is the difference between respecting the user and forgetting their
 *   promise.
 */
@Injectable({ providedIn: 'root' })
export class ReminderService implements OnDestroy {
  /**
   * The three answers, in the order they are drawn.
   *
   * One list for both surfaces: the OS toast gets the ids and labels, and the
   * card asks the same question with the same ids. A reminder whose "Done"
   * meant something different in the app and on the desktop would be two
   * questions that happened to arrive together.
   */
  static readonly ACTIONS: NotificationAction[] = [
    { id: 'done', label: 'Done' },
    { id: 'snooze', label: 'Snooze 10 min' },
    { id: 'stop', label: 'Stop reminding' },
  ];

  /**
   * The handle the active question is posted under.
   *
   * One handle, because only one reminder asks at a time: a new question
   * replaces the previous one rather than stacking beside it, which is what
   * keeps the notification centre honest about how many things are waiting.
   */
  static readonly NOTIFICATION_TAG = 'deepwork-standing';

  private readonly notifications = inject(NotificationService);
  private readonly attention = inject(AttentionService);
  private readonly log = inject(LogService, { optional: true });

  /** The one timer this service holds, re-armed after every pass. */
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** True between `start()` and `stop()`. */
  private running = false;

  /** The timer that asks a crossed notification again. */
  private reaskTimer: ReturnType<typeof setTimeout> | null = null;

  /** Removes the toast-button handler when this service goes away. */
  private unlistenToast: (() => void) | null = null;

  /** Removes the toast-dismissed handler when this service goes away. */
  private unlistenDismiss: (() => void) | null = null;

  /** A clock that moves on its own, so countdowns on the page expire. */
  readonly now = signal(new Date());

  private readonly items = signal<StandingReminder[]>([]);

  /** The whole list, in display order. */
  readonly reminders = this.items.asReadonly();

  /** Everything that has come due and is still asking. */
  readonly standing = computed(() =>
    this.reminders().filter((reminder) => reminder.status === 'standing'),
  );

  /** Everything still waiting for its moment, soonest first. */
  readonly scheduled = computed(() =>
    this.reminders().filter((reminder) => reminder.status === 'scheduled'),
  );

  /** Everything that has ended, newest first. */
  readonly finished = computed(() =>
    this.reminders().filter(
      (reminder) => reminder.status === 'done' || reminder.status === 'stopped',
    ),
  );

  /**
   * The reminder the card is asking about.
   *
   * The oldest standing one — the thing that has been waiting longest is the
   * thing the user should deal with first. `null` is the normal, quiet state.
   */
  readonly active = computed(() => this.standing()[0] ?? null);

  /** How many more are queued behind the one on screen — standing or already due. */
  readonly waiting = computed(
    () =>
      Math.max(0, this.standing().length - 1) +
      this.scheduled().filter((reminder) => isDue(reminder, this.now())).length,
  );

  /** The next reminder to arrive, whether it is a new one or the next ring. */
  readonly nextAt = computed<Date | null>(() => {
    const active = this.active();
    if (active) return nextRingAt(active);
    const next = this.scheduled()[0];
    return next ? new Date(next.dueAt) : null;
  });

  /** The next scheduled reminder itself, for the page's "coming up" header. */
  readonly nextUp = computed(() => this.scheduled()[0] ?? null);

  /** One line for the page: what the feature is doing right now. */
  readonly status = computed(() => {
    const active = this.active();
    if (active) {
      const more = this.waiting();
      return more > 0 ? `Standing now · ${more + 1} waiting` : 'Standing now';
    }
    if (this.attention.paused()) return 'Held while you are paused';
    const next = this.nextAt();
    if (!next) return 'Nothing standing';
    return `Next ${countdownFromMs(next.getTime() - this.now().getTime())}`;
  });

  constructor() {
    this.restore();
  }

  /**
   * Stars the loop and wires the notification's three answers.
   *
   * Safe to call more than once. The handlers are registered for the life of
   * the service rather than around each post: a toast can be answered long
   * after it was raised, including after the next tick has already looked at
   * the clock.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.listenForAnswers();
    void this.tick();
  }

  /** Stops the loop and lets go of both timers. */
  stop(): void {
    this.running = false;
    this.clearReask();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * One pass of the schedule.
   *
   * Public and clock-injectable so the rules can be tested without waiting out
   * a ladder, and so the page can ask for a fresh evaluation after a change.
   */
  async tick(now: Date = new Date()): Promise<void> {
    this.now.set(now);

    try {
      // A pause is the user asking for quiet. It holds the asking, not the
      // reminder: nothing is due-checked while it lasts, and the first pass
      // after it ends finds the reminder still overdue and raises it.
      if (this.attention.paused()) return;

      const active = this.active();
      if (active) {
        const next = nextRingAt(active);
        if (next && next.getTime() <= now.getTime()) await this.ring(active, now);
        return;
      }

      const due = this.scheduled().find((reminder) => isDue(reminder, now));
      if (due) await this.raise(due, now);
    } catch (error) {
      // A reminder that cannot be placed is not worth a crash: say so in the
      // log and let the next tick try again.
      this.log?.warn('system', `standing reminder tick failed: ${describe(error)}`);
    } finally {
      // Exactly one timeout exists at any moment: anything pending is cleared
      // before the next one is armed, so an extra `tick()` can never double the
      // loop — and it is re-armed only while running, so `stop()` always wins.
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (this.running) this.timer = setTimeout(() => void this.tick(), TICK_MS);
    }
  }

  /**
   * Writes a reminder down.
   *
   * A moment in the past is allowed and deliberately not corrected: "remind me
   * about the 9 o'clock" typed at 9:05 is a person who is already late, and the
   * useful response is to stand the reminder up now rather than to refuse it.
   * The returned record is the stored one, so the page can select it.
   */
  create(draft: ReminderDraft, now: Date = new Date()): StandingReminder {
    const reminder = createReminder(draft, now, nextId());
    if (reminder.title === '') throw new Error('A reminder needs a title.');

    this.items.update((list) => sortReminders([...list, reminder]));
    this.persist();
    void this.tick(now);
    return reminder;
  }

  /** Ends a scheduled or standing reminder as done, from a row rather than the card. */
  complete(id: string, now: Date = new Date()): void {
    const reminder = this.items().find((item) => item.id === id);
    if (!reminder) return;
    this.end(id, 'done', now);
    // A row can finish the reminder that is currently asking. The card and the
    // notification are the same question, so the answer takes both down.
    if (reminder.status === 'standing') {
      void this.notifications.dismissSystemNotification(ReminderService.NOTIFICATION_TAG);
    }
  }

  /** Takes a reminder out of the list entirely — the row's own delete. */
  remove(id: string): void {
    const reminder = this.items().find((item) => item.id === id);
    if (!reminder) return;

    this.items.update((list) => list.filter((item) => item.id !== id));
    this.persist();
    if (reminder.status === 'standing') {
      this.clearReask();
      void this.notifications.dismissSystemNotification(ReminderService.NOTIFICATION_TAG);
    }
  }

  /** Drops the ended reminders, leaving the standing and coming ones alone. */
  clearFinished(): void {
    if (!this.finished().length) return;
    this.items.update((list) =>
      list.filter((reminder) => reminder.status !== 'done' && reminder.status !== 'stopped'),
    );
    this.persist();
  }

  /**
   * Answers the reminder that is asking.
   *
   * **Done** and **stop** end it; **snooze** moves it ten minutes on and clears
   * its ring count, so the next arrival is a new appointment rather than the
   * seventh repeat of the old one. Answering is the only way past the card:
   * there is no timeout and no click-away, which is the entire promise.
   */
  async answer(action: ReminderAnswer, now: Date = new Date()): Promise<void> {
    const active = this.active();
    if (!active) return;

    this.clearReask();
    await this.notifications.dismissSystemNotification(ReminderService.NOTIFICATION_TAG);

    if (action === 'snooze') {
      this.items.update((list) =>
        list.map((reminder) =>
          reminder.id === active.id
            ? {
                ...reminder,
                status: 'scheduled',
                dueAt: new Date(now.getTime() + REMINDER_SNOOZE_MINUTES * 60_000).toISOString(),
                fireCount: 0,
                lastRangAt: null,
                snoozes: reminder.snoozes + 1,
              }
            : reminder,
        ),
      );
      this.items.update((list) => sortReminders(list));
      this.persist();
      this.now.set(now);
      this.log?.info('flow', `standing reminder snoozed: ${active.title}`);
      return;
    }

    this.end(active.id, action === 'done' ? 'done' : 'stopped', now);
    // The next standing reminder takes the front of the queue at once; waiting
    // for the next tick would leave a second question unasked for 15 seconds.
    await this.tick(now);
  }

  /** The shared ending: mark it, persist it, and stop any pending re-ask. */
  private end(id: string, status: 'done' | 'stopped', now: Date): void {
    const reminder = this.items().find((item) => item.id === id);
    if (!reminder) return;

    this.clearReask();
    this.items.update((list) =>
      list.map((item) =>
        item.id === id ? { ...item, status, finishedAt: now.toISOString() } : item,
      ),
    );
    this.persist();
    this.now.set(now);
    this.log?.info(
      'flow',
      status === 'done'
        ? `standing reminder done: ${reminder.title}`
        : `standing reminder stopped: ${reminder.title}`,
    );
  }

  /** Wires the notification's buttons and its dismissal to the same two answers. */
  private listenForAnswers(): void {
    if (this.unlistenToast) return;
    this.unlistenToast = this.notifications.onToastAction(
      ReminderService.NOTIFICATION_TAG,
      (action) => {
        if (action === 'done' || action === 'snooze' || action === 'stop') {
          void this.answer(action);
        }
      },
    );
    this.unlistenDismiss = this.notifications.onToastDismissed(
      ReminderService.NOTIFICATION_TAG,
      () => this.scheduleReask(),
    );
  }

  /** Raises a reminder for the first time: it becomes standing and asks. */
  private async raise(reminder: StandingReminder, now: Date): Promise<void> {
    const standing: StandingReminder = {
      ...reminder,
      status: 'standing',
      fireCount: reminder.fireCount + 1,
      lastRangAt: now.toISOString(),
    };
    this.replace(standing);
    await this.post(standing, now);
  }

  /** Asks an already-standing reminder again, one rung further up the ladder. */
  private async ring(reminder: StandingReminder, now: Date): Promise<void> {
    const standing: StandingReminder = {
      ...reminder,
      fireCount: reminder.fireCount + 1,
      lastRangAt: now.toISOString(),
    };
    this.replace(standing);
    await this.post(standing, now);
  }

  /** Writes one changed reminder back and puts the list in its order. */
  private replace(reminder: StandingReminder): void {
    this.items.update((list) =>
      sortReminders(list.map((item) => (item.id === reminder.id ? reminder : item))),
    );
    this.persist();
  }

  /**
   * Puts the question on both surfaces: the tone, and the sticky notification
   * with the same three answers the card draws.
   *
   * A minimised window is deliberately left where it is. The moment this
   * feature exists for is one where the user is elsewhere — on stage, in a
   * call — so stealing focus would interrupt the very thing the reminder is
   * about. The sticky toast is the surface that reaches them without moving
   * anything they are looking at.
   */
  private async post(reminder: StandingReminder, now: Date): Promise<void> {
    this.notifications.chime();

    const body = reminderBody(reminder, now);
    try {
      await this.notifications.announce(reminder.title, body, {
        quote: quoteForRing(reminder.fireCount),
        tag: ReminderService.NOTIFICATION_TAG,
        sticky: true,
        actions: ReminderService.ACTIONS,
      });
      this.log?.info(
        'flow',
        `standing reminder rang: ${reminder.title} (${reminder.fireCount}) at ${clockTime(now)}`,
      );
    } catch (error) {
      // The card is still on screen: a desktop that refused the notification is
      // one surface lost, not the reminder.
      this.log?.warn('system', `standing reminder could not be shown: ${describe(error)}`);
    }
  }

  /**
   * Puts a crossed question back after three minutes.
   *
   * A dismissed toast is not an answer — the user was in the middle of
   * something — so the question is re-posted as it was, without advancing the
   * ladder or changing the count. The timer is replaced rather than stacked by
   * each crossing, and every answer clears it.
   */
  private scheduleReask(): void {
    this.clearReask();
    if (!this.active()) return;

    this.reaskTimer = setTimeout(() => {
      this.reaskTimer = null;
      void this.repost();
    }, REMINDER_REASK_MS);
  }

  /** Re-posts the active question without treating the crossing as a ring. */
  private async repost(): Promise<void> {
    const active = this.active();
    if (!active || this.attention.paused()) return;
    await this.post(active, new Date());
  }

  private clearReask(): void {
    if (this.reaskTimer) {
      clearTimeout(this.reaskTimer);
      this.reaskTimer = null;
    }
  }

  /** Reads the stored list, dropping rows that are not reminders this build knows. */
  private restore(): void {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const reminders = parsed
        .map((value) => parseReminder(value))
        .filter((value): value is StandingReminder => value !== null);
      this.items.set(sortReminders(reminders));
    } catch {
      // Unreadable storage is a fresh start, not a crash: the feature still
      // works, and the next reminder written replaces the bad value.
      this.items.set([]);
    }
  }

  /** Writes the list, best effort. */
  private persist(): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.items()));
    } catch {
      // A list that cannot be remembered still works for this run.
    }
  }

  ngOnDestroy(): void {
    this.stop();
    this.unlistenToast?.();
    this.unlistenToast = null;
    this.unlistenDismiss?.();
    this.unlistenDismiss = null;
  }
}

/** A new identifier, with a fallback for a shell without `randomUUID`. */
function nextId(): string {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // Fall through to the timestamp version below.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** One line from whatever went wrong. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
