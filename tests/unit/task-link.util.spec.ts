import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  TASK_EDIT_PATH,
  parseTaskDeepLink,
  taskAddQuery,
  taskEditQuery,
} from '../../src/app/core/utils/task-link.util';

/**
 * The deep link is the whole of the "edit a task from anywhere" feature: the
 * pages that only read tasks send one, and the Tasks page answers it. Both
 * directions are pure, so they are tested here rather than through the browser —
 * the rendered journey is covered by the Playwright specs.
 */

/** A parameter getter, the way the Tasks page hands its route over. */
const params =
  (query: Record<string, string>) =>
  (name: string): string | null =>
    query[name] ?? null;

/** Friday 18 September 2026, so "today" is fixed for the date checks. */
const TODAY = new Date(2026, 8, 18, 12);

describe('task link builders', () => {
  it('names the Tasks page as the one place a task is edited', () => {
    expect(TASK_EDIT_PATH).toBe('/tasks');
    expect(taskEditQuery('task-1')).toEqual({ edit: 'task-1' });
  });

  it('asks only for what the button promised', () => {
    expect(taskAddQuery()).toEqual({ add: '1' });
    expect(
      taskAddQuery({ deadline: '2026-09-19', quadrant: 'urgent-important', today: true }),
    ).toEqual({
      add: '1',
      date: '2026-09-19',
      quadrant: 'urgent-important',
      today: '1',
    });
  });

  it('leaves an absent choice out rather than spelling it', () => {
    expect(taskAddQuery({ quadrant: null, deadline: '', today: false })).toEqual({ add: '1' });
  });
});

describe('parseTaskDeepLink', () => {
  it('reads an edit link', () => {
    const link = parseTaskDeepLink(params({ edit: 'task-9' }), TODAY);

    expect(link.editId).toBe('task-9');
    expect(link.add).toBe(false);
    expect(link.present).toBe(true);
  });

  it('treats a blank id as no task at all', () => {
    expect(parseTaskDeepLink(params({ edit: '   ' }), TODAY).editId).toBeNull();
  });

  it('reads the pre-fills a page sends with the add form', () => {
    const link = parseTaskDeepLink(
      params({ add: '1', date: '2026-09-19', quadrant: 'urgent', today: '1' }),
      TODAY,
    );

    expect(link.add).toBe(true);
    expect(link.deadline).toBe('2026-09-19');
    expect(link.quadrant).toBe('urgent');
    expect(link.addToToday).toBe(true);
  });

  it('drops a deadline in the past, which the form would refuse anyway', () => {
    expect(parseTaskDeepLink(params({ add: '1', date: '2026-09-17' }), TODAY).deadline).toBe('');
  });

  it('keeps today itself as a deadline', () => {
    expect(parseTaskDeepLink(params({ add: '1', date: '2026-09-18' }), TODAY).deadline).toBe(
      '2026-09-18',
    );
  });

  it('drops a day that does not exist', () => {
    expect(parseTaskDeepLink(params({ add: '1', date: '2026-02-30' }), TODAY).deadline).toBe('');
    expect(parseTaskDeepLink(params({ add: '1', date: 'soon' }), TODAY).deadline).toBe('');
  });

  it('drops a quadrant the app does not know', () => {
    expect(
      parseTaskDeepLink(params({ add: '1', quadrant: 'urgent-ish' }), TODAY).quadrant,
    ).toBeNull();
  });

  it('reports an ordinary visit as asking for nothing', () => {
    const link = parseTaskDeepLink(params({}), TODAY);

    expect(link).toMatchObject({ editId: null, add: false, deadline: '', quadrant: null });
    expect(link.present).toBe(false);
  });

  it('still reports a link whose values were unusable, so the URL is cleaned', () => {
    expect(parseTaskDeepLink(params({ date: 'yesterday' }), TODAY).present).toBe(true);
  });

  it('reads back exactly what the builders write', () => {
    const query = taskAddQuery({ deadline: '2026-10-02', quadrant: 'neither', today: true });
    const link = parseTaskDeepLink(params(query), TODAY);

    expect(link.add).toBe(true);
    expect(link.deadline).toBe('2026-10-02');
    expect(link.quadrant).toBe('neither');
    expect(link.addToToday).toBe(true);

    const edit = parseTaskDeepLink(params(taskEditQuery('task-42')), TODAY);
    expect(edit.editId).toBe('task-42');
  });
});

/** The pages that give no home to a form must hand over to the one that does. */
describe('one task editor, reached from everywhere', () => {
  const sourceOf = (relative: string): string => readFileSync(resolve(__dirname, relative), 'utf8');

  const readers = {
    Today: '../../src/app/pages/today/today.component.ts',
    'Eisenhower Matrix': '../../src/app/pages/matrix/matrix.component.ts',
    Calendar: '../../src/app/pages/calendar/calendar.component.ts',
    Dashboard: '../../src/app/pages/dashboard/dashboard.component.ts',
  };

  for (const [page, file] of Object.entries(readers)) {
    it(`${page} links to the task editor`, () => {
      expect(sourceOf(file)).toContain('taskEditQuery');
    });
  }

  it('the Tasks page answers that link', () => {
    expect(sourceOf('../../src/app/pages/tasks/tasks.component.ts')).toContain('parseTaskDeepLink');
  });

  it('the boards carry an edit control of their own', () => {
    const board = sourceOf('../../src/app/shared/components/task-board/task-board.component.ts');
    expect(board).toContain('editRequested');
    expect(board).toContain("'edit'");
  });
});
