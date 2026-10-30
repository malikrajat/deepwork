import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { MovementNudge, MovementPrefs } from '../models/movement.model';
import { MOVEMENT_SNOOZE_MINUTES, MOVEMENT_WALK_MINUTES } from '../constants/movement.constants';
import {
  formatClockTime,
  isWithinHours,
  minuteOfDay,
  nextWindowOpen,
  parseTimeOfDay,
} from '../utils/water.util';
import { movementPrefsOf } from '../utils/movement.util';
import { AttentionService } from './attention.service';
import { LogService } from './log.service';
import { NotificationAction, NotificationService } from './notification.service';
import { SettingsService } from './settings.service';
import { UiService } from './ui.service';

/** How often the schedule is re-checked. */
const TICK_MS = 30_000;

/** Where the last reminder is remembered, so a restart cannot repeat it. */
const LAST_FIRED_KEY = 'deepwork.movement.lastFired.v1';

/**
 * Where the last moment DeepWork was known to be running is remembered.
 *
 * The cadence measures time *at the desk*, not time as the wall clock sees it.
 * An app that is closed — or a machine that is shut down — is not time anyone
 * spent sitting at this desk, and counting it produced a reminder on the
 * doorstep of the next launch. The heartbeat lets a launch fold the absence into
 * the last reminder's instant and wait a full interval instead.
 */
const LAST_ALIVE_KEY = 'deepwork.movement.lastAlive.v1';

/**
 * The stand-and-walk reminder: a question that leaves the chair, and a bell that
 * keeps asking until it is answered.
 *
 * Seven decisions shape it, and most of them are the water reminder's decisions
 * deliberately applied to a different body part.
 *
 * - **It runs on one self-re-arming timer.** `start()` is idempotent, every tick
 *   clears the timeout it is about to replace, and `stop()`/`ngOnDestroy` clear
 *   it, so however often the app asks for the loop there is exactly one timeout.
 * - **It holds no list and no DOM.** The only state is when the last reminder
 *   fired, the one question on screen, and the signals those are read through.
 * - **It asks from both surfaces.** The card is what stays on screen in the app;
 *   the system notification carries the same words, the same quote and the same
 *   two answers, so the question can be dealt with wherever the user is looking.
 *   On Windows the toast is posted as a `reminder` toast that waits rather than
 *   slides away.
 * - **The bell repeats until an answer.** The completion alert's repeat is the
 *   model: every `notificationRepeatInterval` seconds the chosen tone rings again
 *   and the notification is re-posted under the movement tag, which replaces the
 *   copy already on screen rather than stacking one per ring. The card holds the
 *   cadence, so no second question arrives underneath the first.
 * - **Only an answer ends it.** **I'm up** closes the question and starts a full
 *   interval; **Snooze 10 min** closes it and brings the same question back in ten
 *   minutes. There is no timeout and no close cross. The answer is deliberately
 *   the first step rather than "did you walk?" — the card asks the user to get up,
 *   so it cannot also ask them to confirm they already have.
 * - **A minimised window is left alone when the notification can answer.** The
 *   mini widget is the user saying "I am working elsewhere"; the question moves to
 *   the notification and the window stays put. Where the notification cannot carry
 *   its buttons, the card comes forward, because a question with no answerer is
 *   worse than a small interruption.
 * - **A pause stops everything.** The tray's pause means no reminders for a while;
 *   an open movement question is taken down with it, and the first reminder after
 *   the pause is a full interval away. The clock also only counts while the app is
 *   running, so a restart does not arrive overdue.
 */
@Injectable({ providedIn: 'root' })
export class MovementReminderService implements OnDestroy {
  /**
   * The two answers this reminder asks with, wherever they can be shown.
   *
   * One list for both surfaces: the toast gets the ids and labels, and the card
   * asks the same question with the same ids behind its own labels. A reminder
   * that offered one set of answers on the desktop and another in the window
   * would be two questions that happened to arrive together.
   */
  private static readonly ASK_ACTIONS: NotificationAction[] = [
    { id: 'done', label: "I'm up" },
    { id: 'snooze', label: 'Snooze 10 min' },
  ];

  private readonly settingsService = inject(SettingsService);
  private readonly notifications = inject(NotificationService);
  private readonly ui = inject(UiService);
  private readonly attention = inject(AttentionService);
  private readonly log = inject(LogService, { optional: true });

  /** The only schedule timer this service will ever hold. */
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** The bell's own timer. At most one exists, and only while a question is open. */
  private repeatTimer: ReturnType<typeof setTimeout> | null = null;

  /** True between `start()` and `stop()`, so a tick cannot re-arm after a stop. */
  private running = false;

  /** When the previous tick fired a reminder, read once from storage. */
  private lastFired: Date | null = null;
  private lastFiredLoaded = false;

  /** True once this run has accounted for the time the app was not running. */
  private awayTimeFolded = false;

  /** The switch as the previous tick saw it, to notice it being turned on. */
  private wasEnabled: boolean | null = null;

  /** The clock as of the last tick. */
  readonly now = signal(new Date());

  /** When the next reminder is due, or null when reminders are not running. */
  readonly nextAt = signal<Date | null>(null);

  /**
   * The question that is on screen and waiting for an answer, or null.
   *
   * While this holds a nudge the loop arms no next reminder, so a question the
   * user has not answered is never buried under a new one.
   */
  readonly nudge = signal<MovementNudge | null>(null);

  /** Counts nudges so each one is new to the view. */
  private nudgeCount = 0;

  /**
   * Removes the toast-button handler when this service goes away.
   *
   * Registered once in {@link start}, and answers the notification's two buttons
   * exactly as the card's own buttons do — one question, two surfaces, one answer.
   */
  private unlistenToast: (() => void) | null = null;

  /** The stored preferences, as one object. */
  readonly prefs = computed<MovementPrefs>(() => movementPrefsOf(this.settingsService.settings()));

  /** True while reminders are switched on. */
  readonly enabled = computed(() => this.prefs().enabled);

  /** True when the clock is inside the working hours the user chose. */
  readonly inHours = computed(() => {
    const window = this.hours();
    if (!window) return false;
    return isWithinHours(minuteOfDay(this.now()), window.start, window.end);
  });

  /** One line for the dashboard: what the reminder is doing right now. */
  readonly status = computed(() => {
    if (!this.enabled()) return 'Stand & walk reminders are off';

    const window = this.hours();
    if (!window) return 'Set your reminder hours in Settings';

    if (this.nudge()) return 'Waiting for your answer';

    const next = this.nextAt();
    if (!this.inHours()) {
      return next ? `Paused — back at ${formatClockTime(next)}` : 'Paused outside your hours';
    }
    return next ? `Next reminder at ${formatClockTime(next)}` : 'Reminder is running';
  });

  /** Starts the loop. Safe to call repeatedly — a second call does nothing. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.listenForAnswers();
    void this.tick();
  }

  /**
   * Wires the notification's **I'm up** and **Snooze** to the same answers the
   * card's buttons give.
   *
   * Registered once and kept for the life of the service rather than around each
   * reminder: the toast can be answered at any moment, including after the next
   * tick has already looked at the clock.
   */
  private listenForAnswers(): void {
    if (this.unlistenToast) return;
    this.unlistenToast = this.notifications.onToastAction(
      NotificationService.MOVEMENT_NOTIFICATION_TAG,
      (action) => {
        if (action === 'done' || action === 'snooze') void this.answerNudge(action);
      },
    );
  }

  /** Stops the loop and releases every timer it holds. */
  stop(): void {
    this.running = false;
    this.clearRepeat();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.writeHeartbeat(new Date());
  }

  /**
   * One pass of the schedule.
   *
   * Public and clock-injectable so the rules can be tested without waiting out a
   * cadence, and so Settings can ask for a fresh evaluation after a change.
   */
  async tick(now: Date = new Date()): Promise<void> {
    this.now.set(now);
    this.foldAwayTime(now);

    try {
      const prefs = this.prefs();
      const workingHours = this.hours();
      const justEnabled = prefs.enabled && this.wasEnabled === false;
      this.wasEnabled = prefs.enabled;

      if (!prefs.enabled || !workingHours) {
        this.clearRepeat();
        const hadNudge = this.nudge() !== null;
        this.nudge.set(null);
        this.nextAt.set(null);
        // Turning the reminder off also takes back a question it is still asking.
        if (hadNudge) {
          await this.notifications.dismissSystemNotification(
            NotificationService.MOVEMENT_NOTIFICATION_TAG,
          );
        }
        return;
      }

      // A pause is the user asking for none of this, and movement is one of the
      // things they meant. The open question goes with it; the cadence moves
      // forward so the first reminder afterwards is a full interval away.
      if (this.attention.paused()) {
        this.clearRepeat();
        const hadNudge = this.nudge() !== null;
        this.nudge.set(null);
        this.nextAt.set(null);
        if (hadNudge) {
          await this.notifications.dismissSystemNotification(
            NotificationService.MOVEMENT_NOTIFICATION_TAG,
          );
        }
        this.remember(now);
        return;
      }

      // A question that is still on screen owns the cadence, and its own bell is
      // what keeps asking. Outside working hours the card stays but the bell
      // stops, so a question left open overnight does not ring all night.
      if (this.nudge()) {
        if (this.inHours()) this.ensureRepeat();
        this.nextAt.set(null);
        return;
      }

      if (!isWithinHours(minuteOfDay(now), workingHours.start, workingHours.end)) {
        this.clearRepeat();
        this.nextAt.set(nextWindowOpen(now, workingHours.start, workingHours.end));
        return;
      }

      const last = this.lastFiredAt();
      // A reminder the user asked for waits a full interval; one that was already
      // running picks the cadence up where it left off.
      if (last === null || justEnabled) {
        this.remember(now);
        this.nextAt.set(this.after(now, prefs.intervalMinutes));
        return;
      }

      const dueAt = this.after(last, prefs.intervalMinutes);
      if (dueAt.getTime() <= now.getTime()) {
        await this.remind(now);
        this.remember(now);
        return;
      }

      this.nextAt.set(dueAt);
    } catch (error) {
      // A reminder that cannot be placed is not worth a crash: say so in the log
      // and let the next tick try again.
      this.log?.warn('system', `movement reminder tick failed: ${describe(error)}`);
    } finally {
      this.writeHeartbeat(now);
      // Exactly one timeout exists at any moment: anything pending is cleared
      // before the next one is armed, and it is re-armed only while running.
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (this.running) this.timer = setTimeout(() => void this.tick(), TICK_MS);
    }
  }

  /**
   * Sends the reminder now, whatever the clock says.
   *
   * This is what the **Test** button in Settings calls. It raises the same card
   * and notification a real reminder would, and the cadence follows the answer to
   * it exactly as it would have.
   */
  async remindNow(): Promise<void> {
    const now = new Date();
    this.now.set(now);
    await this.remind(now, { test: true });
    this.remember(now);
  }

  /**
   * Answers the question that is on screen.
   *
   * **I'm up** closes it and starts a full interval; **Snooze 10 min** closes it
   * and brings it back in ten minutes. Either way the notification is taken down,
   * because a question that stays on screen after it was answered is one the user
   * learns to ignore.
   */
  async answerNudge(action: 'done' | 'snooze', now: Date = new Date()): Promise<void> {
    const open = this.nudge();
    if (!open) return;

    this.clearRepeat();
    this.nudge.set(null);
    this.now.set(now);
    await this.notifications.dismissSystemNotification(
      NotificationService.MOVEMENT_NOTIFICATION_TAG,
    );

    const prefs = this.prefs();
    if (action === 'snooze') {
      // `tick` decides "due" from last-fired + interval, so the last reminder is
      // moved back far enough that the next due moment is exactly the snooze.
      const shift = Math.max(0, prefs.intervalMinutes - MOVEMENT_SNOOZE_MINUTES);
      this.remember(new Date(now.getTime() - shift * 60_000));
      this.nextAt.set(this.after(now, MOVEMENT_SNOOZE_MINUTES));
      this.log?.info(
        'flow',
        `movement reminder snoozed until ${formatClockTime(this.nextAt() ?? now)}`,
      );
      return;
    }

    this.remember(now);
    this.nextAt.set(this.after(now, prefs.intervalMinutes));
    this.log?.info('flow', `movement reminder answered at ${formatClockTime(now)}`);
  }

  /** Raises the persistent card and the notification that goes with it. */
  private async remind(now: Date, options: { test?: boolean } = {}): Promise<void> {
    const prefs = this.prefs();
    const title = 'Time to move';
    const quote = this.notifications.nextQuote('move');
    // The answer is "I'm up", not "did you walk?" — asking someone to walk and
    // asking whether they already have in the same breath is two questions the
    // user cannot both answer. This card asks for the first step; walking is what
    // happens next, not a claim the card is waiting to believe.
    const body = options.test
      ? `This is what a stand-and-walk reminder looks like. A ${MOVEMENT_WALK_MINUTES}-minute walk every ${prefs.intervalMinutes} minutes keeps your back and focus in better shape.`
      : `You have been sitting for a while. Stand up and walk for ${MOVEMENT_WALK_MINUTES} minutes — two minutes is enough to reset the next hour.`;

    // The one case where the card is not the surface: the window is the widget
    // and the notification can be answered. Then the question stays on the sticky
    // toast and the window stays exactly where it is.
    const askOnDesktop = !options.test && this.asksOnDesktop();

    const nudge: MovementNudge = {
      id: this.nudgeCount + 1,
      title,
      body,
      quote,
      walkMinutes: MOVEMENT_WALK_MINUTES,
      surfaceWindow: !askOnDesktop,
    };
    this.nudgeCount = nudge.id;
    this.nudge.set(nudge);
    // A question on screen holds the cadence — there is no next reminder to
    // promise until it has been answered.
    this.nextAt.set(null);

    // The tone is what makes someone look up from whatever they are doing.
    this.notifications.chime();

    const answerable = await this.say(title, body, quote, now, MovementReminderService.ASK_ACTIONS);

    // The question was meant to live on the desktop, and the desktop turned out
    // not to carry its answers. Flipping the flag hands it back to the card,
    // whose component is watching `surfaceWindow`.
    if (askOnDesktop && !answerable) {
      this.nudge.set({ ...nudge, surfaceWindow: true });
    }

    // The bell keeps ringing until one of the answers is pressed or the reminder
    // is turned off/paused. This is the difference between a notification that
    // was delivered and one that was noticed.
    this.ensureRepeat();
  }

  /**
   * True when the reminder should be answered from the notification instead of
   * the card.
   *
   * Only while the window is the mini widget, and only when the notification can
   * report a press. Where it cannot, the card takes the question and the window
   * comes forward — a movement break cannot be counted for the user the way a
   * glass of water can.
   */
  private asksOnDesktop(): boolean {
    return this.ui.isMiniMode() && this.notifications.canAnswerOnNotification;
  }

  /**
   * Arms the next ring, if one is not already armed.
   *
   * Called when a question is raised and from every tick that finds one still
   * open. The guard is what makes a 30-second schedule tick safe: resetting the
   * bell's timer every tick would mean it never reaches its interval.
   */
  private ensureRepeat(): void {
    if (this.repeatTimer || !this.nudge()) return;

    const seconds = Math.max(30, this.settingsService.settings().notificationRepeatInterval);
    this.repeatTimer = setTimeout(() => {
      this.repeatTimer = null;
      void this.repeatOnce();
    }, seconds * 1000);
  }

  /**
   * One repeat of an unanswered question: the tone again, and the notification
   * again under the same tag.
   *
   * A sticky toast already on screen is replaced rather than duplicated, and on
   * platforms whose toast cannot wait this is what re-raises it. The card is not
   * re-created — it is already in front of the user — so the repeat is heard and
   * seen at the desktop, which is where a person working elsewhere will notice it.
   */
  private async repeatOnce(): Promise<void> {
    const nudge = this.nudge();
    if (!nudge) return;

    // The question may have been answered, the reminder turned off, the app
    // paused or the working day ended between the ring and this callback.
    if (!this.prefs().enabled || this.attention.paused()) return;
    const window = this.hours();
    if (!window || !isWithinHours(minuteOfDay(new Date()), window.start, window.end)) return;

    this.notifications.chime();
    const posted = await this.say(
      nudge.title,
      nudge.body,
      nudge.quote,
      new Date(),
      MovementReminderService.ASK_ACTIONS,
      { log: false },
    );

    if (!posted && !nudge.surfaceWindow) {
      this.nudge.set({ ...nudge, surfaceWindow: true });
    }

    // Still open? Keep the bell going. The guard in `ensureRepeat` makes this a
    // single chain, and `clearRepeat`/`answerNudge` ends it.
    this.ensureRepeat();
  }

  /** Drops the pending ring, if there is one. */
  private clearRepeat(): void {
    if (this.repeatTimer) {
      clearTimeout(this.repeatTimer);
      this.repeatTimer = null;
    }
  }

  /**
   * Sends one OS notification, and writes the line that says it happened.
   *
   * Returns whether the post can carry the answers it was given — see
   * `NotificationService.announce`. A repeat passes `log: false`: the same
   * reminder ringing again is not a new event in the flow log.
   */
  private async say(
    title: string,
    body: string,
    quote: string,
    now: Date,
    actions?: NotificationAction[],
    options: { log?: boolean } = {},
  ): Promise<boolean> {
    try {
      const answerable = await this.notifications.announce(title, body, {
        quote,
        tag: NotificationService.MOVEMENT_NOTIFICATION_TAG,
        sticky: true,
        actions,
      });
      if (options.log !== false) {
        this.log?.info(
          'flow',
          `movement reminder at ${formatClockTime(now)} · ${this.prefs().intervalMinutes} min cadence`,
        );
      }
      return answerable;
    } catch (error) {
      this.log?.warn('system', `movement reminder could not be shown: ${describe(error)}`);
      return false;
    }
  }

  /** `start` plus `minutes`. */
  private after(start: Date, minutes: number): Date {
    return new Date(start.getTime() + minutes * 60_000);
  }

  /**
   * Moves the last reminder forward by the time DeepWork was not running, once
   * per run — see {@link LAST_ALIVE_KEY}.
   */
  private foldAwayTime(now: Date): void {
    if (this.awayTimeFolded) return;
    this.awayTimeFolded = true;

    const away = this.awayMs(now);
    if (away <= 0) return;

    const last = this.lastFiredAt();
    if (!last) return;

    this.remember(new Date(Math.min(last.getTime() + away, now.getTime())));
  }

  /** How long DeepWork was not running, in milliseconds. */
  private awayMs(now: Date): number {
    const heartbeat = this.readHeartbeat();
    if (heartbeat !== null) return Math.max(0, now.getTime() - heartbeat);

    const last = this.lastFiredAt();
    return Math.max(0, now.getTime() - (last?.getTime() ?? now.getTime()));
  }

  private readHeartbeat(): number | null {
    try {
      const raw = globalThis.localStorage?.getItem(LAST_ALIVE_KEY);
      const parsed = raw ? Date.parse(raw) : Number.NaN;
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /** Records that DeepWork was running at `at`, best effort. */
  private writeHeartbeat(at: Date): void {
    try {
      globalThis.localStorage?.setItem(LAST_ALIVE_KEY, at.toISOString());
    } catch {
      // A heartbeat that cannot be written only costs one reminder's timing.
    }
  }

  /** The working hours as minutes past midnight, or null when unreadable. */
  private hours(): { start: number; end: number } | null {
    const prefs = this.prefs();
    const start = parseTimeOfDay(prefs.start);
    const end = parseTimeOfDay(prefs.end);
    if (start === null || end === null || start === end) return null;
    return { start, end };
  }

  /** The remembered moment of the last reminder, read from storage on first use. */
  private lastFiredAt(): Date | null {
    if (this.lastFiredLoaded) return this.lastFired;
    this.lastFiredLoaded = true;

    try {
      const raw = globalThis.localStorage?.getItem(LAST_FIRED_KEY);
      const parsed = raw ? Date.parse(raw) : Number.NaN;
      this.lastFired = Number.isFinite(parsed) ? new Date(parsed) : null;
    } catch {
      this.lastFired = null;
    }
    return this.lastFired;
  }

  /** Stores the moment of a reminder, in memory and — best effort — on disk. */
  private remember(at: Date): void {
    this.lastFired = at;
    this.lastFiredLoaded = true;
    try {
      globalThis.localStorage?.setItem(LAST_FIRED_KEY, at.toISOString());
    } catch {
      // A cadence that cannot be remembered only costs one extra nudge.
    }
  }

  ngOnDestroy(): void {
    this.stop();
    this.clearRepeat();
    this.unlistenToast?.();
    this.unlistenToast = null;
  }
}

/** One line from whatever went wrong. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
