import { Injectable, signal } from '@angular/core';
import { TimerState, PomodoroSession } from '../models/session.model';
import { AppSettings, DEFAULT_SETTINGS } from '../models/settings.model';

/**
 * Wraps @tauri-apps/plugin-sql with typed, parameterized query methods.
 * Falls back to in-memory state when running outside Tauri (browser dev).
 */
@Injectable({ providedIn: 'root' })
export class DbService {
  private db: any = null;
  private initialized = signal(false);

  async init(): Promise<void> {
    if (this.initialized()) return;
    try {
      const { default: Database } = await import('@tauri-apps/plugin-sql');
      this.db = await Database.load('sqlite:deepwork.db');
      this.initialized.set(true);
    } catch {
      console.warn('DbService: Running without Tauri SQL plugin (browser mode)');
    }
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.db) return [];
    return this.db.select(sql, params);
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ rowsAffected: number; lastInsertId: number }> {
    if (!this.db) return { rowsAffected: 0, lastInsertId: 0 };
    return this.db.execute(sql, params);
  }

  async getSettings(): Promise<AppSettings> {
    const rows = await this.query<any>('SELECT * FROM settings WHERE id = 1');
    if (!rows.length) return DEFAULT_SETTINGS;
    const r = rows[0];
    return {
      workDuration: r.work_duration,
      shortBreak: r.short_break,
      longBreak: r.long_break,
      sessionsBeforeLongBreak: r.sessions_before_long_break,
      notificationSound: r.notification_sound,
      trayBehavior: r.tray_behavior,
      theme: r.theme,
    };
  }

  async saveSettings(s: AppSettings): Promise<void> {
    await this.execute(
      `UPDATE settings SET work_duration = $1, short_break = $2, long_break = $3,
       sessions_before_long_break = $4, notification_sound = $5, tray_behavior = $6, theme = $7
       WHERE id = 1`,
      [s.workDuration, s.shortBreak, s.longBreak, s.sessionsBeforeLongBreak, s.notificationSound, s.trayBehavior, s.theme]
    );
  }

  async getTimerState(): Promise<TimerState | null> {
    const rows = await this.query<any>('SELECT * FROM timer_state WHERE id = 1');
    if (!rows.length) return null;
    const r = rows[0];
    return {
      isRunning: !!r.is_running,
      type: r.type ?? 'work',
      remainingSeconds: r.remaining_seconds ?? 0,
      taskId: r.task_id,
      sessionCount: r.session_count ?? 0,
      startedAt: r.started_at,
    };
  }

  async saveTimerState(state: TimerState): Promise<void> {
    await this.execute(
      `UPDATE timer_state SET is_running = $1, type = $2, remaining_seconds = $3,
       task_id = $4, session_count = $5, started_at = $6 WHERE id = 1`,
      [state.isRunning ? 1 : 0, state.type, state.remainingSeconds, state.taskId, state.sessionCount, state.startedAt]
    );
  }

  async saveSession(session: PomodoroSession): Promise<void> {
    await this.execute(
      `INSERT INTO sessions (id, task_id, type, duration_planned, duration_actual, started_at, completed_at, interrupted)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [session.id, session.taskId, session.type, session.durationPlanned, session.durationActual, session.startedAt, session.completedAt, session.interrupted ? 1 : 0]
    );
  }

  async getTodaySessions(): Promise<PomodoroSession[]> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.query<any>(
      `SELECT * FROM sessions WHERE started_at >= $1 ORDER BY started_at ASC`,
      [today]
    );
    return rows.map(r => ({
      id: r.id,
      taskId: r.task_id,
      type: r.type,
      durationPlanned: r.duration_planned,
      durationActual: r.duration_actual,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      interrupted: !!r.interrupted,
    }));
  }
}
