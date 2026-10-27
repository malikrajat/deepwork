import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearFocusedTaskId,
  readFocusedTaskId,
  saveFocusedTaskId,
} from '../../src/app/core/utils/focus-task.util';
import { localDayKey } from '../../src/app/core/utils/nudge-schedule.util';

/**
 * The task the day's focus is for.
 *
 * It has to survive a page change — Today focuses a task and hands over to the
 * Dashboard — and it must not survive the day. Storing the id with no date on it
 * is what made a session started the next morning, with no task picked, show and
 * file itself against whatever was chosen last.
 */

const TODAY = new Date(2026, 0, 15, 10, 0, 0);
const YESTERDAY = new Date(2026, 0, 14, 10, 0, 0);
const LAST_MONTH = new Date(2025, 11, 15, 10, 0, 0);

describe('focused task', () => {
  beforeEach(() => localStorage.clear());

  it('reads back a task chosen today', () => {
    saveFocusedTaskId('task-1', TODAY);
    expect(readFocusedTaskId(TODAY)).toBe('task-1');
  });

  it('has nothing focused before anything is chosen', () => {
    expect(readFocusedTaskId(TODAY)).toBeNull();
  });

  it('ignores a task chosen yesterday', () => {
    saveFocusedTaskId('task-1', YESTERDAY);
    expect(readFocusedTaskId(TODAY)).toBeNull();
  });

  it('ignores a task chosen a month ago', () => {
    saveFocusedTaskId('task-1', LAST_MONTH);
    expect(readFocusedTaskId(TODAY)).toBeNull();
  });

  it('still reads the task later the same day', () => {
    saveFocusedTaskId('task-1', new Date(2026, 0, 15, 9, 0, 0));
    expect(readFocusedTaskId(new Date(2026, 0, 15, 23, 0, 0))).toBe('task-1');
  });

  it('forgets the task when it is cleared', () => {
    saveFocusedTaskId('task-1', TODAY);
    clearFocusedTaskId();
    expect(readFocusedTaskId(TODAY)).toBeNull();
  });

  it('treats an empty id as no task at all', () => {
    saveFocusedTaskId('task-1', TODAY);
    saveFocusedTaskId('', TODAY);

    expect(readFocusedTaskId(TODAY)).toBeNull();
    expect(localStorage.getItem('deepwork_focusTaskId')).toBeNull();
    expect(localStorage.getItem('deepwork_focusTaskDay')).toBeNull();
  });

  it('ignores an id left over from a version that stored no day', () => {
    // An upgrade from 2.0.21 leaves exactly this: the id, and no stamp beside it.
    localStorage.setItem('deepwork_focusTaskId', 'task-from-before');

    expect(readFocusedTaskId(TODAY)).toBeNull();
  });

  it('stamps the id with the day it was chosen on', () => {
    saveFocusedTaskId('task-1', TODAY);
    expect(localStorage.getItem('deepwork_focusTaskDay')).toBe(localDayKey(TODAY));
  });

  it('defaults to the real today, which is how the app calls it', () => {
    // No date passed on either side: this is the path the Dashboard and Today
    // take, and the one that has to agree with the clock.
    saveFocusedTaskId('task-1');
    expect(readFocusedTaskId()).toBe('task-1');
  });
});
