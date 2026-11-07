import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core';
import { TimerType, TimerState, PomodoroSession } from '../models/session.model';
import { DEFAULT_SETTINGS } from '../models/settings.model';
import { DbService } from './db.service';
import { SettingsService } from './settings.service';
import { LogService } from './log.service';
import { NotificationService } from './notification.service';
import { localDayKey } from '../utils/nudge-schedule.util';

@Injectable({ providedIn: 'root' })
export class TimerService implements OnDestroy {
  private readonly db = inject(DbService);
  private readonly settingsService = inject(SettingsService);
  private readonly log = inject(LogService);
  private readonly notifications = inject(NotificationService);

  // Signals
  readonly isRunning = signal(false);
  readonly remainingSeconds = signal(DEFAULT_SETTINGS.workDuration);
  readonly timerType = signal<TimerType>('work');
  readonly sessionCount = signal(0);
  readonly currentTaskId = signal<string | null>(null);
  readonly hasInterruptedSession = signal(false);
  readonly activeStartedAt = signal<string | null>(null);

  // Computed
  readonly minutes = computed(() => Math.floor(this.remainingSeconds() / 60));
  readonly seconds = computed(() => this.remainingSeconds() % 60);
  readonly displayTime = computed(() => {
    const m = this.minutes().toString().padStart(2, '0');
    const s = this.seconds().toString().padStart(2, '0');
    return `${m}:${s}`;
  });
  readonly totalDuration = computed(() => this.getDurationForType(this.timerType()));
  /**
   * How far through the current session the clock is: 0 the moment it starts, 1
   * when the time is up.
   *
   * The one value both progress surfaces read — the Dashboard clock's arc and the
   * mini widget's ring — so they fill together, in the same direction, at the
   * same speed. Two of them used to disagree about which end they were counting
   * from, and the mini widget therefore appeared to run backwards next to the
   * full window.
   */
  readonly progress = computed(() => {
    const total = this.totalDuration();
    if (total === 0) return 0;
    return 1 - this.remainingSeconds() / total;
  });

  private intervalId: ReturnType<typeof setInterval> | null = null;
  /** Watches the calendar so a run that crosses midnight starts a new day too. */
  private dayIntervalId: ReturnType<typeof setInterval> | null = null;
  /** The local day the current cycle belongs to. */
  private day = localDayKey(new Date());
  private startedAt: string | null = null;
  /** The linked task's title, passed with `linkTask` by the page that chose it. */
  private currentTaskTitle: string | null = null;
  private lastTickTime: number = 0;
  private persistIntervalId: ReturnType<typeof setInterval> | null = null;
  private onCompleteCallback: ((completedType: TimerType) => void) | null = null;
  private _initialized = false;

  constructor() {
    // The completion alert's own buttons are the app's clock controls, so the
    // clock is what answers them. Registered once, here, because a toast lives in
    // the notification centre long after the alert stops ringing: **Pause** has
    // to stop a session the user started since, and **Start** the next one.
    //
    // **Skip current** moves past the session at the head of the queue and starts
    // the one after it — the same answer the Dashboard's and the widget's own
    // skip buttons give, and the one the user expects from a button that says
    // skip: the next block begins without a second press. **Start** still begins
    // a waiting session, or continues a paused one from its remaining time.
    //
    // **Silent** never arrives — closing the alert is `NotificationService`'s
    // own job, and it does that before asking the clock anything.
    this.notifications.onAlertAction((action) => {
      switch (action) {
        case 'pause':
          this.pause();
          break;
        case 'skip':
          this.skip();
          break;
        case 'start':
          this.start();
          break;
      }
    });
  }

  async init(): Promise<void> {
    if (this._initialized) return;
    this._initialized = true;
    await this.db.init();
    await this.settingsService.loadSettings();

    const today = localDayKey(new Date());
    this.day = today;
    const saved = await this.db.getTimerState();
    const isNewDay = !saved?.lastActiveDate || saved.lastActiveDate !== today;

    if (isNewDay) {
      // A new day is a new cycle. Yesterday's count, its break type, its linked
      // task and a session that was still running are references to a day that
      // is over, and carrying any of them forward is what made the third session
      // of a fresh day look like the fourth of the last one.
      this.beginFreshDay();
      void this.persistState();
    } else if (saved && saved.isRunning && saved.startedAt) {
      // Calculate elapsed time since interruption
      const elapsed = Math.floor((Date.now() - new Date(saved.startedAt).getTime()) / 1000);
      const remaining = Math.max(0, saved.remainingSeconds - elapsed);
      this.timerType.set(saved.type);
      this.sessionCount.set(saved.sessionCount);
      // Within the same day the interrupted session keeps its task. A session
      // from an earlier day never reaches here — it starts the day fresh.
      this.currentTaskId.set(saved.taskId);
      // The saved state carries the id, not the name. One resumed today is named
      // by the Time page from the task row.
      this.currentTaskTitle = null;
      this.remainingSeconds.set(remaining);
      this.activeStartedAt.set(saved.startedAt);
      this.startedAt = saved.startedAt;
      this.hasInterruptedSession.set(true);
    } else if (saved) {
      this.timerType.set(saved.type);
      this.sessionCount.set(saved.sessionCount);
      this.remainingSeconds.set(saved.remainingSeconds || this.getDurationForType(saved.type));
    } else {
      this.remainingSeconds.set(this.getDurationForType('work'));
    }

    this.watchDay();
  }

  onComplete(callback: ((completedType: TimerType) => void) | null): void {
    this.onCompleteCallback = callback;
  }

  start(): void {
    if (this.isRunning()) return;

    // Starting a session is an answer to the completion alert, whichever control
    // did it. The Dashboard and the widget have always dismissed the alert on
    // their own Start buttons; doing it here covers the keyboard shortcut and
    // any future caller too, so a user who starts the next session in the app
    // is not asked again three minutes later about a session they are already in.
    this.notifications.dismiss();

    // If remaining is already 0 (e.g. timer expired while app was closed), just advance
    if (this.remainingSeconds() <= 0) {
      this.advanceToNext();
      this.persistState();
      return;
    }

    this.isRunning.set(true);
    // Preserve original startedAt if resuming an interrupted session (e.g. after page refresh)
    if (!this.startedAt) {
      this.startedAt = new Date().toISOString();
    }
    this.activeStartedAt.set(this.startedAt);
    this.hasInterruptedSession.set(false);
    this.lastTickTime = Date.now();

    this.intervalId = setInterval(() => this.tick(), 1000);
    this.persistIntervalId = setInterval(() => this.persistState(), 30000);
    this.persistState();
    this.log.info('flow', `timer started · ${this.timerType()}`);
  }

  pause(): void {
    if (!this.isRunning()) return;
    this.stopInterval();
    this.isRunning.set(false);
    this.persistState();
    this.log.info('flow', `timer paused · ${this.timerType()}`);
  }

  resume(): void {
    this.start();
  }

  stop(): void {
    const wasRunning = this.isRunning();
    this.stopInterval();
    this.isRunning.set(false);
    this.activeStartedAt.set(null);

    if (wasRunning && this.startedAt) {
      this.recordSession(true);
    }

    this.startedAt = null;
    this.resetToCurrentType();
    this.persistState();
    this.log.info('flow', `timer stopped · ${this.timerType()}`);
  }

  /**
   * Leaves the current session behind and begins the next one.
   *
   * Skip is not a pause: the user is saying "not this block", so the block after
   * it should already be under way. `advanceToNext` sets the next type and its
   * full duration, and `start` then runs it — the same start the Dashboard and
   * the widget press, so the two paths cannot drift apart.
   */
  skip(): void {
    this.stopInterval();
    this.isRunning.set(false);
    this.activeStartedAt.set(null);
    this.startedAt = null;
    this.advanceToNext();
    this.persistState();
    this.log.info('flow', `timer skipped · next is ${this.timerType()}`);
    this.start();
  }

  reset(): void {
    this.stopInterval();
    this.isRunning.set(false);
    this.activeStartedAt.set(null);
    this.startedAt = null;
    this.timerType.set('work');
    this.sessionCount.set(0);
    this.remainingSeconds.set(this.getDurationForType('work'));
    this.persistState();
    this.log.info('flow', 'timer reset');
  }

  /**
   * Puts the clock back to a clean first session: work type, count zero, full
   * duration, no task. It holds no day reference of its own — the caller has
   * already decided the day has turned over.
   */
  private beginFreshDay(): void {
    this.timerType.set('work');
    this.sessionCount.set(0);
    this.remainingSeconds.set(this.getDurationForType('work'));
    this.currentTaskId.set(null);
    this.currentTaskTitle = null;
    this.startedAt = null;
    this.activeStartedAt.set(null);
    this.hasInterruptedSession.set(false);
  }

  /** Starts watching the local calendar, once per service. */
  private watchDay(): void {
    if (this.dayIntervalId) return;
    this.dayIntervalId = setInterval(() => this.ensureCurrentDay(), 30_000);
  }

  /**
   * Starts a new cycle when the local day has moved on while the app stayed
   * open.
   *
   * A run that crosses midnight used to keep yesterday's count and break type,
   * so the first session of the new day could complete the old day's cycle and
   * celebrate work that was finished yesterday. A session that was actually
   * running is recorded as interrupted first, so the time is not lost; then the
   * clock starts the day as it does on a launch.
   */
  private ensureCurrentDay(now: Date = new Date()): void {
    const day = localDayKey(now);
    if (day === this.day) return;
    this.day = day;

    if (this.isRunning()) {
      this.stopInterval();
      this.isRunning.set(false);
      this.activeStartedAt.set(null);
      this.recordSession(true);
    }
    this.beginFreshDay();
    void this.persistState();
    this.log.info('flow', 'new day: timer reset to a fresh focus session');
  }

  linkTask(taskId: string | null, taskTitle: string | null = null): void {
    this.currentTaskId.set(taskId);
    this.currentTaskTitle = taskId ? taskTitle : null;
  }

  private tick(): void {
    const now = Date.now();
    const elapsed = Math.round((now - this.lastTickTime) / 1000);
    this.lastTickTime = now;

    const newRemaining = Math.max(0, this.remainingSeconds() - elapsed);
    this.remainingSeconds.set(newRemaining);

    if (newRemaining <= 0) {
      this.onTimerComplete();
    }
  }

  private onTimerComplete(): void {
    this.stopInterval();
    this.isRunning.set(false);
    this.activeStartedAt.set(null);
    this.recordSession(false);
    const completedType = this.timerType();
    this.startedAt = null;
    this.log.info('flow', `timer finished · ${completedType}`);

    // Advance to the next timer type (e.g., work -> short-break)
    this.advanceToNext();

    // Announced from here, because a finished session is the timer's news and not
    // any one page's: the ring, the card and the OS notification used to hang off
    // `DashboardComponent`, so a focus session — or a break — that ended while the
    // user was on another page, or in the mini widget, finished in complete
    // silence. Every session type goes through this one line.
    void this.notifications.fireTimerComplete(completedType, this.timerType());

    if (this.onCompleteCallback) {
      this.onCompleteCallback(completedType);
    }

    this.persistState();
  }

  private advanceToNext(): void {
    const current = this.timerType();

    if (current === 'work') {
      const count = this.sessionCount() + 1;
      this.sessionCount.set(count);

      if (count % this.settingsService.settings().sessionsBeforeLongBreak === 0) {
        this.timerType.set('long-break');
        this.remainingSeconds.set(this.getDurationForType('long-break'));
      } else {
        this.timerType.set('short-break');
        this.remainingSeconds.set(this.getDurationForType('short-break'));
      }
    } else {
      this.timerType.set('work');
      this.remainingSeconds.set(this.getDurationForType('work'));
    }
  }

  private resetToCurrentType(): void {
    this.remainingSeconds.set(this.getDurationForType(this.timerType()));
  }

  private getDurationForType(type: TimerType): number {
    const settings = this.settingsService.settings();
    switch (type) {
      case 'work':
        return settings.workDuration;
      case 'short-break':
        return settings.shortBreak;
      case 'long-break':
        return settings.longBreak;
    }
  }

  private recordSession(interrupted: boolean): void {
    if (!this.startedAt) return;

    const planned = this.getDurationForType(this.timerType());
    // Use wall-clock elapsed time to avoid inflated durations after pause/resume
    const wallClockElapsed = Math.floor((Date.now() - new Date(this.startedAt).getTime()) / 1000);
    const actual = Math.max(1, Math.min(wallClockElapsed, planned));

    const taskId = this.currentTaskId();
    // Snapshot the name, not only the id: a deleted task clears `taskId` in the
    // sessions table, and the Time page must still know which work the hours
    // paid for.
    const taskTitle = taskId ? this.currentTaskTitle : null;

    const session: PomodoroSession = {
      id: crypto.randomUUID(),
      taskId,
      taskTitle,
      type: this.timerType(),
      durationPlanned: planned,
      durationActual: actual,
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
      interrupted,
    };

    this.db.saveSession(session);
    this.startedAt = null;
  }

  private async persistState(): Promise<void> {
    const state: TimerState = {
      isRunning: this.isRunning(),
      type: this.timerType(),
      remainingSeconds: this.remainingSeconds(),
      taskId: this.currentTaskId(),
      sessionCount: this.sessionCount(),
      startedAt: this.startedAt,
      lastActiveDate: localDayKey(new Date()),
    };
    await this.db.saveTimerState(state);
  }

  private stopInterval(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.persistIntervalId) {
      clearInterval(this.persistIntervalId);
      this.persistIntervalId = null;
    }
  }

  ngOnDestroy(): void {
    this.stopInterval();
    if (this.dayIntervalId) {
      clearInterval(this.dayIntervalId);
      this.dayIntervalId = null;
    }
    this.persistState();
  }
}
