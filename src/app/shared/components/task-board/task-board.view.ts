import { Task, TaskStatus } from '../../../core/models/task.model';
import { STATUS_CONFIG, STATUS_CYCLE } from '../../../core/constants/theme.constants';

/** One status column of the board. */
export interface BoardColumn {
  status: TaskStatus;
  label: string;
  /** Colour class from `STATUS_CONFIG` — the same one every page paints with. */
  cardClass: string;
  tasks: readonly Task[];
}

/**
 * Spread tasks over one column per status, in cycle order (To Do → In Progress
 * → Done). The board partitions whatever order it is handed and never re-sorts:
 * the Tasks page has a sort control and Today follows its own daily sequence.
 */
export function boardColumns(tasks: readonly Task[]): BoardColumn[] {
  const buckets = new Map<TaskStatus, Task[]>(STATUS_CYCLE.map(status => [status, []]));
  for (const task of tasks) {
    buckets.get(task.status)?.push(task);
  }
  return STATUS_CYCLE.map(status => ({
    status,
    label: STATUS_CONFIG[status].label,
    cardClass: STATUS_CONFIG[status].cardClass,
    tasks: buckets.get(status) ?? [],
  }));
}

const STATUS_SHORTCUTS: Record<string, TaskStatus> = {
  '1': 'todo',
  '2': 'in-progress',
  '3': 'done',
};

/** `1` → To Do, `2` → In Progress, `3` → Done; null for any other key. */
export function statusShortcut(key: string): TaskStatus | null {
  return STATUS_SHORTCUTS[key] ?? null;
}

/**
 * The status `step` columns away from `status` — what the arrow keys walk.
 * Returns null at the ends of the board so a card cannot be pushed off it.
 */
export function adjacentStatus(status: TaskStatus, step: number): TaskStatus | null {
  return STATUS_CYCLE[STATUS_CYCLE.indexOf(status) + step] ?? null;
}

/**
 * The day's order after a card was dropped: the columns left to right with the
 * moved card sitting where it landed. Used by the Today board, whose drop
 * position is the order the user wants to work in.
 */
export function sequenceAfterMove(
  tasks: readonly Task[],
  moved: { task: Task; status: TaskStatus; index: number }
): string[] {
  const columns: Record<TaskStatus, Task[]> = { 'todo': [], 'in-progress': [], 'done': [] };
  for (const task of tasks) {
    columns[task.status].push(task);
  }

  columns[moved.task.status] = columns[moved.task.status].filter(t => t.id !== moved.task.id);
  const target = columns[moved.status];
  target.splice(Math.max(0, Math.min(moved.index, target.length)), 0, moved.task);

  return [...columns['todo'], ...columns['in-progress'], ...columns['done']].map(t => t.id);
}
