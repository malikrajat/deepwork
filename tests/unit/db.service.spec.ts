import { describe, it, expect, beforeEach } from 'vitest';
import { DbService } from '../../src/app/core/services/db.service';
import { DEFAULT_SETTINGS } from '../../src/app/core/models/settings.model';
import { Task } from '../../src/app/core/models/task.model';
import { PomodoroSession } from '../../src/app/core/models/session.model';

// All tests run in browser/localStorage fallback mode (no Tauri plugin available).

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: crypto.randomUUID(),
  title: 'Test task',
  description: '',
  priority: 3,
  status: 'todo',
  quadrant: null,
  deadline: null,
  tags: [],
  recurrence: null,
  todayOrder: null,
  createdAt: new Date().toISOString(),
  completedAt: null,
  ...overrides,
});

const makeSession = (overrides: Partial<PomodoroSession> = {}): PomodoroSession => ({
  id: crypto.randomUUID(),
  taskId: null,
  type: 'work',
  durationPlanned: 1500,
  durationActual: 1500,
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  interrupted: false,
  ...overrides,
});

describe('DbService (browser/localStorage mode)', () => {
  let db: DbService;

  beforeEach(() => {
    localStorage.clear();
    db = new DbService();
  });

  // ── init ─────────────────────────────────────────────────────────────

  it('init() sets browser fallback when Tauri plugin is absent', async () => {
    await db.init();
    const s = await db.getSettings();
    expect(s).toBeDefined();
  });

  it('init() is idempotent (safe to call multiple times)', async () => {
    await db.init();
    await db.init();
    const s = await db.getSettings();
    expect(s).toBeDefined();
  });

  // ── Settings ──────────────────────────────────────────────────────────

  it('getSettings() returns DEFAULT_SETTINGS when nothing stored', async () => {
    await db.init();
    const s = await db.getSettings();
    expect(s.workDuration).toBe(DEFAULT_SETTINGS.workDuration);
    expect(s.shortBreak).toBe(DEFAULT_SETTINGS.shortBreak);
    expect(s.longBreak).toBe(DEFAULT_SETTINGS.longBreak);
    expect(s.sessionsBeforeLongBreak).toBe(DEFAULT_SETTINGS.sessionsBeforeLongBreak);
    expect(s.notificationSound).toBe(DEFAULT_SETTINGS.notificationSound);
  });

  it('saveSettings() / getSettings() roundtrip', async () => {
    await db.init();
    const custom = { ...DEFAULT_SETTINGS, workDuration: 3000, notificationSound: 'chime' };
    await db.saveSettings(custom);
    const loaded = await db.getSettings();
    expect(loaded.workDuration).toBe(3000);
    expect(loaded.notificationSound).toBe('chime');
  });

  // ── Tasks ─────────────────────────────────────────────────────────────

  it('getTasks() returns empty array when nothing stored', async () => {
    await db.init();
    const tasks = await db.getTasks();
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks).toHaveLength(0);
  });

  it('createTask() / getTasks() roundtrip', async () => {
    await db.init();
    const t = makeTask({ title: 'Buy milk' });
    await db.createTask(t);
    const tasks = await db.getTasks();
    expect(tasks.find((x: Task) => x.id === t.id)).toBeDefined();
    expect(tasks.find((x: Task) => x.id === t.id)?.title).toBe('Buy milk');
  });

  it('updateTask() persists changes', async () => {
    await db.init();
    const t = makeTask();
    await db.createTask(t);
    await db.updateTask({ ...t, title: 'Updated', status: 'done' });
    const tasks = await db.getTasks();
    const found = tasks.find((x: Task) => x.id === t.id);
    expect(found?.title).toBe('Updated');
    expect(found?.status).toBe('done');
  });

  it('deleteTask() removes task', async () => {
    await db.init();
    const t = makeTask();
    await db.createTask(t);
    await db.deleteTask(t.id);
    const tasks = await db.getTasks();
    expect(tasks.find((x: Task) => x.id === t.id)).toBeUndefined();
  });

  it('can create and retrieve multiple tasks', async () => {
    await db.init();
    const t1 = makeTask({ title: 'Task A' });
    const t2 = makeTask({ title: 'Task B' });
    await db.createTask(t1);
    await db.createTask(t2);
    const tasks = await db.getTasks();
    expect(tasks.length).toBeGreaterThanOrEqual(2);
  });

  // ── Sessions ──────────────────────────────────────────────────────────

  it('getTodaySessions() returns empty array initially', async () => {
    await db.init();
    const sessions = await db.getTodaySessions();
    expect(Array.isArray(sessions)).toBe(true);
  });

  it('saveSession() / getTodaySessions() roundtrip', async () => {
    await db.init();
    const s = makeSession();
    await db.saveSession(s);
    const sessions = await db.getTodaySessions();
    expect(sessions.find((x: PomodoroSession) => x.id === s.id)).toBeDefined();
  });

  it('getAllSessions() includes all persisted sessions', async () => {
    await db.init();
    const s1 = makeSession({ type: 'work' });
    const s2 = makeSession({ type: 'short-break' });
    await db.saveSession(s1);
    await db.saveSession(s2);
    const all = await db.getAllSessions();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  // ── Timer state ───────────────────────────────────────────────────────

  it('getTimerState() returns null initially', async () => {
    await db.init();
    const state = await db.getTimerState();
    expect(state).toBeNull();
  });

  it('saveTimerState() / getTimerState() roundtrip', async () => {
    await db.init();
    const state = {
      isRunning: false,
      type: 'work' as const,
      remainingSeconds: 900,
      taskId: null,
      sessionCount: 2,
      startedAt: null,
    };
    await db.saveTimerState(state);
    const loaded = await db.getTimerState();
    expect(loaded?.remainingSeconds).toBe(900);
    expect(loaded?.sessionCount).toBe(2);
    expect(loaded?.isRunning).toBe(false);
  });

  // ── Habits ────────────────────────────────────────────────────────────

  it('getHabits() returns empty array initially', async () => {
    await db.init();
    const habits = await db.getHabits();
    expect(Array.isArray(habits)).toBe(true);
    expect(habits).toHaveLength(0);
  });

  it('createHabit() / getHabits() roundtrip', async () => {
    await db.init();
    const habit = { id: crypto.randomUUID(), name: 'Meditate', icon: '🧘', targetFrequency: 'daily', createdAt: new Date().toISOString() };
    await db.createHabit(habit);
    const habits = await db.getHabits();
    expect(habits.find((h: any) => h.id === habit.id)).toBeDefined();
    expect(habits.find((h: any) => h.id === habit.id)?.name).toBe('Meditate');
  });

  it('deleteHabit() removes habit', async () => {
    await db.init();
    const habit = { id: crypto.randomUUID(), name: 'Exercise', icon: '💪', targetFrequency: 'daily', createdAt: new Date().toISOString() };
    await db.createHabit(habit);
    await db.deleteHabit(habit.id);
    const habits = await db.getHabits();
    expect(habits.find((h: any) => h.id === habit.id)).toBeUndefined();
  });
});
