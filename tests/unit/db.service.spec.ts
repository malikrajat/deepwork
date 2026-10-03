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

  it('keeps the water reminder preferences, and ignores values it did not offer', async () => {
    await db.init();
    const chosen = {
      ...DEFAULT_SETTINGS,
      waterReminders: true,
      waterStart: '07:30',
      waterEnd: '16:45',
      waterIntervalMinutes: 45,
      waterAmountMl: 750,
      waterGoalMl: 3000,
      waterAutoLogWhenMinimized: false,
    };
    await db.saveSettings(chosen);

    const loaded = await db.getSettings();
    expect(loaded.waterReminders).toBe(true);
    expect(loaded.waterStart).toBe('07:30');
    expect(loaded.waterEnd).toBe('16:45');
    expect(loaded.waterIntervalMinutes).toBe(45);
    expect(loaded.waterAmountMl).toBe(750);
    expect(loaded.waterGoalMl).toBe(3000);
    expect(loaded.waterAutoLogWhenMinimized).toBe(false);

    // A window that cannot be read, and a cadence that is not on the menu,
    // fall back to the defaults rather than to a reminder at 03:00.
    await db.saveSettings({
      ...chosen,
      waterStart: 'soon',
      waterIntervalMinutes: 7,
      waterAutoLogWhenMinimized: 'yes' as unknown as boolean,
    });
    const repaired = await db.getSettings();
    expect(repaired.waterStart).toBe(DEFAULT_SETTINGS.waterStart);
    expect(repaired.waterIntervalMinutes).toBe(DEFAULT_SETTINGS.waterIntervalMinutes);
    // A hand-edited store cannot decide for the user either.
    expect(repaired.waterAutoLogWhenMinimized).toBe(DEFAULT_SETTINGS.waterAutoLogWhenMinimized);
  });

  it('starts with the water reminder off', async () => {
    await db.init();
    const s = await db.getSettings();

    expect(s.waterReminders).toBe(false);
    expect(s.waterAmountMl).toBe(500);
    expect(s.waterGoalMl).toBe(2000);
    // A minimised window is left alone until the user asks otherwise.
    expect(s.waterAutoLogWhenMinimized).toBe(true);
  });

  it('round-trips the carry-forward choice, and defaults it to on', async () => {
    await db.init();
    // Nothing stored yet: the app carries unfinished work forward, as it always
    // did — the switch is how a user asks for the other behaviour.
    expect((await db.getSettings()).carryForwardTasks).toBe(true);

    await db.saveSettings({ ...DEFAULT_SETTINGS, carryForwardTasks: false });
    expect((await db.getSettings()).carryForwardTasks).toBe(false);

    // A store holding something that is not a boolean falls back to the
    // default rather than letting a stray string decide what happens to work.
    localStorage.setItem(
      'deepwork_settings',
      JSON.stringify({ ...DEFAULT_SETTINGS, carryForwardTasks: 'nope' }),
    );
    expect((await db.getSettings()).carryForwardTasks).toBe(DEFAULT_SETTINGS.carryForwardTasks);
  });

  // ── Water ─────────────────────────────────────────────────────────────

  it('adds drinks and reads the day back', async () => {
    await db.init();
    const today = new Date();
    await db.addWaterEntry({ id: 'w1', amountMl: 500, loggedAt: today.toISOString() });
    await db.addWaterEntry({ id: 'w2', amountMl: 250, loggedAt: today.toISOString() });

    const rows = await db.getWaterIntakeSince(new Date(today.setHours(0, 0, 0, 0)).toISOString());

    expect(rows.map((row) => row.amountMl)).toEqual([500, 250]);
  });

  it('leaves yesterday out of the current day', async () => {
    await db.init();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await db.addWaterEntry({ id: 'old', amountMl: 500, loggedAt: yesterday.toISOString() });
    await db.addWaterEntry({ id: 'new', amountMl: 250, loggedAt: new Date().toISOString() });

    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const rows = await db.getWaterIntakeSince(midnight.toISOString());

    expect(rows.map((row) => row.id)).toEqual(['new']);
  });

  it('removes a drink that was logged by mistake', async () => {
    await db.init();
    await db.addWaterEntry({ id: 'w1', amountMl: 500, loggedAt: new Date().toISOString() });

    await db.deleteWaterEntry('w1');

    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(await db.getWaterIntakeSince(midnight.toISOString())).toHaveLength(0);
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
    const habit = {
      id: crypto.randomUUID(),
      name: 'Meditate',
      icon: '🧘',
      targetFrequency: 'daily',
      createdAt: new Date().toISOString(),
    };
    await db.createHabit(habit);
    const habits = await db.getHabits();
    expect(habits.find((h: any) => h.id === habit.id)).toBeDefined();
    expect(habits.find((h: any) => h.id === habit.id)?.name).toBe('Meditate');
  });

  it('deleteHabit() removes habit', async () => {
    await db.init();
    const habit = {
      id: crypto.randomUUID(),
      name: 'Exercise',
      icon: '💪',
      targetFrequency: 'daily',
      createdAt: new Date().toISOString(),
    };
    await db.createHabit(habit);
    await db.deleteHabit(habit.id);
    const habits = await db.getHabits();
    expect(habits.find((h: any) => h.id === habit.id)).toBeUndefined();
  });
});
