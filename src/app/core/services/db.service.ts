import { Injectable, signal } from '@angular/core';
import { TimerState, PomodoroSession } from '../models/session.model';
import { AppSettings, DEFAULT_SETTINGS } from '../models/settings.model';
import { Task } from '../models/task.model';

/**
 * Wraps @tauri-apps/plugin-sql with typed, parameterized query methods.
 * Falls back to localStorage when running outside Tauri (browser dev).
 */
@Injectable({ providedIn: 'root' })
export class DbService {
  private db: any = null;
  private readonly initialized = signal(false);
  private isBrowser = false;

  async init(): Promise<void> {
    if (this.initialized()) return;
    try {
      const { default: Database } = await import('@tauri-apps/plugin-sql');
      this.db = await Database.load('sqlite:deepwork.db');
      this.initialized.set(true);
    } catch {
      console.warn('DbService: Running in browser mode (localStorage)');
      this.isBrowser = true;
      this.initialized.set(true);
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

  // --- localStorage helpers ---
  private lsGet<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`deepwork_${key}`);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  private lsSet(key: string, value: unknown): void {
    localStorage.setItem(`deepwork_${key}`, JSON.stringify(value));
  }

  async getSettings(): Promise<AppSettings> {
    if (this.isBrowser) {
      const raw = this.lsGet<Partial<AppSettings>>('settings', {});
      return { ...DEFAULT_SETTINGS, ...raw };
    }
    const rows = await this.query<any>('SELECT * FROM settings WHERE id = 1');
    if (!rows.length) return DEFAULT_SETTINGS;
    const r = rows[0];
    return {
      workDuration: r.work_duration ?? DEFAULT_SETTINGS.workDuration,
      shortBreak: r.short_break ?? DEFAULT_SETTINGS.shortBreak,
      longBreak: r.long_break ?? DEFAULT_SETTINGS.longBreak,
      sessionsBeforeLongBreak: r.sessions_before_long_break ?? DEFAULT_SETTINGS.sessionsBeforeLongBreak,
      notificationSound: r.notification_sound === 'bell' || r.notification_sound === 'chime' ||
        r.notification_sound === 'ding' || r.notification_sound === 'none'
        ? r.notification_sound
        : DEFAULT_SETTINGS.notificationSound,
      notificationRepeatInterval: r.notification_repeat_interval ?? DEFAULT_SETTINGS.notificationRepeatInterval,
      trayBehavior: r.tray_behavior === 'minimize' || r.tray_behavior === 'quit'
        ? r.tray_behavior
        : DEFAULT_SETTINGS.trayBehavior,
      theme: r.theme === 'light' || r.theme === 'dark' || r.theme === 'system' ? r.theme : DEFAULT_SETTINGS.theme,
    };
  }

  async saveSettings(s: AppSettings): Promise<void> {
    const merged = { ...DEFAULT_SETTINGS, ...s };
    if (this.isBrowser) { this.lsSet('settings', merged); return; }
    await this.execute(
      `UPDATE settings SET work_duration = $1, short_break = $2, long_break = $3,
       sessions_before_long_break = $4, notification_sound = $5, tray_behavior = $6, theme = $7,
       notification_repeat_interval = $8
       WHERE id = 1`,
      [merged.workDuration, merged.shortBreak, merged.longBreak, merged.sessionsBeforeLongBreak, merged.notificationSound, merged.trayBehavior, merged.theme, merged.notificationRepeatInterval]
    );
  }

  async getTimerState(): Promise<TimerState | null> {
    if (this.isBrowser) return this.lsGet<TimerState | null>('timerState', null);
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
      lastActiveDate: r.last_active_date ?? null,
    };
  }

  async saveTimerState(state: TimerState): Promise<void> {
    if (this.isBrowser) { this.lsSet('timerState', state); return; }
    await this.execute(
      `UPDATE timer_state SET is_running = $1, type = $2, remaining_seconds = $3,
       task_id = $4, session_count = $5, started_at = $6, last_active_date = $7 WHERE id = 1`,
      [state.isRunning ? 1 : 0, state.type, state.remainingSeconds, state.taskId, state.sessionCount, state.startedAt, state.lastActiveDate]
    );
  }

  async saveSession(session: PomodoroSession): Promise<void> {
    if (this.isBrowser) {
      const sessions = this.lsGet<PomodoroSession[]>('sessions', []);
      sessions.push(session);
      this.lsSet('sessions', sessions);
      return;
    }
    await this.execute(
      `INSERT INTO sessions (id, task_id, type, duration_planned, duration_actual, started_at, completed_at, interrupted)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [session.id, session.taskId, session.type, session.durationPlanned, session.durationActual, session.startedAt, session.completedAt, session.interrupted ? 1 : 0]
    );
  }

  async getTodaySessions(): Promise<PomodoroSession[]> {
    if (this.isBrowser) {
      const today = new Date().toISOString().slice(0, 10);
      const all = this.lsGet<PomodoroSession[]>('sessions', []);
      return all.filter(s => s.startedAt >= today);
    }
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

  async getAllSessions(): Promise<PomodoroSession[]> {
    if (this.isBrowser) {
      return this.lsGet<PomodoroSession[]>('sessions', []);
    }
    const rows = await this.query<any>(`SELECT * FROM sessions ORDER BY started_at DESC`);
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

  async getSessionsSince(dateStr: string): Promise<PomodoroSession[]> {
    if (this.isBrowser) {
      const all = this.lsGet<PomodoroSession[]>('sessions', []);
      return all.filter(s => s.startedAt >= dateStr);
    }
    const rows = await this.query<any>(
      `SELECT * FROM sessions WHERE started_at >= $1 ORDER BY started_at ASC`,
      [dateStr]
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

  // ==================== HABIT METHODS ====================

  async getHabits(): Promise<any[]> {
    if (this.isBrowser) return this.lsGet<any[]>('habits', []);
    const rows = await this.query<any>('SELECT * FROM habits ORDER BY created_at ASC');
    return rows.map(r => ({ id: r.id, name: r.name, icon: r.icon, targetFrequency: r.target_frequency, createdAt: r.created_at }));
  }

  async createHabit(habit: { id: string; name: string; icon: string; targetFrequency: string; createdAt: string }): Promise<void> {
    if (this.isBrowser) {
      const habits = this.lsGet<any[]>('habits', []);
      habits.push(habit);
      this.lsSet('habits', habits);
      return;
    }
    await this.execute(
      `INSERT INTO habits (id, name, icon, target_frequency, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [habit.id, habit.name, habit.icon, habit.targetFrequency, habit.createdAt]
    );
  }

  async deleteHabit(id: string): Promise<void> {
    if (this.isBrowser) {
      const habits = this.lsGet<any[]>('habits', []).filter(h => h.id !== id);
      this.lsSet('habits', habits);
      const entries = this.lsGet<any[]>('habitEntries', []).filter(e => e.habitId !== id);
      this.lsSet('habitEntries', entries);
      return;
    }
    await this.execute('DELETE FROM habits WHERE id = $1', [id]);
  }

  async getHabitEntries(habitId: string): Promise<any[]> {
    if (this.isBrowser) {
      return this.lsGet<any[]>('habitEntries', []).filter(e => e.habitId === habitId);
    }
    const rows = await this.query<any>('SELECT * FROM habit_entries WHERE habit_id = $1 ORDER BY completed_at ASC', [habitId]);
    return rows.map(r => ({ id: r.id, habitId: r.habit_id, completedAt: r.completed_at }));
  }

  async getAllHabitEntries(): Promise<any[]> {
    if (this.isBrowser) {
      return this.lsGet<any[]>('habitEntries', []);
    }
    const rows = await this.query<any>('SELECT * FROM habit_entries ORDER BY completed_at ASC');
    return rows.map(r => ({ id: r.id, habitId: r.habit_id, completedAt: r.completed_at }));
  }

  async addHabitEntry(entry: { id: string; habitId: string; completedAt: string }): Promise<void> {
    if (this.isBrowser) {
      const entries = this.lsGet<any[]>('habitEntries', []);
      entries.push(entry);
      this.lsSet('habitEntries', entries);
      return;
    }
    await this.execute(
      `INSERT INTO habit_entries (id, habit_id, completed_at) VALUES ($1, $2, $3)`,
      [entry.id, entry.habitId, entry.completedAt]
    );
  }

  async removeHabitEntry(id: string): Promise<void> {
    if (this.isBrowser) {
      const entries = this.lsGet<any[]>('habitEntries', []).filter(e => e.id !== id);
      this.lsSet('habitEntries', entries);
      return;
    }
    await this.execute('DELETE FROM habit_entries WHERE id = $1', [id]);
  }

  // ==================== JOURNAL METHODS ====================

  async getJournalEntries(): Promise<any[]> {
    if (this.isBrowser) return this.lsGet<any[]>('journal', []);
    const rows = await this.query<any>('SELECT * FROM journal_entries ORDER BY date DESC');
    return rows.map(r => ({ id: r.id, date: r.date, content: r.content, createdAt: r.created_at, updatedAt: r.updated_at }));
  }

  async getJournalEntry(date: string): Promise<any> {
    if (this.isBrowser) {
      const entries = this.lsGet<any[]>('journal', []);
      return entries.find(e => e.date === date) ?? null;
    }
    const rows = await this.query<any>('SELECT * FROM journal_entries WHERE date = $1', [date]);
    return rows.length ? { id: rows[0].id, date: rows[0].date, content: rows[0].content, createdAt: rows[0].created_at, updatedAt: rows[0].updated_at } : null;
  }

  async saveJournalEntry(entry: { id: string; date: string; content: string; createdAt: string; updatedAt: string }): Promise<void> {
    if (this.isBrowser) {
      const entries = this.lsGet<any[]>('journal', []);
      const idx = entries.findIndex(e => e.date === entry.date);
      if (idx >= 0) entries[idx] = entry;
      else entries.push(entry);
      this.lsSet('journal', entries);
      return;
    }
    await this.execute(
      `INSERT INTO journal_entries (id, date, content, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(date) DO UPDATE SET content = $3, updated_at = $5`,
      [entry.id, entry.date, entry.content, entry.createdAt, entry.updatedAt]
    );
  }

  // ==================== TASK METHODS ====================

  async getTasks(): Promise<Task[]> {
    if (this.isBrowser) return this.lsGet<Task[]>('tasks', []);
    const rows = await this.query<any>('SELECT * FROM tasks ORDER BY created_at DESC');
    return rows.map(r => this.mapTask(r));
  }

  async getTaskById(id: string): Promise<Task | null> {
    if (this.isBrowser) {
      const tasks = this.lsGet<Task[]>('tasks', []);
      return tasks.find(t => t.id === id) ?? null;
    }
    const rows = await this.query<any>('SELECT * FROM tasks WHERE id = $1', [id]);
    return rows.length ? this.mapTask(rows[0]) : null;
  }

  async getTasksByQuadrant(quadrant: string): Promise<Task[]> {
    if (this.isBrowser) {
      return this.lsGet<Task[]>('tasks', []).filter(t => t.quadrant === quadrant);
    }
    const rows = await this.query<any>('SELECT * FROM tasks WHERE quadrant = $1 ORDER BY priority ASC', [quadrant]);
    return rows.map(r => this.mapTask(r));
  }

  async getTasksByStatus(status: string): Promise<Task[]> {
    if (this.isBrowser) {
      return this.lsGet<Task[]>('tasks', []).filter(t => t.status === status);
    }
    const rows = await this.query<any>('SELECT * FROM tasks WHERE status = $1 ORDER BY created_at DESC', [status]);
    return rows.map(r => this.mapTask(r));
  }

  async getTodayTasks(): Promise<Task[]> {
    if (this.isBrowser) {
      return this.lsGet<Task[]>('tasks', [])
        .filter(t => t.todayOrder !== null)
        .sort((a, b) => (a.todayOrder ?? 0) - (b.todayOrder ?? 0));
    }
    const rows = await this.query<any>('SELECT * FROM tasks WHERE today_order IS NOT NULL ORDER BY today_order ASC');
    return rows.map(r => this.mapTask(r));
  }

  async createTask(task: Task): Promise<void> {
    if (this.isBrowser) {
      const tasks = this.lsGet<Task[]>('tasks', []);
      tasks.unshift(task);
      this.lsSet('tasks', tasks);
      return;
    }
    await this.execute(
      `INSERT INTO tasks (id, title, description, priority, status, quadrant, deadline, tags, recurrence, today_order, created_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [task.id, task.title, task.description, task.priority, task.status, task.quadrant, task.deadline,
       JSON.stringify(task.tags), task.recurrence ? JSON.stringify(task.recurrence) : null,
       task.todayOrder, task.createdAt, task.completedAt]
    );
  }

  async updateTask(task: Task): Promise<void> {
    if (this.isBrowser) {
      const tasks = this.lsGet<Task[]>('tasks', []);
      const idx = tasks.findIndex(t => t.id === task.id);
      if (idx >= 0) tasks[idx] = task;
      this.lsSet('tasks', tasks);
      return;
    }
    await this.execute(
      `UPDATE tasks SET title=$1, description=$2, priority=$3, status=$4, quadrant=$5,
       deadline=$6, tags=$7, recurrence=$8, today_order=$9, completed_at=$10 WHERE id=$11`,
      [task.title, task.description, task.priority, task.status, task.quadrant, task.deadline,
       JSON.stringify(task.tags), task.recurrence ? JSON.stringify(task.recurrence) : null,
       task.todayOrder, task.completedAt, task.id]
    );
  }

  async deleteTask(id: string): Promise<void> {
    if (this.isBrowser) {
      const tasks = this.lsGet<Task[]>('tasks', []).filter(t => t.id !== id);
      this.lsSet('tasks', tasks);
      return;
    }
    await this.execute('DELETE FROM tasks WHERE id = $1', [id]);
  }

  async searchTasks(query: string): Promise<Task[]> {
    if (this.isBrowser) {
      const q = query.toLowerCase();
      return this.lsGet<Task[]>('tasks', []).filter(t =>
        t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      );
    }
    const rows = await this.query<any>(
      'SELECT * FROM tasks WHERE title LIKE $1 OR description LIKE $1 ORDER BY created_at DESC',
      [`%${query}%`]
    );
    return rows.map(r => this.mapTask(r));
  }

  // ==================== BACKUP / RESTORE ====================

  async exportAll(): Promise<any> {
    const [sessions, tasks, habits, habitEntries, journal, settings, timerState] = await Promise.all([
      this.getAllSessions(),
      this.getTasks(),
      this.getHabits(),
      this.getAllHabitEntries(),
      this.getJournalEntries(),
      this.getSettings(),
      this.getTimerState(),
    ]);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions,
      tasks,
      habits,
      habitEntries,
      journal,
      settings,
      timerState,
    };
  }

  async clearAllData(): Promise<void> {
    if (this.isBrowser) {
      this.lsSet('sessions', []);
      this.lsSet('tasks', []);
      this.lsSet('habits', []);
      this.lsSet('habitEntries', []);
      this.lsSet('journal', []);
      this.lsSet('timerState', null);
      return;
    }
    // Delete children before parents to respect foreign keys
    await this.execute('DELETE FROM habit_entries');
    await this.execute('DELETE FROM habits');
    await this.execute('DELETE FROM sessions');
    await this.execute('DELETE FROM tasks');
    await this.execute('DELETE FROM journal_entries');
    await this.execute('UPDATE timer_state SET is_running = 0, type = "work", remaining_seconds = 0, task_id = NULL, session_count = 0, started_at = NULL WHERE id = 1');
  }

  async importBackup(data: any): Promise<void> {
    await this.clearAllData();
    // Tasks first so session foreign keys resolve
    for (const t of data.tasks ?? []) {
      await this.createTask(t);
    }
    for (const h of data.habits ?? []) {
      await this.createHabit(h);
    }
    for (const e of data.habitEntries ?? []) {
      await this.addHabitEntry(e);
    }
    for (const s of data.sessions ?? []) {
      await this.saveSession(s);
    }
    for (const j of data.journal ?? []) {
      await this.saveJournalEntry(j);
    }
    if (data.settings) {
      await this.saveSettings(data.settings);
    }
    if (data.timerState) {
      await this.saveTimerState(data.timerState);
    }
  }

  private parseRecurrence(value: unknown): any {
    if (!value) return null;
    if (typeof value === 'string') return JSON.parse(value);
    return value;
  }

  private mapTask(r: any): Task {
    return {
      id: r.id,
      title: r.title,
      description: r.description ?? '',
      priority: r.priority ?? 3,
      status: r.status ?? 'todo',
      quadrant: r.quadrant ?? null,
      deadline: r.deadline ?? null,
      tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags ?? []),
      recurrence: this.parseRecurrence(r.recurrence),
      todayOrder: r.today_order ?? r.todayOrder ?? null,
      createdAt: r.created_at ?? r.createdAt,
      completedAt: r.completed_at ?? r.completedAt ?? null,
    };
  }
}
