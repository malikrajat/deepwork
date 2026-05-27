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
