import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  adjacentStatus,
  boardColumns,
  sequenceAfterMove,
  statusShortcut,
} from '../../src/app/shared/components/task-board/task-board.view';
import { Task } from '../../src/app/core/models/task.model';
import { STATUS_CONFIG, STATUS_CYCLE } from '../../src/app/core/constants/theme.constants';

/**
 * The board logic is pure so it can be tested without Angular's JIT compiler,
 * which cannot resolve this project's signal inputs (see the note in
 * `info-tip.component.spec.ts`). The rendered board itself is covered by the
 * Playwright specs for the Tasks and Today pages.
 */

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

const sourceOf = (relative: string): string => readFileSync(resolve(__dirname, relative), 'utf8');

describe('boardColumns', () => {
  it('returns one column per status, in cycle order', () => {
    const columns = boardColumns([]);
    expect(columns.map(c => c.status)).toEqual(STATUS_CYCLE);
  });

  it('labels every column and gives it the shared status colour class', () => {
    for (const column of boardColumns([])) {
      expect(column.label).toBe(STATUS_CONFIG[column.status].label);
      expect(column.cardClass).toBe(STATUS_CONFIG[column.status].cardClass);
    }
  });

  it('puts each task in the column of its own status', () => {
    const todo = makeTask({ title: 'Todo one', status: 'todo' });
    const doing = makeTask({ title: 'Doing one', status: 'in-progress' });
    const done = makeTask({ title: 'Done one', status: 'done' });

    const columns = boardColumns([todo, doing, done]);
    expect(columns[0].tasks.map(t => t.title)).toEqual(['Todo one']);
    expect(columns[1].tasks.map(t => t.title)).toEqual(['Doing one']);
    expect(columns[2].tasks.map(t => t.title)).toEqual(['Done one']);
  });

  it('keeps the order the page handed over (the board never re-sorts)', () => {
    const tasks = [
      makeTask({ title: 'First', status: 'todo' }),
      makeTask({ title: 'Second', status: 'todo' }),
      makeTask({ title: 'Third', status: 'todo' }),
    ];
    expect(boardColumns(tasks)[0].tasks.map(t => t.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('leaves a column empty rather than dropping it', () => {
    const columns = boardColumns([makeTask({ status: 'done' })]);
    expect(columns[0].tasks).toEqual([]);
    expect(columns[1].tasks).toEqual([]);
    expect(columns[2].tasks.length).toBe(1);
  });
});

describe('statusShortcut', () => {
  it('maps 1/2/3 to the three statuses', () => {
    expect(statusShortcut('1')).toBe('todo');
    expect(statusShortcut('2')).toBe('in-progress');
    expect(statusShortcut('3')).toBe('done');
  });

  it('ignores other keys', () => {
    expect(statusShortcut('4')).toBeNull();
    expect(statusShortcut('Enter')).toBeNull();
  });
});

describe('adjacentStatus', () => {
  it('walks the columns in both directions', () => {
    expect(adjacentStatus('todo', 1)).toBe('in-progress');
    expect(adjacentStatus('in-progress', 1)).toBe('done');
    expect(adjacentStatus('done', -1)).toBe('in-progress');
  });

  it('stops at both ends of the board', () => {
    expect(adjacentStatus('todo', -1)).toBeNull();
    expect(adjacentStatus('done', 1)).toBeNull();
  });
});

describe('sequenceAfterMove', () => {
  it('writes the columns left to right with the card where it was dropped', () => {
    const first = makeTask({ title: 'First', status: 'todo' });
    const second = makeTask({ title: 'Second', status: 'todo' });
    const sequence = sequenceAfterMove([first, second], { task: first, status: 'todo', index: 1 });
    expect(sequence).toEqual([second.id, first.id]);
  });

  it('moves the card into the target column at the drop position', () => {
    const todo = makeTask({ title: 'Todo', status: 'todo' });
    const doing = makeTask({ title: 'Doing', status: 'in-progress' });
    const done = makeTask({ title: 'Done', status: 'done' });

    const sequence = sequenceAfterMove([todo, doing, done], {
      task: todo,
      status: 'done',
      index: 0,
    });

    expect(sequence).toEqual([doing.id, todo.id, done.id]);
  });

  it('clamps a drop below the last card instead of creating a hole', () => {
    const todo = makeTask({ status: 'todo' });
    const done = makeTask({ status: 'done' });
    const sequence = sequenceAfterMove([todo, done], { task: todo, status: 'done', index: 99 });
    expect(sequence).toEqual([done.id, todo.id]);
  });

  it('lists every task exactly once', () => {
    const tasks = [
      makeTask({ status: 'todo' }),
      makeTask({ status: 'in-progress' }),
      makeTask({ status: 'done' }),
    ];
    const sequence = sequenceAfterMove(tasks, { task: tasks[1], status: 'todo', index: 0 });
    expect(sequence.length).toBe(3);
    expect(new Set(sequence).size).toBe(3);
  });
});

/**
 * The promise to the user is that a card's colour depends only on its status and
 * looks the same on both boards. These checks keep a future edit from breaking
 * it: one board component, no leftover status checkboxes or filter pills, and a
 * colour rule for every status class.
 */
describe('Task board consistency across pages', () => {
  it('renders the same board component on Tasks and Today', () => {
    expect(sourceOf('../../src/app/pages/tasks/tasks.component.ts')).toContain('<app-task-board');
    expect(sourceOf('../../src/app/pages/today/today.component.ts')).toContain('<app-task-board');
  });

  it('dropped the status checkbox from both pages', () => {
    expect(sourceOf('../../src/app/pages/tasks/tasks.component.ts')).not.toContain('status-btn');
    expect(sourceOf('../../src/app/pages/today/today.component.ts')).not.toContain('status-btn');
  });

  it('dropped the status filter pills from the Tasks page', () => {
    const tasks = sourceOf('../../src/app/pages/tasks/tasks.component.ts');
    expect(tasks).not.toContain('filter-chips');
    expect(tasks).not.toContain('statusFilters');
  });

  it('defines one card colour rule per status in the shared stylesheet', () => {
    const css = sourceOf('../../src/styles.css');
    for (const status of STATUS_CYCLE) {
      expect(css).toContain(`.task-card.${STATUS_CONFIG[status].cardClass} {`);
    }
  });

  it('gives every status its own colour class', () => {
    const classes = STATUS_CYCLE.map(status => STATUS_CONFIG[status].cardClass);
    expect(new Set(classes).size).toBe(classes.length);
  });
});
