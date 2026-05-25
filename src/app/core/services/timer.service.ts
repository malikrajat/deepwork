import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core';
import { TimerType, TimerState, PomodoroSession } from '../models/session.model';
import { AppSettings, DEFAULT_SETTINGS } from '../models/settings.model';
import { DbService } from './db.service';

@Injectable({ providedIn: 'root' })
export class TimerService implements OnDestroy {
  private db = inject(DbService);

  // Signals
  readonly isRunning = signal(false);
  readonly remainingSeconds = signal(DEFAULT_SETTINGS.workDuration);
  readonly timerType = signal<TimerType>('work');
  readonly sessionCount = signal(0);
  readonly currentTaskId = signal<string | null>(null);
  readonly hasInterruptedSession = signal(false);

  // Computed
  readonly minutes = computed(() => Math.floor(this.remainingSeconds() / 60));
  readonly seconds = computed(() => this.remainingSeconds() % 60);
  readonly displayTime = computed(() => {
    const m = this.minutes().toString().padStart(2, '0');
    const s = this.seconds().toString().padStart(2, '0');
    return `${m}:${s}`;
  });
  readonly totalDuration = computed(() => this.getDurationForType(this.timerType()));
  readonly progress = computed(() => {
    const total = this.totalDuration();
    if (total === 0) return 0;
    return 1 - this.remainingSeconds() / total;
  });

  private settings: AppSettings = DEFAULT_SETTINGS;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startedAt: string | null = null;
  private lastTickTime: number = 0;
  private persistIntervalId: ReturnType<typeof setInterval> | null = null;
  private onCompleteCallback: (() => void) | null = null;

  async init(): Promise<void> {
    await this.db.init();
    this.settings = await this.db.getSettings();

    const saved = await this.db.getTimerState();
    if (saved && saved.isRunning && saved.startedAt) {
      // Calculate elapsed time since interruption
      const elapsed = Math.floor((Date.now() - new Date(saved.startedAt).getTime()) / 1000);
      const remaining = Math.max(0, saved.remainingSeconds - elapsed);
      this.timerType.set(saved.type);
      this.sessionCount.set(saved.sessionCount);
      this.currentTaskId.set(saved.taskId);
      this.remainingSeconds.set(remaining);
      this.hasInterruptedSession.set(true);
    } else if (saved) {
      this.timerType.set(saved.type);
      this.sessionCount.set(saved.sessionCount);
      this.remainingSeconds.set(saved.remainingSeconds || this.getDurationForType(saved.type));
    } else {
      this.remainingSeconds.set(this.settings.workDuration);
    }
  }

  onComplete(callback: () => void): void {
    this.onCompleteCallback = callback;
  }

  start(): void {
    if (this.isRunning()) return;
    this.isRunning.set(true);
    this.hasInterruptedSession.set(false);
    this.startedAt = new Date().toISOString();
    this.lastTickTime = Date.now();

    this.intervalId = setInterval(() => this.tick(), 1000);
    this.persistIntervalId = setInterval(() => this.persistState(), 30000);
    this.persistState();
  }

  pause(): void {
    if (!this.isRunning()) return;
    this.stopInterval();
    this.isRunning.set(false);
    this.persistState();
  }

  resume(): void {
    this.start();
  }

  stop(): void {
    const wasRunning = this.isRunning();
    this.stopInterval();
    this.isRunning.set(false);

    if (wasRunning && this.startedAt) {
      this.recordSession(true);
    }

    this.resetToCurrentType();
    this.persistState();
  }

  skip(): void {
    this.stopInterval();
    this.isRunning.set(false);
    this.advanceToNext();
    this.persistState();
  }

  reset(): void {
    this.stopInterval();
    this.isRunning.set(false);
    this.timerType.set('work');
    this.sessionCount.set(0);
    this.remainingSeconds.set(this.settings.workDuration);
    this.persistState();
  }

  linkTask(taskId: string | null): void {
    this.currentTaskId.set(taskId);
  }

  async updateSettings(newSettings: AppSettings): Promise<void> {
    this.settings = newSettings;
    if (!this.isRunning()) {
      this.remainingSeconds.set(this.getDurationForType(this.timerType()));
    }
    await this.db.saveSettings(newSettings);
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
    this.recordSession(false);

    if (this.onCompleteCallback) {
      this.onCompleteCallback();
    }

    this.advanceToNext();
    this.persistState();
  }

  private advanceToNext(): void {
    const current = this.timerType();

    if (current === 'work') {
      const count = this.sessionCount() + 1;
      this.sessionCount.set(count);

      if (count % this.settings.sessionsBeforeLongBreak === 0) {
        this.timerType.set('long-break');
        this.remainingSeconds.set(this.settings.longBreak);
      } else {
        this.timerType.set('short-break');
        this.remainingSeconds.set(this.settings.shortBreak);
      }
    } else {
      this.timerType.set('work');
      this.remainingSeconds.set(this.settings.workDuration);
    }
  }

  private resetToCurrentType(): void {
    this.remainingSeconds.set(this.getDurationForType(this.timerType()));
  }

  private getDurationForType(type: TimerType): number {
    switch (type) {
      case 'work': return this.settings.workDuration;
      case 'short-break': return this.settings.shortBreak;
      case 'long-break': return this.settings.longBreak;
    }
  }

  private recordSession(interrupted: boolean): void {
    if (!this.startedAt) return;

    const planned = this.getDurationForType(this.timerType());
    const actual = planned - this.remainingSeconds();

    const session: PomodoroSession = {
      id: crypto.randomUUID(),
      taskId: this.currentTaskId(),
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
    this.persistState();
  }
}
