import { Task, taskActivityIso } from '../../core/models/task.model';

export interface DateGroup {
  key: string;
  label: string;
  tasks: Task[];
  doneCount: number;
}

/** One renderable line of the virtual list: a date header or a task row. */
export interface ListRow {
  kind: 'header' | 'task';
  key: string;
  group: DateGroup;
  task: Task | null;
  top: number;
  height: number;
}

/**
 * Fixed row metrics. Windowing has to know every height up front, so the task
 * row is a constant height (the title clamps to two lines inside it) and the
 * date header is a single compact line.
 */
export const HEADER_HEIGHT = 40;
export const ROW_HEIGHT = 76;
/** Rows rendered beyond the viewport, so fast scrolling never shows a gap. */
export const OVERSCAN_PX = ROW_HEIGHT * 3;

/** Local calendar day of an ISO timestamp — "when did I touch this". */
export function localDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dayLabel(key: string): string {
  if (key === 'unknown') return 'No date';
  const today = localDayKey(new Date().toISOString());
  if (key === today) return 'Today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === localDayKey(yesterday.toISOString())) return 'Yesterday';
  const date = new Date(`${key}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

/**
 * Bucket tasks by the day they were last touched, newest day first.
 * Used for both the plain list and search results, so a search always comes
 * back grouped by date.
 */
export function groupByDay(tasks: Task[]): DateGroup[] {
  const buckets = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = localDayKey(taskActivityIso(task));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(task);
    else buckets.set(key, [task]);
  }

  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, bucketTasks]) => ({
      key,
      label: dayLabel(key),
      tasks: bucketTasks,
      doneCount: bucketTasks.filter(task => task.status === 'done').length,
    }));
}

/**
 * Flatten groups into positioned rows. Collapsed groups contribute only their
 * header, which is what keeps a long history cheap.
 */
export function buildRows(groups: DateGroup[], openKeys: Iterable<string>): ListRow[] {
  const open = new Set(openKeys);
  const rows: ListRow[] = [];
  let top = 0;

  for (const group of groups) {
    rows.push({ kind: 'header', key: `h:${group.key}`, group, task: null, top, height: HEADER_HEIGHT });
    top += HEADER_HEIGHT;

    if (!open.has(group.key)) continue;

    for (const task of group.tasks) {
      rows.push({ kind: 'task', key: task.id, group, task, top, height: ROW_HEIGHT });
      top += ROW_HEIGHT;
    }
  }

  return rows;
}

export function totalHeight(rows: ListRow[]): number {
  const last = rows[rows.length - 1];
  return last ? last.top + last.height : 0;
}

/**
 * The slice of rows that can be seen right now (plus overscan).
 *
 * Everything outside this window is never handed to the template, so a list of
 * thousands of tasks keeps a handful of nodes in the DOM.
 */
export function windowRows(
  rows: ListRow[],
  scrollTop: number,
  viewportHeight: number,
  overscan: number = OVERSCAN_PX
): ListRow[] {
  if (!rows.length) return [];
  const from = scrollTop - overscan;
  const to = scrollTop + Math.max(0, viewportHeight) + overscan;

  // Rows are ordered by `top`, so the window is a contiguous slice: find its
  // bounds instead of filtering the whole array on every scroll event.
  let start = 0;
  let end = rows.length;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].top + rows[i].height >= from) {
      start = i;
      break;
    }
  }
  for (let i = start; i < rows.length; i++) {
    if (rows[i].top > to) {
      end = i;
      break;
    }
  }
  return rows.slice(start, end);
}
