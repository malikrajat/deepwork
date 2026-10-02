import { Task } from '../../core/models/task.model';

/**
 * Collapsible date sections for the Tasks page.
 *
 * The board still does the work — each section holds the same three status
 * columns cards are dragged between — but the page is read the way a mailbox is
 * read: today at the top, then tomorrow and the rest of the week, then the
 * months ahead; below that yesterday, last week, last month and the months
 * behind. Old sections fold away, so a year of tasks stays a short page.
 *
 * A task belongs to the section of *its own* date: its deadline when it has
 * one, otherwise the day it was written. Grouping by "last touched" would make
 * a card jump into Today the moment it was dragged to Done, which is exactly
 * what a board should not do.
 *
 * Kept free of Angular so the boundary rules can be unit-tested directly.
 */

/** One renderable date section. */
export interface TaskDateGroup {
  /** Stable section id — also the key of its open/collapsed state. */
  key: string;
  /** "Today", "Yesterday", "Last week", "August 2026", … */
  label: string;
  tasks: Task[];
  doneCount: number;
  /** Sort weight; smaller numbers sit closer to the top of the page. */
  order: number;
}

const DAY_MS = 86_400_000;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** A task's date reduced to the four numbers the boundaries are drawn with. */
interface DayInfo {
  /** `YYYY-MM-DD`, local calendar day. */
  key: string;
  /** Days since the epoch — the only way day arithmetic stays exact. */
  day: number;
  /** Week index; weeks start on Sunday, as the app's day picker does. */
  week: number;
  /** Year × 12 + month, so months compare and count like numbers. */
  month: number;
  year: number;
  monthOfYear: number;
}

interface Bucket {
  key: string;
  label: string;
  order: number;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function infoOf(date: Date): DayInfo {
  const year = date.getFullYear();
  const monthOfYear = date.getMonth();
  const dayOfMonth = date.getDate();
  const day = Math.floor(Date.UTC(year, monthOfYear, dayOfMonth) / DAY_MS);
  return {
    key: `${year}-${pad(monthOfYear + 1)}-${pad(dayOfMonth)}`,
    day,
    week: Math.floor((day - date.getDay()) / 7),
    month: year * 12 + monthOfYear,
    year,
    monthOfYear,
  };
}

/** A task's `YYYY-MM-DD` deadline, read as a local calendar day. */
function fromIsoDay(iso: string): DayInfo | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const dayOfMonth = Number(match[3]);
  const date = new Date(year, month, dayOfMonth);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== dayOfMonth) {
    return null;
  }
  return infoOf(date);
}

/** When the task holds an ISO timestamp (its creation stamp). */
function fromIsoTimestamp(iso: string): DayInfo | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : infoOf(date);
}

/**
 * The day a task is filed under: its deadline, or the day it was written.
 * A stamp that cannot be read is folded into today rather than given a section
 * of its own.
 */
export function taskDay(task: Task, now = new Date()): DayInfo {
  return (task.deadline ? fromIsoDay(task.deadline) : null) ?? fromIsoTimestamp(task.createdAt) ?? infoOf(now);
}

function monthLabel(day: DayInfo, today: DayInfo): string {
  const name = MONTH_NAMES[day.monthOfYear];
  return day.year === today.year ? name : `${name} ${day.year}`;
}

/**
 * The section a day falls into, relative to today.
 *
 * Order weights leave room for the dynamic month sections in between: the fixed
 * buckets sit at 0–530, and months are numbered from those anchors — the nearer
 * a month is to today, the closer its weight.
 */
export function bucketFor(day: DayInfo, today: DayInfo): Bucket {
  const days = day.day - today.day;
  const weeks = day.week - today.week;
  const months = day.month - today.month;

  if (days === 0) return { key: 'today', label: 'Today', order: 0 };
  if (days === 1) return { key: 'tomorrow', label: 'Tomorrow', order: 10 };

  if (days > 1) {
    if (weeks === 0) return { key: 'this-week', label: 'Later this week', order: 20 };
    if (weeks === 1) return { key: 'next-week', label: 'Next week', order: 30 };
    if (months === 0) return { key: 'this-month', label: 'Later this month', order: 40 };
    return {
      key: `month-${day.year}-${pad(day.monthOfYear + 1)}`,
      label: monthLabel(day, today),
      order: 100 + months,
    };
  }

  if (days === -1) return { key: 'yesterday', label: 'Yesterday', order: 500 };
  if (weeks === 0) return { key: 'week-past', label: 'Earlier this week', order: 510 };
  if (weeks === -1) return { key: 'last-week', label: 'Last week', order: 520 };
  if (months === 0) return { key: 'month-past', label: 'Earlier this month', order: 530 };
  return {
    key: `month-${day.year}-${pad(day.monthOfYear + 1)}`,
    label: monthLabel(day, today),
    order: 1000 - months,
  };
}

/**
 * Buckets tasks into date sections.
 *
 * The incoming order is preserved inside each section, so the page's sort
 * control still decides how the cards line up. Sections come back in reading
 * order; empty ones are dropped.
 */
export function groupTasksByDate(tasks: readonly Task[], now = new Date()): TaskDateGroup[] {
  const today = infoOf(now);
  const groups = new Map<string, TaskDateGroup>();

  for (const task of tasks) {
    const bucket = bucketFor(taskDay(task, now), today);

    const existing = groups.get(bucket.key);
    if (existing) {
      existing.tasks.push(task);
      if (task.status === 'done') existing.doneCount++;
      continue;
    }
    groups.set(bucket.key, {
      key: bucket.key,
      label: bucket.label,
      tasks: [task],
      doneCount: task.status === 'done' ? 1 : 0,
      order: bucket.order,
    });
  }

  return [...groups.values()].sort((a, b) => a.order - b.order);
}

/**
 * The section a task belongs to. The page uses it to open the section a task
 * just landed in — a card in a folded section reads as a lost task.
 */
export function sectionKeyFor(task: Task, now = new Date()): string {
  return bucketFor(taskDay(task, now), infoOf(now)).key;
}
