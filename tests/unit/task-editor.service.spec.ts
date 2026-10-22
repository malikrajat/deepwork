import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { TaskEditorService } from '../../src/app/core/services/task-editor.service';
import { Task } from '../../src/app/core/models/task.model';

/**
 * The state behind the app's one task form.
 *
 * It is what every card in the app talks to instead of the router: asking for
 * the editor must never navigate, must always produce a *new* request (opening
 * the same task twice has to refill the form twice), and must close back to
 * exactly the page that was already on screen.
 */

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  description: '',
  priority: 3,
  status: 'todo',
  quadrant: null,
  deadline: null,
  tags: [],
  recurrence: null,
  todayOrder: null,
  todayOrderDate: null,
  createdAt: '2026-09-18T08:00:00.000Z',
  completedAt: null,
  updatedAt: '2026-09-18T08:00:00.000Z',
  ...overrides,
});

describe('TaskEditorService', () => {
  let editor: TaskEditorService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TaskEditorService] });
    editor = TestBed.inject(TaskEditorService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('starts closed', () => {
    expect(editor.isOpen()).toBe(false);
    expect(editor.request()).toBeNull();
    expect(editor.editingTask()).toBeNull();
  });

  it('opens the add form on the form’s own defaults', () => {
    editor.openAdd();

    expect(editor.isOpen()).toBe(true);
    expect(editor.editingTask()).toBeNull();
    expect(editor.request()).toMatchObject({
      task: null,
      deadline: '',
      quadrant: null,
      addToToday: false,
    });
  });

  it('carries only what the calling button promised', () => {
    editor.openAdd({ deadline: '2026-10-02', quadrant: 'urgent', addToToday: true });

    expect(editor.request()).toMatchObject({
      deadline: '2026-10-02',
      quadrant: 'urgent',
      addToToday: true,
    });
  });

  it('opens the edit form on the task it was given', () => {
    const target = task('task-1');

    editor.openEdit(target);

    expect(editor.isOpen()).toBe(true);
    expect(editor.editingTask()).toBe(target);
    expect(editor.request()?.task).toBe(target);
  });

  it('gives every request its own id, even for the same task', () => {
    const target = task('task-1');

    editor.openEdit(target);
    const first = editor.request()?.id;
    editor.close();
    editor.openEdit(target);

    expect(first).toBeTypeOf('number');
    expect(editor.request()?.id).not.toBe(first);
  });

  it('closes without disturbing anything else', () => {
    editor.openEdit(task('task-1'));
    editor.close();

    expect(editor.isOpen()).toBe(false);
    expect(editor.request()).toBeNull();
    expect(editor.editingTask()).toBeNull();
  });

  it('reports the task it wrote, and whether it was created', () => {
    const saved = task('task-2');

    editor.reportSave(saved, true, 7);

    expect(editor.lastSave()).toEqual({ task: saved, created: true, requestId: 7 });
  });
});
