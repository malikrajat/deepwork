import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseTaskDeepLink } from '../../src/app/core/utils/task-link.util';

/**
 * A `/tasks` link is an address, not the way the app edits a task.
 *
 * Every page opens the shell's task panel over itself (`TaskEditorService`), so
 * nothing writes one of these links any more. What is left is the reader: a URL
 * that was bookmarked, shared or handed over from an older version still names
 * a task or asks for the add form, and the Tasks page has to understand it
 * without moving the user anywhere.
 *
 * The reading is pure, so it is tested here rather than through the browser —
 * the rendered journey is covered by the Playwright specs.
 */

/** A parameter getter, the way the Tasks page hands its route over. */
const params =
  (query: Record<string, string>) =>
  (name: string): string | null =>
    query[name] ?? null;

/** Friday 18 September 2026, so "today" is fixed for the date checks. */
const TODAY = new Date(2026, 8, 18, 12);

describe('parseTaskDeepLink', () => {
  it('reads a link that names a task', () => {
    const link = parseTaskDeepLink(params({ edit: 'task-9' }), TODAY);

    expect(link.editId).toBe('task-9');
    expect(link.add).toBe(false);
    expect(link.present).toBe(true);
  });

  it('treats a blank id as no task at all', () => {
    expect(parseTaskDeepLink(params({ edit: '   ' }), TODAY).editId).toBeNull();
  });

  it('reads the pre-fills a link can carry with the add form', () => {
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
});

/** The form is one panel in the shell, opened in place from every page. */
describe('one task editor, opened from everywhere', () => {
  const sourceOf = (relative: string): string => readFileSync(resolve(__dirname, relative), 'utf8');

  const pages = {
    Today: '../../src/app/pages/today/today.component.ts',
    'Eisenhower Matrix': '../../src/app/pages/matrix/matrix.component.ts',
    Calendar: '../../src/app/pages/calendar/calendar.component.ts',
    Dashboard: '../../src/app/pages/dashboard/dashboard.component.ts',
    Tasks: '../../src/app/pages/tasks/tasks.component.ts',
  };

  for (const [page, file] of Object.entries(pages)) {
    it(`${page} opens the panel in place instead of linking to another page`, () => {
      const source = sourceOf(file);

      expect(source).toContain('TaskEditorService');
      // The old route hand-over: this is what moved the user to `/tasks`.
      expect(source).not.toContain('TASK_EDIT_PATH');
      expect(source).not.toContain('taskEditQuery');
      expect(source).not.toContain('taskAddQuery');
    });
  }

  it('the panel is mounted once, in the app shell', () => {
    const shell = sourceOf('../../src/app/app.html');

    expect(shell).toContain('<app-task-editor-panel />');
  });

  it('no page owns the panel markup any more', () => {
    for (const file of Object.values(pages)) {
      expect(sourceOf(file)).not.toContain('class="slide-panel"');
    }
  });

  it('the Tasks page still answers a link that names a task', () => {
    expect(sourceOf('../../src/app/pages/tasks/tasks.component.ts')).toContain('parseTaskDeepLink');
  });

  it('the boards carry an edit control of their own', () => {
    const board = sourceOf('../../src/app/shared/components/task-board/task-board.component.ts');
    expect(board).toContain('editRequested');
    expect(board).toContain("'edit'");
  });
});
