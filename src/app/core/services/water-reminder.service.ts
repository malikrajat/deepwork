import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { WaterNudge, WaterPrefs } from '../models/water.model';
import {
  formatClockTime,
  formatMillilitres,
  isWithinHours,
  minuteOfDay,
  nextWindowOpen,
  parseTimeOfDay,
  quoteFor,
  waterPrefsOf,
} from '../utils/water.util';
import { LogService } from './log.service';
import { NotificationService } from './notification.service';
import { SettingsService } from './settings.service';
import { UiService } from './ui.service';
import { WaterService } from './water.service';

/** How often the schedule is re-checked. */
const TICK_MS = 30_000;

/** Where the last reminder is remembered, so a restart cannot repeat it. */
const LAST_FIRED_KEY = 'deepwork.water.lastFired.v1';

/**
 * Where the last moment DeepWork was known to be running is remembered.
 *
 * The reminder's clock measures time *at the desk*, not time as the wall clock
 * sees it: an app that is closed, or a machine that is shut down, is time when
 * nobody is there to be reminded, and counting it produced a reminder on the
 * doorstep of the next launch — start the PC in the morning and the first thing
 * DeepWork did was ask for water. This heartbeat is how a launch tells how long
 * it was away, so the cadence picks up where it stopped instead of arriving
 * overdue. It is refreshed by every pass of the loop, and once more when the
 * loop stops.
 */
const LAST_ALIVE_KEY = 'deepwork.water.lastAlive.v1';

/**
 * The water reminder: one timer, and a question the user answers when it is due.
 *
 * Seven decisions shape it.
 *
 * - **It runs on a single, self-re-arming timer.** There is no interval object
 *   that can outlive its usefulness and no second timer started by a settings
 *   change: every tick clears the torch as it passes it (`stop()` included), and
 *   `start()` is idempotent, so however many times the app asks for it, exactly
 *   one timeout exists. `ngOnDestroy` clears it as well.
 * - **It holds no list, no listener and no DOM.** The only state it owns is
 *   "when did the last reminder fire" (one string), the nudge that is on screen
 *   (one object) and the signals those two are shown through — nothing
 *   accumulates, so there is nothing to leak.
 * - **It arrives the way the app's other notifications do.** The OS
 *   notification at OS level, plus the alert tone the user chose — the same
 *   **Notification sound** setting and the same tray mute switch as the Pomodoro
 *   — but never the Pomodoro's in-app toast, which is someone else's message.
 *   The one thing it asks for that the alert does not is **persistence**: a
 *   notification that slides away while the user is heads-down is one that was
 *   never delivered, so on Windows it is posted as a `reminder` toast that waits
 *   on screen until it is dealt with (see `alert_notify`), under a handle of its
 *   own so it cannot take the place of an unanswered completion alert.
 * - **The notification is paired with one card that has to be answered.** A
 *   notification on a busy desktop is easy to miss, however it sounds, so the
 *   reminder also raises a card carrying a motivational line and two answers —
 *   **Yes**, which logs the glass, and **Not now**, which closes it. Nothing
 *   else closes the card: it holds the cadence until the user answers it, so the
 *   next nudge cannot arrive underneath a question that is still on screen. The
 *   state for all of that is one signal holding one plain object.
 * - **A minimised window is left alone.** Shrinking DeepWork into the mini
 *   widget is the user saying "I am working elsewhere", so a reminder that
 *   arrives then does not pull the full window back over what they are doing.
 *   It rings, counts the glass at the configured size and says so in the
 *   notification — see `waterAutoLogWhenMinimized`, which can turn that off and
 *   ask instead.
 * - **Its clock only counts while the app is running.** Closing DeepWork — or
 *   shutting the machine down — is not time spent at the desk, so a launch
 *   folds the time it was away into the last reminder's instant and waits a
 *   full interval, rather than firing the moment the window appears. It also
 *   fires at most once per interval: nobody gets a queue of the reminders they
 *   slept through.
 */
@Injectable({ providedIn: 'root' })
export class WaterReminderService implements OnDestroy {
  private readonly settingsService = inject(SettingsService);
  private readonly water = inject(WaterService);
  private readonly notifications = inject(NotificationService);
  private readonly ui = inject(UiService);
  private readonly log = inject(LogService, { optional: true });

  /** The only timer this service will ever hold. */
  private timer: ReturnType<typeof setTimeout> | null = null;

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
   * The reminder that is on screen and waiting for an answer, or null.
   *
   * The one piece of state the card adds, and the reason the cadence is honest:
   * while this holds a nudge, the loop does not arm a next reminder, so a
   * question the user has not answered is never buried under a new one.
   */
  readonly nudge = signal<WaterNudge | null>(null);

  /** Counts nudges so each one is new to the view, and walks the quote list. */
  private nudgeCount = 0;

  /** The stored preferences, as one object. */
  readonly prefs = computed<WaterPrefs>(() => waterPrefsOf(this.settingsService.settings()));

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
    if (!this.enabled()) return 'Water reminders are off';

    const window = this.hours();
    if (!window) return 'Set your reminder hours in Settings';

    if (this.nudge()) return 'Waiting for your answer';

    const next = this.nextAt();
    if (!this.inHours()) {
      return next ? `Paused — back at ${formatClockTime(next)}` : 'Paused outside your hours';
    }
    return next ? `Next reminder at ${formatClockTime(next)}` : 'Reminder is running';
  });

  /**
   * Starts the loop. Safe to call repeatedly — a second call does nothing.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.tick();
  }

  /**
   * Stops the loop and releases the timer.
   *
   * Called by `ngOnDestroy`, and by tests; the app itself never needs to stop
   * it, because the reminder follows the settings on its own.
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // The loop is done: this is the last moment DeepWork can claim to have been
    // running, and a clean exit should leave that on the record.
    this.writeHeartbeat(new Date());
  }

  /**
   * One pass of the schedule.
   *
   * Public and clock-injectable so the rules can be tested without waiting half
   * an hour, and so the dashboard can ask for a fresh evaluation after the
   * settings change.
   */
  async tick(now: Date = new Date()): Promise<void> {
    this.now.set(now);
    // The first pass of a run has to know how long DeepWork was not there
    // before it can decide whether a reminder is due.
    this.foldAwayTime(now);

    try {
      await this.water.ensureToday();
      const prefs = this.prefs();
      const workingHours = this.hours();
      const justEnabled = prefs.enabled && this.wasEnabled === false;
      this.wasEnabled = prefs.enabled;

      if (!prefs.enabled || !workingHours) {
        // Turning reminders off also takes back a question they are still asking.
        this.nudge.set(null);
        this.nextAt.set(null);
        return;
      }

      // A question that is still on screen owns the cadence: the user has been
      // asked, so nothing new is armed until they have answered.
      if (this.nudge()) {
        this.nextAt.set(null);
        return;
      }

      if (!isWithinHours(minuteOfDay(now), workingHours.start, workingHours.end)) {
        this.nextAt.set(nextWindowOpen(now, workingHours.start, workingHours.end));
        return;
      }

      const last = this.lastFiredAt();
      // A reminder the user asked for waits a full interval; one that was
      // already running picks the cadence up where it left off.
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
      // A reminder that cannot be placed is not worth a crash: say so in the
      // log and let the next tick try again.
      this.log?.warn('system', `water reminder tick failed: ${describe(error)}`);
    } finally {
      // A pass is also the proof that the app was running just now, which is
      // what the next launch measures its absence against.
      this.writeHeartbeat(now);
      // Exactly one timeout exists at any moment: anything pending is cleared
      // before the next one is armed, so an extra `tick()` — the dashboard
      // asking for a fresh evaluation, say — can never double the loop. And it
      // is re-armed only while running, so `stop()` always wins.
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
   * This is what the **Test** button in Settings calls, and it counts as a real
   * reminder: it raises the same card, and the cadence restarts from the answer
   * to it, exactly as it would have.
   */
  async remindNow(): Promise<void> {
    const now = new Date();
    this.now.set(now);
    await this.remind(now, { test: true });
    this.remember(now);
  }

  /**
   * Answers the card that is on screen.
   *
   * **Yes** logs one glass at the size the card asked about and **Not now**
   * simply closes it. Either way the cadence restarts from the answer rather
   * than from the moment the question was asked, and answering is the *only*
   * way out: no timer closes the card, so a reminder cannot be missed by not
   * being at the desk for a minute.
   *
   * The clock is a parameter for the same reason {@link tick}'s is: so the rule
   * can be pinned down exactly without waiting out an interval in a test.
   */
  async answerNudge(answer: 'yes' | 'no', now: Date = new Date()): Promise<void> {
    const open = this.nudge();
    if (!open) return;

    this.nudge.set(null);
    this.now.set(now);

    if (answer === 'yes') {
      try {
        await this.water.log(open.amountMl);
      } catch (error) {
        this.log?.warn('system', `water nudge could not be logged: ${describe(error)}`);
      }
    }

    this.remember(now);
    this.nextAt.set(this.after(now, this.prefs().intervalMinutes));
  }

  /** Raises the persistent card, and sends the notification that goes with it. */
  private async remind(now: Date, options: { test?: boolean } = {}): Promise<void> {
    const prefs = this.prefs();
    const glass = formatMillilitres(prefs.amountMl);
    const title = `Drink water — ${glass}`;
    const quote = quoteFor(this.nudgeCount);

    // A minimised window is left alone: it is not pulled back over whatever the
    // user is working in. A **test** never writes to the log, so it always asks.
    if (!options.test && this.countsItself(prefs)) {
      // It rings even though nothing is being asked: the tone is what tells
      // someone working in another window that a glass has been counted.
      this.notifications.chime();
      await this.countTheGlass(now, prefs.amountMl);
      await this.say(title, this.countedBody(glass), quote, now);
      return;
    }

    const body = this.askingBody(prefs, glass, options);

    // The card goes up first: it is the part that waits for an answer, and the
    // notification is deliberately the quieter of the two.
    const nudge: WaterNudge = {
      id: this.nudgeCount + 1,
      amountMl: prefs.amountMl,
      glassLabel: glass,
      title,
      body,
      quote,
    };
    this.nudgeCount = nudge.id;
    this.nudge.set(nudge);
    // A question on screen holds the cadence — there is no next reminder to
    // promise until it has been answered.
    this.nextAt.set(null);

    // The tone is what makes someone look up from whatever they are doing and
    // read the card. It follows the user's own sound setting and mute switch.
    this.notifications.chime();

    // The notification carries the same two lines the card shows — the message,
    // and the quote set apart from it — so the nudge reads the same in the app
    // and in the OS notification.
    await this.say(title, body, quote, now);
  }

  /**
   * True when the reminder should count the glass itself rather than ask.
   *
   * Only while the window is the mini widget, and only when the user has left
   * `waterAutoLogWhenMinimized` on. A full window — even one sitting behind
   * another app — is asked about, because that is a window the user can see.
   */
  private countsItself(prefs: WaterPrefs): boolean {
    return prefs.autoLogWhenMinimized && this.ui.isMiniMode();
  }

  /**
   * Counts one glass without asking, and continues the cadence from it.
   *
   * The same bookkeeping as an answer to the card, because it stands in for one:
   * the drink is a real row, the cadence restarts from this moment, and a write
   * that fails is logged rather than thrown at a timer.
   */
  private async countTheGlass(now: Date, amountMl: number): Promise<void> {
    try {
      await this.water.log(amountMl);
    } catch (error) {
      this.log?.warn('system', `water reminder could not count the glass: ${describe(error)}`);
    }

    this.remember(now);
    this.nextAt.set(this.after(now, this.prefs().intervalMinutes));
  }

  /** What the card asks, with the day so far. */
  private askingBody(prefs: WaterPrefs, glass: string, options: { test?: boolean }): string {
    const total = formatMillilitres(this.water.totalMl());
    const goal = formatMillilitres(prefs.goalMl);

    if (options.test) {
      return `This is what a water reminder looks like. Today: ${total} of ${goal}.`;
    }
    if (this.water.goalReached()) {
      return `${total} of ${goal} today — nicely done. Another glass is still a good idea.`;
    }
    return `Time for ${glass}. Today: ${total} of ${goal}.`;
  }

  /** What the notification says when the glass was counted for the user. */
  private countedBody(glass: string): string {
    const total = formatMillilitres(this.water.totalMl());
    const goal = formatMillilitres(this.prefs().goalMl);
    return `${glass} is in today — the window stayed out of the way. Today: ${total} of ${goal}.`;
  }

  /**
   * Sends one OS notification, and writes the line that says it happened.
   *
   * The quote goes as a quote rather than as the message's last sentence: the
   * toast puts it on a line of its own, and every surface the app falls back to
   * gets a blank line before it.
   */
  private async say(title: string, body: string, quote: string, now: Date): Promise<void> {
    try {
      await this.notifications.announce(title, body, {
        quote,
        tag: NotificationService.WATER_NOTIFICATION_TAG,
        sticky: true,
      });
      const total = formatMillilitres(this.water.totalMl());
      const goal = formatMillilitres(this.prefs().goalMl);
      this.log?.info('flow', `water reminder at ${formatClockTime(now)} · ${total} of ${goal}`);
    } catch (error) {
      this.log?.warn('system', `water reminder could not be shown: ${describe(error)}`);
    }
  }

  /** `start` plus `interval` minutes. */
  private after(start: Date, intervalMinutes: number): Date {
    return new Date(start.getTime() + intervalMinutes * 60_000);
  }

  /**
   * Moves the last reminder forward by the time DeepWork was not running, once
   * per run.
   *
   * The interval the user chose is "an hour at the desk". Time with the app
   * closed is not that, and counting it is what put a reminder on the doorstep:
   * the cadence arrived overdue the instant the window opened, which reads as
   * the app having run without them. Folding the absence into the last
   * reminder's instant leaves the next one a full interval away — the same
   * promise the switch makes when it is first turned on.
   *
   * Only the first pass of a run does this; after that the loop is its own
   * clock, and the heartbeat it rewrites every pass says the app was there.
   */
  private foldAwayTime(now: Date): void {
    if (this.awayTimeFolded) return;
    this.awayTimeFolded = true;

    const away = this.awayMs(now);
    if (away <= 0) return;

    const last = this.lastFiredAt();
    if (!last) return;

    // Never past "now": an absence longer than the interval leaves the cadence
    // exactly one interval away rather than in the middle of one.
    this.remember(new Date(Math.min(last.getTime() + away, now.getTime())));
  }

  /** How long DeepWork was not running, in milliseconds. */
  private awayMs(now: Date): number {
    const heartbeat = this.readHeartbeat();
    if (heartbeat !== null) return Math.max(0, now.getTime() - heartbeat);

    // No heartbeat to go by — a store written before this rule existed, or one
    // that was cleared. All of the gap counts as time away, which costs one
    // interval and never a reminder on the doorstep.
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
      // No storage: the cadence simply starts again with this session.
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
  }
}

/** One line from whatever went wrong. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
