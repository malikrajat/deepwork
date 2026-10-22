/** The Time page's model: focus sessions grouped by the work they paid for. */

import { PomodoroSession } from './session.model';
import { Task } from './task.model';

/** The window the Time page is looking at. */
export type TimePeriodKey = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

/** How a period is divided for its chart and breakdown table. */
export type TimeBucketGrain = 'hour' | 'day' | 'week' | 'month' | 'year';

/**
 * How a piece of work presents itself across the sessions.
 *
 * `daily`/`weekly`/`monthly`/`occasional` are repeating work (several instances
 * or a rhythm in the session days); `multi-day` is one task worked on across
 * more than one day; `one-off` is one task on one day; `untasked` is time the
 * timer recorded without a task, which the page shows rather than hides.
 */
export type TimeCadence =
  'daily' | 'weekly' | 'monthly' | 'occasional' | 'multi-day' | 'one-off' | 'untasked';

export interface TimePeriod {
  key: TimePeriodKey;
  /** "This week", "All time", … */
  label: string;
  /** Lower-case phrase for a sentence: "this month", "all time". */
  description: string;
  /** Inclusive first local day; null while an all-time period is being placed. */
  from: string | null;
  /** Inclusive last local day — today. */
  to: string;
  grain: TimeBucketGrain;
  /** "Day", "Week", "Month", "Year" — the table's first column heading. */
  bucketHeader: string;
}

/** One bar in a task's period chart, and one row in its breakdown table. */
export interface TimeBucket {
  key: string;
  /** "13 Oct", "6–12 Oct", "October 2026", "2026". */
  label: string;
  /** What fits under a bar: "13", "W2", "Oct", "2026". */
  axisLabel: string;
  /** Inclusive local days this bucket covers. */
  from: string;
  to: string;
  /** Present when the grain is `hour`: the four-hour block this bar covers. */
  fromHour?: number;
  toHour?: number;
  seconds: number;
  sessions: number;
  days: number;
  /** Bar height against the task's own busiest bucket, 0–100. */
  percent: number;
  isCurrent: boolean;
}

/** One session, as the page reads it — the task's name already resolved. */
export interface TimeSessionView {
  id: string;
  taskId: string | null;
  title: string;
  startedAt: string;
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  /** Local hour of the day, 0–23 — used by a single-day ("time of day") chart. */
  hour: number;
  seconds: number;
  interrupted: boolean;
}

/** All the time spent on one piece of work, however many task rows it used. */
export interface TimeGroup {
  /** Normalised title, or the untasked sentinel. */
  key: string;
  /** The name shown: the current task title, else the recorded one. */
  title: string;
  isUntasked: boolean;
  cadence: TimeCadence;
  cadenceLabel: string;

  /** All time, to today. */
  totalSeconds: number;
  totalSessionCount: number;
  totalDays: number;
  firstAt: string;
  lastAt: string;
  firstDay: string;
  lastDay: string;
  /** Inclusive days from the first session to the last, at least 1. */
  spanDays: number;
  /** Distinct task rows this work arrived as (daily copies count separately). */
  instanceCount: number;
  averageSessionSeconds: number;
  /** Days touched / days in the span, 0–1. */
  consistency: number;

  /** Inside the selected period. */
  periodSeconds: number;
  periodSessionCount: number;
  periodDays: number;
  periodSessions: TimeSessionView[];
  buckets: TimeBucket[];
}

export interface TimeTotals {
  /** Selected period. */
  seconds: number;
  sessions: number;
  days: number;
  tasks: number;
  /** All time. */
  allTimeSeconds: number;
  allTimeSessions: number;
  allTimeDays: number;
  allTimeTasks: number;
  /** Period split: work that repeats, and everything else. */
  repeatSeconds: number;
  repeatSessions: number;
  oneOffSeconds: number;
  oneOffSessions: number;
}

export interface TimeReport {
  period: TimePeriod;
  /** Busiest first inside the period; only work with time in the period. */
  groups: TimeGroup[];
  totals: TimeTotals;
  insights: string[];
  /** False only when the database has no work sessions at all. */
  hasAnySessions: boolean;
}

export interface TimeReportInput {
  sessions: readonly PomodoroSession[];
  tasks: readonly Task[];
  period: TimePeriodKey;
  /** Inclusive `YYYY-MM-DD` bounds, used when `period` is `custom`. */
  customFrom?: string | null;
  customTo?: string | null;
  now?: Date;
}
