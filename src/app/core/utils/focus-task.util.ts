/**
 * The task the day's focus is for.
 *
 * A chosen task has to outlive a page change — Today's board focuses a task and
 * hands over to the Dashboard — so it is remembered outside Angular, in
 * `localStorage`.
 *
 * What it must not do is outlive the *day*, and it did: the id was stored and
 * read back with no date attached to it, so the next morning — or the next month
 * — a session started without picking a task was linked to whatever was chosen
 * last, and the dashboard named that task for work it had nothing to do with.
 * The id is therefore stamped with the day it was chosen on, and a stamp that is
 * not today's reads as "no task", which is what an untouched app should say.
 */

const TASK_KEY = 'deepwork_focusTaskId';
const DAY_KEY = 'deepwork_focusTaskDay';

/** Today, spelled the way the rest of the app's daily state spells it. */
function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The task this day's focus is for, or null once the day has turned over. */
export function readFocusedTaskId(now: Date = new Date()): string | null {
  const taskId = localStorage.getItem(TASK_KEY);
  if (!taskId) return null;
  return localStorage.getItem(DAY_KEY) === dayKey(now) ? taskId : null;
}

/** Remember the task the focus is for, for the rest of today. */
export function saveFocusedTaskId(taskId: string, now: Date = new Date()): void {
  if (!taskId) {
    clearFocusedTaskId();
    return;
  }
  localStorage.setItem(TASK_KEY, taskId);
  localStorage.setItem(DAY_KEY, dayKey(now));
}

/** Forget it: no task is focused. */
export function clearFocusedTaskId(): void {
  localStorage.removeItem(TASK_KEY);
  localStorage.removeItem(DAY_KEY);
}
