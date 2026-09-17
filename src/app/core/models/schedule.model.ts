import { Task, TaskQuadrant } from './task.model';

/** Minutes elapsed since local midnight (0–1440). */
export type MinuteOfDay = number;

export type BreakKind = 'short-break' | 'long-break';

/**
 * Per-task, per-day plan entry.
 *
 * The quadrant itself is never duplicated here — it stays on the task, so the
 * Eisenhower matrix remains the single source of truth for prioritisation.
 * A plan entry only adds the day-specific information: where the task sits in
 * the queue and how/when it was placed on the timeline.
 */
export interface ScheduleEntry {
  taskId: string;
  /** Position inside its own quadrant (1-based). Lower runs first. */
  order: number;
  /**
   * Manual placement (minutes from midnight). `null` means "auto-schedule me":
   * the task flows into the next free focus block, in quadrant/queue order.
   * Two tasks sharing the same value share one slot — the first is the
   * automatic owner, the rest were added by hand.
   */
  slotStart: MinuteOfDay | null;
  /** Reserved focus blocks (pomodoros). `null` = 1 block. */
  pomodoros: number | null;
}

export interface DayPlan {
  date: string;
  entries: ScheduleEntry[];
}

/** Timeline window, shared by every day (not per-day state). */
export interface SchedulePrefs {
  dayStart: MinuteOfDay;
  dayEnd: MinuteOfDay;
}

/** A pomodoro work slot. May host more than one task when added manually. */
export interface FocusBlock {
  kind: 'focus';
  id: string;
  startMin: MinuteOfDay;
  endMin: MinuteOfDay;
  /** 1-based focus block number of the day. */
  index: number;
  /** First id is the auto-scheduled owner; extra ids were added by hand. */
  taskIds: string[];
  /** True when at least one task in the slot was placed by hand. */
  pinned: boolean;
  /** True when this slot continues a task that started in an earlier slot. */
  continued: boolean;
}

/** An automatically reserved rest slot. Never receives auto-scheduled work. */
export interface BreakBlock {
  kind: BreakKind;
  id: string;
  startMin: MinuteOfDay;
  endMin: MinuteOfDay;
  /** Focus block number this break follows. */
  index: number;
  /** Focus block this break belongs to. */
  afterId: string;
}

export type ScheduleBlock = FocusBlock | BreakBlock;

/** Where a task ended up on the timeline (may span several focus blocks). */
export interface PlacedTask {
  taskId: string;
  startMin: MinuteOfDay;
  endMin: MinuteOfDay;
  blockIds: string[];
  pomodoros: number;
  pinned: boolean;
  quadrant: TaskQuadrant | null;
}

export interface UnscheduledTask {
  taskId: string;
  reason: 'overflow';
}

export interface DayTotals {
  focusMinutes: number;
  breakMinutes: number;
  pomodoros: number;
  breaks: number;
  tasks: number;
}

export interface DaySchedule {
  blocks: ScheduleBlock[];
  placements: PlacedTask[];
  unscheduled: UnscheduledTask[];
  viewStartMin: MinuteOfDay;
  viewEndMin: MinuteOfDay;
  totals: DayTotals;
}

/** A task with the day-specific scheduling information attached. */
export interface ScheduleItem {
  task: Task;
  /** `null` when the task has no quadrant yet (only hand-placed tasks can be). */
  quadrant: TaskQuadrant | null;
  entry: ScheduleEntry | null;
  /** 0-based position in the flattened quadrant → task sequence. */
  index: number;
}

/** A task that carries a quadrant, and therefore a place in the queue. */
export interface QueuedTask extends ScheduleItem {
  quadrant: TaskQuadrant;
}

export const SCHEDULE_DEFAULTS: SchedulePrefs = {
  dayStart: 9 * 60,
  dayEnd: 18 * 60,
};

export const MAX_POMODOROS = 8;
export const MIN_POMODOROS = 1;
/** Timeline interactions snap to this many minutes. */
export const SNAP_MINUTES = 5;
