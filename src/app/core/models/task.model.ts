export type TaskStatus = 'todo' | 'in-progress' | 'done';
export type TaskQuadrant = 'urgent-important' | 'important' | 'urgent' | 'neither';

/**
 * A task title is a headline, not a description. Keeping it short is what makes
 * every listing (matrix cards, today list, calendar blocks, tooltips) readable,
 * so the limit is enforced at the source rather than only truncated in the UI.
 * Change it here and every form, validator and the importer follow.
 */
export const TASK_TITLE_MAX_LENGTH = 120;

/** The description field keeps its own, much larger limit. */
export const TASK_DESCRIPTION_MAX_LENGTH = 2000;

/**
 * Trim a title and clamp it to {@link TASK_TITLE_MAX_LENGTH}.
 *
 * Used as a last line of defence before a task is written, so no code path
 * (form, quick add, calendar, recurring instances, importer) can store a title
 * that would break a layout.
 */
export function normalizeTaskTitle(title: string): string {
  const trimmed = (title ?? '').trim();
  return trimmed.length > TASK_TITLE_MAX_LENGTH
    ? trimmed.slice(0, TASK_TITLE_MAX_LENGTH).trimEnd()
    : trimmed;
}

export interface RecurrenceConfig {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;
  days?: number[]; // 0=Sun, 1=Mon, ...
  endDate?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: 1 | 2 | 3 | 4;
  status: TaskStatus;
  quadrant: TaskQuadrant | null;
  deadline: string | null;
  tags: string[];
  recurrence: RecurrenceConfig | null;
  todayOrder: number | null;
  createdAt: string;
  completedAt: string | null;
  /**
   * Last time anything about the task changed (status, quadrant, order, text).
   * The Tasks list sorts and groups by it. Optional because older records and
   * existing fixtures predate the column — readers fall back to
   * `completedAt`/`createdAt`.
   */
  updatedAt?: string;
}

/** Newest activity first: the day the task was last touched. */
export function taskActivityIso(task: Task): string {
  return task.updatedAt ?? task.completedAt ?? task.createdAt;
}
