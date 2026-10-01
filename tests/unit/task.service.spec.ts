import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { TaskService } from '../../src/app/core/services/task.service';
import { DbService } from '../../src/app/core/services/db.service';
import { Task } from '../../src/app/core/models/task.model';

const today = new Date().toISOString().slice(0, 10);

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

const makeMockDb = () => ({
  init: vi.fn().mockResolvedValue(undefined),
  getTasks: vi.fn().mockResolvedValue([]),
  createTask: vi.fn().mockResolvedValue(undefined),
  updateTask: vi.fn().mockResolvedValue(undefined),
  deleteTask: vi.fn().mockResolvedValue(undefined),
  searchTasks: vi.fn().mockResolvedValue([]),
});

describe('TaskService', () => {
  let svc: TaskService;
  let mockDb: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    mockDb = makeMockDb();
    TestBed.configureTestingModule({
      providers: [TaskService, { provide: DbService, useValue: mockDb }],
    });
    svc = TestBed.inject(TaskService);
  });

  afterEach(() => TestBed.resetTestingModule());

  // ── initial state ─────────────────────────────────────────────────────

  it('starts with empty tasks array', () => {
    expect(svc.tasks()).toHaveLength(0);
  });

  // ── loadTasks ─────────────────────────────────────────────────────────

  it('loadTasks() fetches from db and populates signal', async () => {
    const t = makeTask({ title: 'From DB' });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    expect(svc.tasks()).toHaveLength(1);
    expect(svc.tasks()[0].title).toBe('From DB');
  });

  it('loadTasks() replaces existing tasks on subsequent calls', async () => {
    mockDb.getTasks.mockResolvedValueOnce([makeTask()]);
    await svc.loadTasks();
    mockDb.getTasks.mockResolvedValueOnce([]);
    await svc.loadTasks();
    expect(svc.tasks()).toHaveLength(0);
  });

  // ── createTask ────────────────────────────────────────────────────────

  it('createTask() calls db.createTask and adds task to signal', async () => {
    const created = await svc.createTask({ title: 'New task' });
    expect(mockDb.createTask).toHaveBeenCalledTimes(1);
    expect(svc.tasks().find(t => t.id === created.id)).toBeDefined();
  });

  it('createTask() assigns default status todo and priority 3', async () => {
    const created = await svc.createTask({ title: 'Task' });
    expect(created.status).toBe('todo');
    expect(created.priority).toBe(3);
    expect(created.completedAt).toBeNull();
  });

  it('createTask() uses provided priority', async () => {
    const created = await svc.createTask({ title: 'Urgent', priority: 1 });
    expect(created.priority).toBe(1);
  });

  // ── deleteTask ────────────────────────────────────────────────────────

  it('deleteTask() removes task from signal', async () => {
    const t = makeTask();
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    await svc.deleteTask(t.id);
    expect(mockDb.deleteTask).toHaveBeenCalledWith(t.id);
    expect(svc.tasks().find(x => x.id === t.id)).toBeUndefined();
  });

  // ── updateTask ────────────────────────────────────────────────────────

  it('updateTask() persists and reflects change in signal', async () => {
    const t = makeTask();
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    await svc.updateTask({ ...t, title: 'Updated title' });
    expect(mockDb.updateTask).toHaveBeenCalled();
    expect(svc.tasks().find(x => x.id === t.id)?.title).toBe('Updated title');
  });

  // ── toggleStatus ──────────────────────────────────────────────────────

  it('toggleStatus() cycles todo → in-progress', async () => {
    const t = makeTask({ status: 'todo' });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    await svc.toggleStatus(t);
    expect(svc.tasks().find(x => x.id === t.id)?.status).toBe('in-progress');
  });

  it('toggleStatus() cycles in-progress → done and sets completedAt', async () => {
    const t = makeTask({ status: 'in-progress' });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    await svc.toggleStatus(t);
    const updated = svc.tasks().find(x => x.id === t.id)!;
    expect(updated.status).toBe('done');
    expect(updated.completedAt).not.toBeNull();
  });

  it('toggleStatus() cycles done → todo and clears completedAt', async () => {
    const t = makeTask({ status: 'done', completedAt: new Date().toISOString() });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    await svc.toggleStatus(t);
    const updated = svc.tasks().find(x => x.id === t.id)!;
    expect(updated.status).toBe('todo');
    expect(updated.completedAt).toBeNull();
  });

  // ── setStatus (what the board's drag & drop writes) ───────────────────

  it('setStatus() moves a task straight to the dropped status', async () => {
    const t = makeTask({ status: 'todo' });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    await svc.setStatus(t, 'done');
    const updated = svc.tasks().find(x => x.id === t.id)!;
    expect(updated.status).toBe('done');
    expect(updated.completedAt).not.toBeNull();
    expect(mockDb.updateTask).toHaveBeenCalledTimes(1);
  });

  it('setStatus() clears completedAt when a done task leaves the Done column', async () => {
    const t = makeTask({ status: 'done', completedAt: new Date().toISOString() });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    await svc.setStatus(t, 'in-progress');
    const updated = svc.tasks().find(x => x.id === t.id)!;
    expect(updated.status).toBe('in-progress');
    expect(updated.completedAt).toBeNull();
  });

  it('setStatus() ignores a drop in the column the task is already in', async () => {
    const t = makeTask({ status: 'in-progress' });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    await svc.setStatus(t, 'in-progress');
    expect(mockDb.updateTask).not.toHaveBeenCalled();
  });

  // ── todayTasks computed ───────────────────────────────────────────────

  it('todayTasks() includes tasks with today deadline', async () => {
    const t = makeTask({ deadline: today, status: 'todo' });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    expect(svc.todayTasks().find(x => x.id === t.id)).toBeDefined();
  });

  it('todayTasks() excludes done tasks', async () => {
    const t = makeTask({ deadline: today, status: 'done' });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    expect(svc.todayTasks().find(x => x.id === t.id)).toBeUndefined();
  });

  it('todayTasks() excludes tasks with future deadline', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    // createdAt is yesterday so it won't match today; deadline is in the future
    const t = makeTask({
      deadline: future.toISOString().slice(0, 10),
      status: 'todo',
      createdAt: yesterday.toISOString(),
    });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    expect(svc.todayTasks().find(x => x.id === t.id)).toBeUndefined();
  });

  it('todayTasks() leaves a task dated for another day out, even when it was written today', async () => {
    // The import case: a sheet dated for tomorrow is tomorrow's work. Landing in
    // the app today is not the same as being today's task.
    const future = new Date();
    future.setDate(future.getDate() + 1);
    const t = makeTask({ deadline: future.toISOString().slice(0, 10), status: 'todo' });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    expect(svc.todayBoardTasks().find(x => x.id === t.id)).toBeUndefined();
  });

  it('todayTasks() keeps an overdue task on today, where the slip is visible', async () => {
    const t = makeTask({ deadline: '2001-02-03', status: 'todo' });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    expect(svc.todayTasks().find(x => x.id === t.id)).toBeDefined();
  });

  it('todayTasks() honours "Add to Today" over the date, because the user said so', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const t = makeTask({
      deadline: future.toISOString().slice(0, 10),
      todayOrder: 1,
      status: 'todo',
    });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    expect(svc.todayTasks().find(x => x.id === t.id)).toBeDefined();
  });

  // ── todayBoardTasks (the Today board keeps its Done column) ────────────

  it('todayBoardTasks() keeps done tasks so nothing vanishes out of a column', async () => {
    const t = makeTask({ deadline: today, status: 'done', completedAt: new Date().toISOString() });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    expect(svc.todayBoardTasks().find(x => x.id === t.id)).toBeDefined();
    expect(svc.todayTasks().find(x => x.id === t.id)).toBeUndefined();
  });

  it('todayBoardTasks() follows the day sequence: quadrant, then todayOrder', async () => {
    const later = makeTask({ deadline: today, todayOrder: 2, title: 'Second' });
    const first = makeTask({ deadline: today, todayOrder: 1, title: 'First' });
    mockDb.getTasks.mockResolvedValueOnce([later, first]);
    await svc.loadTasks();
    expect(svc.todayBoardTasks().map(t => t.title)).toEqual(['First', 'Second']);
  });

  it('todayBoardTasks() leaves out tasks that are not on today', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const t = makeTask({
      deadline: future.toISOString().slice(0, 10),
      createdAt: yesterday.toISOString(),
    });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    expect(svc.todayBoardTasks()).toHaveLength(0);
  });

  it('shows a task once, not twice, when yesterday’s copy is still on the list', async () => {
    // The report this comes from: the same task added yesterday and added again
    // today, and two identical cards on the Today board. Yesterday's copy is
    // still in the day's list because a star is the user's own instruction ("Add
    // to Today") and the importer's too — so both rows qualified, and nothing on
    // the cards said which was which.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const carriedOver = makeTask({
      title: 'Pay the electricity bill',
      deadline: yesterday.toISOString().slice(0, 10),
      createdAt: yesterday.toISOString(),
      todayOrder: 1,
    });
    const addedToday = makeTask({
      title: 'Pay the electricity bill',
      deadline: today,
      todayOrder: 2,
    });

    mockDb.getTasks.mockResolvedValueOnce([carriedOver, addedToday]);
    await svc.loadTasks();

    // One card on the board, and the dashboard and the timer count the same one.
    expect(svc.todayBoardTasks()).toHaveLength(1);
    expect(svc.todayTasks()).toHaveLength(1);
    // Today's own copy is the survivor: it is the one just written down, and the
    // one whose status is current.
    expect(svc.todayBoardTasks()[0].id).toBe(addedToday.id);
    // Nothing was deleted — the older row is still a task, and the Tasks page
    // files it under its own day.
    expect(svc.tasks()).toHaveLength(2);
  });

  it('treats a title that differs only in spacing or case as the same task', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const carriedOver = makeTask({
      title: '  pay the electricity bill  ',
      deadline: yesterday.toISOString().slice(0, 10),
      createdAt: yesterday.toISOString(),
      todayOrder: 1,
    });
    const addedToday = makeTask({ title: 'Pay The Electricity Bill', deadline: today });

    mockDb.getTasks.mockResolvedValueOnce([carriedOver, addedToday]);
    await svc.loadTasks();

    expect(svc.todayBoardTasks()).toHaveLength(1);
    expect(svc.todayBoardTasks()[0].id).toBe(addedToday.id);
  });

  it('still shows two tasks that only share a day, not a title', async () => {
    const first = makeTask({ title: 'Pay the electricity bill', deadline: today });
    const second = makeTask({ title: 'Call the plumber', deadline: today });

    mockDb.getTasks.mockResolvedValueOnce([first, second]);
    await svc.loadTasks();

    expect(svc.todayBoardTasks().map(t => t.title)).toEqual([
      'Pay the electricity bill',
      'Call the plumber',
    ]);
  });

  // ── addToToday / removeFromToday ──────────────────────────────────────

  it('addToToday() sets todayOrder to a positive number', async () => {
    const t = makeTask();
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    await svc.addToToday(t.id);
    expect(svc.tasks().find(x => x.id === t.id)?.todayOrder).toBeGreaterThanOrEqual(1);
  });

  it('addToToday() is idempotent when already in today', async () => {
    const t = makeTask({ todayOrder: 1 });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    await svc.addToToday(t.id);
    expect(mockDb.updateTask).not.toHaveBeenCalled();
  });

  it('removeFromToday() clears todayOrder to null', async () => {
    const t = makeTask({ todayOrder: 2 });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    await svc.removeFromToday(t.id);
    expect(svc.tasks().find(x => x.id === t.id)?.todayOrder).toBeNull();
  });

  // ── setQuadrant ───────────────────────────────────────────────────────

  it('setQuadrant() updates quadrant on the task', async () => {
    const t = makeTask();
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    await svc.setQuadrant(t.id, 'urgent-important');
    expect(svc.tasks().find(x => x.id === t.id)?.quadrant).toBe('urgent-important');
  });

  it('setQuadrant() can clear quadrant to null', async () => {
    const t = makeTask({ quadrant: 'important' });
    mockDb.getTasks.mockResolvedValueOnce([t]);
    await svc.loadTasks();
    await svc.setQuadrant(t.id, null);
    expect(svc.tasks().find(x => x.id === t.id)?.quadrant).toBeNull();
  });

  // ── searchTasks ───────────────────────────────────────────────────────

  it('searchTasks() returns all tasks for empty query', async () => {
    const tasks = [makeTask(), makeTask()];
    mockDb.getTasks.mockResolvedValueOnce(tasks);
    await svc.loadTasks();
    const result = await svc.searchTasks('');
    expect(result).toHaveLength(2);
  });

  it('searchTasks() delegates non-empty query to db', async () => {
    const t = makeTask({ title: 'specific task' });
    mockDb.searchTasks.mockResolvedValueOnce([t]);
    const result = await svc.searchTasks('specific');
    expect(mockDb.searchTasks).toHaveBeenCalledWith('specific');
    expect(result).toHaveLength(1);
  });
});
