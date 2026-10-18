import { Task } from '../models/task.model';

/**
 * The user's own calendar day, as `YYYY-MM-DD`.
 *
 * "Today" is a local day. Reading it from `toISOString()` makes it a UTC day,
 * which turns over at 05:30 in India — so before breakfast the app called
 * yesterday "today". Every rule about which day a task belongs to uses this
 * instead, and the Tasks page's date sections already group this way.
 */
export function localDayKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The local day a task was written, or '' when its stamp cannot be read. */
export function writtenDayKey(task: Task): string {
  const created = new Date(task.createdAt);
  return Number.isNaN(created.getTime()) ? '' : localDayKey(created);
}

/**
 * The day a task is *for*: its deadline when it has one, the day it was written
 * when it has not.
 *
 * A deadline that does not read as a real day falls back to the written day
 * rather than becoming a day of its own, which is what the Tasks page files it
 * under.
 */
export function taskDayKey(task: Task): string {
  const deadline = task.deadline?.slice(0, 10) ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : writtenDayKey(task);
}

/**
 * Whether a task carries *today's* "Add to Today" star.
 *
 * The star is a one-day instruction, so both halves are needed: the position
 * (`todayOrder`) and the day it was set for (`todayOrderDate`). A position with
 * no date, or one from an earlier day, is a star that has expired — the task is
 * still a task, it is simply not today's.
 */
export function isPinnedToToday(task: Task, today: string = localDayKey()): boolean {
  return task.todayOrder !== null && task.todayOrderDate === today;
}
