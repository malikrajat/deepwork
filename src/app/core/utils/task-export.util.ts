/**
 * Pure helpers for exporting tasks to CSV.
 *
 * Everything here is side-effect free so the export sheet can be inspected and
 * relies on no Angular/DI — the service wires it to the store and the CSV
 * library, the panel renders it.
 */

import { STATUS_CONFIG, PRIORITY_CONFIG, QUADRANT_CONFIG } from '../constants/theme.constants';
import { PomodoroSession } from '../models/session.model';
import { Task } from '../models/task.model';
import {
  ExportDateField,
  ExportRangeKey,
  ExportRangePreset,
  ResolvedRange,
  TaskExportColumn,
  TaskExportOptions,
  TaskExportRow,
} from '../models/task-export.model';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const REPEAT_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─────────────────────────────────────────────────────────────────────────────
// Small date helpers (all local-time, all on `YYYY-MM-DD` strings)
// ─────────────────────────────────────────────────────────────────────────────

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/** Parses `YYYY-MM-DD` as a local date (avoids the UTC shift of `new Date(iso)`). */
function parseLocalDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function shiftDays(iso: string, days: number): string {
  const date = parseLocalDate(iso) ?? new Date();
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Whole days from `from` to `to` (negative when `to` is in the past). */
export function daysBetween(fromIso: string, toIso: string): number | null {
  const from = parseLocalDate(fromIso);
  const to = parseLocalDate(toIso);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** `2026-W37` (ISO-8601 week, Monday-based). */
export function isoWeekLabel(iso: string): string {
  const date = parseLocalDate(iso);
  if (!date) return '';
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  thursday.setDate(thursday.getDate() - ((thursday.getDay() + 6) % 7) + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${thursday.getFullYear()}-W${pad(week)}`;
}

export function weekdayName(iso: string): string {
  const date = parseLocalDate(iso);
  return date ? WEEKDAYS[date.getDay()] : '';
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranges
// ─────────────────────────────────────────────────────────────────────────────

export const EXPORT_RANGE_PRESETS: readonly ExportRangePreset[] = [
  { key: 'today', label: 'Today', hint: 'Tasks dated today' },
  { key: 'yesterday', label: 'Yesterday', hint: 'Tasks dated yesterday' },
  { key: 'last7', label: 'Last 7 days', hint: 'Rolling week ending today' },
  { key: 'thisWeek', label: 'This week', hint: 'Monday to Sunday of this week' },
  { key: 'thisMonth', label: 'This month', hint: 'Calendar month to date' },
  { key: 'lastMonth', label: 'Last month', hint: 'The previous full calendar month' },
  { key: 'thisYear', label: 'This year', hint: 'January to December' },
  { key: 'all', label: 'All time', hint: 'No date filter' },
  { key: 'custom', label: 'Custom range', hint: 'Pick your own start and end date' },
];

/** Turns a preset (or custom dates) into an inclusive `from`/`to` pair. */
export function resolveRange(
  key: ExportRangeKey,
  customFrom: string,
  customTo: string,
  today = todayIso()
): ResolvedRange {
  switch (key) {
    case 'today':
      return { from: today, to: today, label: `Today (${today})` };
    case 'yesterday': {
      const yesterday = shiftDays(today, -1);
      return { from: yesterday, to: yesterday, label: `Yesterday (${yesterday})` };
    }
    case 'last7':
      return { from: shiftDays(today, -6), to: today, label: `Last 7 days (${shiftDays(today, -6)} to ${today})` };
    case 'thisWeek': {
      const todayDate = parseLocalDate(today) ?? new Date();
      const monday = shiftDays(today, -((todayDate.getDay() + 6) % 7));
      const sunday = shiftDays(monday, 6);
      return { from: monday, to: sunday, label: `This week (${monday} to ${sunday})` };
    }
    case 'thisMonth': {
      const todayDate = parseLocalDate(today) ?? new Date();
      const first = `${todayDate.getFullYear()}-${pad(todayDate.getMonth() + 1)}-01`;
      const last = toIsoDate(new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0));
      return { from: first, to: last, label: `This month (${monthKey(first)})` };
    }
    case 'lastMonth': {
      const todayDate = parseLocalDate(today) ?? new Date();
      const first = toIsoDate(new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1));
      const last = toIsoDate(new Date(todayDate.getFullYear(), todayDate.getMonth(), 0));
      return { from: first, to: last, label: `Last month (${monthKey(first)})` };
    }
    case 'thisYear': {
      const todayDate = parseLocalDate(today) ?? new Date();
      const year = todayDate.getFullYear();
      return { from: `${year}-01-01`, to: `${year}-12-31`, label: `This year (${year})` };
    }
    case 'custom': {
      const from = parseLocalDate(customFrom) ? customFrom : null;
      const to = parseLocalDate(customTo) ? customTo : null;
      if (from && to && from > to) {
        return { from: to, to: from, label: `${to} to ${from}` };
      }
      if (from && to) return { from, to, label: from === to ? from : `${from} to ${to}` };
      if (from) return { from, to: null, label: `From ${from}` };
      if (to) return { from: null, to, label: `Until ${to}` };
      return { from: null, to: null, label: 'All time' };
    }
    default:
      return { from: null, to: null, label: 'All time' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Columns
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Export columns. Labels deliberately avoid commas and double quotes — the CSV
 * library quotes data cells but writes the header row verbatim.
 */
export const TASK_EXPORT_COLUMNS: readonly TaskExportColumn[] = [
  { key: 'date', label: 'Date' },
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'title', label: 'Task' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'quadrant', label: 'Quadrant' },
  { key: 'deadline', label: 'Deadline' },
  { key: 'deadlineDay', label: 'Deadline Day' },
  { key: 'daysToDeadline', label: 'Days To Deadline' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'tags', label: 'Tags' },
  { key: 'repeat', label: 'Repeat' },
  { key: 'description', label: 'Description' },
  { key: 'createdDate', label: 'Created Date' },
  { key: 'createdTime', label: 'Created Time' },
  { key: 'completedDate', label: 'Completed Date' },
  { key: 'completedTime', label: 'Completed Time' },
  { key: 'ageDays', label: 'Age In Days' },
  { key: 'focusSessions', label: 'Focus Sessions' },
  { key: 'focusMinutes', label: 'Focus Minutes' },
  { key: 'onTodayList', label: 'On Today List' },
  { key: 'taskId', label: 'Task ID' },
];

const DATE_FIELD_LABELS: Record<ExportDateField, string> = {
  deadline: 'deadline',
  created: 'created date',
  completed: 'completion date',
};

/** Date a task is counted under, or null when it has no such date. */
export function taskDateFor(task: Task, field: ExportDateField): string | null {
  if (field === 'created') return task.createdAt ? task.createdAt.slice(0, 10) : null;
  if (field === 'completed') return task.completedAt ? task.completedAt.slice(0, 10) : null;
  return task.deadline ?? null;
}

export function dateFieldLabel(field: ExportDateField): string {
  return DATE_FIELD_LABELS[field];
}

// ─────────────────────────────────────────────────────────────────────────────
// Row building
// ─────────────────────────────────────────────────────────────────────────────

/** Focus time booked against a task in the timer. */
export interface TaskFocus {
  sessions: number;
  minutes: number;
}

export type TaskFocusMap = Record<string, TaskFocus>;

/** Aggregates completed focus sessions per task. */
export function buildFocusMap(sessions: readonly PomodoroSession[]): TaskFocusMap {
  const map: TaskFocusMap = {};
  for (const session of sessions) {
    if (!session.taskId || session.type !== 'work') continue;
    const entry = (map[session.taskId] ??= { sessions: 0, minutes: 0 });
    entry.sessions += 1;
    entry.minutes += Math.max(0, session.durationActual) / 60;
  }
  for (const key of Object.keys(map)) map[key].minutes = Math.round(map[key].minutes);
  return map;
}

function statusLabel(task: Task): string {
  return STATUS_CONFIG[task.status]?.label ?? task.status;
}

function priorityLabel(task: Task): string {
  return PRIORITY_CONFIG[task.priority]?.label ?? `P${task.priority}`;
}

function quadrantLabel(task: Task): string {
  if (!task.quadrant) return 'Unassigned';
  const config = QUADRANT_CONFIG[task.quadrant];
  return config ? config.fullLabel.replace('·', '-') : task.quadrant;
}

function repeatLabel(task: Task): string {
  const recurrence = task.recurrence;
  if (!recurrence) return 'No repeat';

  let base: string;
  if (recurrence.frequency === 'weekly') {
    const days = (recurrence.days ?? []).map(day => REPEAT_DAY_LABELS[day] ?? String(day));
    base = days.length ? `Weekly on ${days.join(' ')}` : 'Weekly';
  } else if (recurrence.frequency === 'monthly') {
    const days = recurrence.days ?? [];
    base = days.length ? `Monthly on day ${days.join(' ')}` : 'Monthly';
  } else {
    base = recurringFrequencyLabel(recurrence.frequency);
  }

  const interval = recurrence.interval && recurrence.interval > 1 ? ` (every ${recurrence.interval})` : '';
  const until = recurrence.endDate ? ` until ${recurrence.endDate}` : '';
  return `${base}${interval}${until}`;
}

function recurringFrequencyLabel(frequency: string): string {
  if (frequency === 'daily') return 'Daily';
  if (frequency === 'weekly') return 'Weekly';
  if (frequency === 'monthly') return 'Monthly';
  return frequency;
}

function timePart(timestamp: string | null): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

/** Builds one CSV row for a task. */
export function buildTaskRow(
  task: Task,
  field: ExportDateField,
  focus: TaskFocusMap,
  today = todayIso()
): TaskExportRow {
  const date = taskDateFor(task, field) ?? '';
  const createdDate = task.createdAt ? task.createdAt.slice(0, 10) : '';
  const completedDate = task.completedAt ? task.completedAt.slice(0, 10) : '';
  const lastTouch = completedDate || today;
  const daysToDeadline = task.deadline ? daysBetween(today, task.deadline) : null;
  const overdue = task.deadline !== null && task.deadline < today && task.status !== 'done';
  const taskFocus = focus[task.id] ?? { sessions: 0, minutes: 0 };

  return {
    date,
    day: date ? weekdayName(date) : '',
    week: date ? isoWeekLabel(date) : '',
    month: date ? monthKey(date) : '',
    title: task.title,
    status: statusLabel(task),
    priority: priorityLabel(task),
    quadrant: quadrantLabel(task),
    deadline: task.deadline ?? '',
    deadlineDay: task.deadline ? weekdayName(task.deadline) : '',
    daysToDeadline: daysToDeadline === null ? '' : daysToDeadline,
    overdue: yesNo(overdue),
    tags: task.tags.join(', '),
    repeat: repeatLabel(task),
    description: task.description,
    createdDate,
    createdTime: timePart(task.createdAt),
    completedDate,
    completedTime: timePart(task.completedAt),
    ageDays: createdDate ? (daysBetween(createdDate, lastTouch) ?? '') : '',
    focusSessions: taskFocus.sessions,
    focusMinutes: taskFocus.minutes,
    onTodayList: yesNo(task.todayOrder !== null),
    taskId: task.id,
  };
}

export interface SelectTasksOptions {
  tasks: readonly Task[];
  options: TaskExportOptions;
  today?: string;
}

export interface SelectedTasks {
  tasks: Task[];
  /** Tasks that matched the date range. */
  datedCount: number;
  /** Tasks kept only because `includeUndated` is on. */
  undatedCount: number;
}

/** Applies the status/priority filters and the date range to the task list. */
export function selectTasksForExport({ tasks, options, today = todayIso() }: SelectTasksOptions): SelectedTasks {
  const range = resolveRange(options.range, options.customFrom, options.customTo, today);

  const filtered = tasks.filter(task => {
    if (options.status !== 'all' && task.status !== options.status) return false;
    if (options.priority !== 'all' && String(task.priority) !== options.priority) return false;
    return true;
  });

  const dated: Task[] = [];
  const undated: Task[] = [];
  for (const task of filtered) {
    const value = taskDateFor(task, options.dateField);
    if (!value) {
      undated.push(task);
      continue;
    }
    const inRange =
      (range.from === null || value >= range.from) && (range.to === null || value <= range.to);
    if (inRange) dated.push(task);
  }

  const selected = options.includeUndated ? [...dated, ...undated] : dated;
  const sorted = sortTasksForExport(selected, options.dateField);
  return { tasks: sorted, datedCount: dated.length, undatedCount: undated.length };
}

/** Oldest first within the range (chronological reading order), then priority. */
export function sortTasksForExport(tasks: readonly Task[], field: ExportDateField): Task[] {  return [...tasks].sort((a, b) => {
    const dateA = taskDateFor(a, field) ?? '';
    const dateB = taskDateFor(b, field) ?? '';
    if (dateA !== dateB) {
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA < dateB ? -1 : 1;
    }
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Totals block appended below the data when the user asks for a summary.
 * Values land in the first two columns so they read as a small label/value table.
 */
export function buildSummaryRows(
  tasks: readonly Task[],
  range: ResolvedRange,
  field: ExportDateField,
  focus: TaskFocusMap = {},
  generatedAt = new Date()
): TaskExportRow[] {
  const countBy = (status: Task['status']) => tasks.filter(task => task.status === status).length;
  const today = toIsoDate(generatedAt);
  const overdue = tasks.filter(
    task => task.deadline !== null && task.deadline < today && task.status !== 'done'
  ).length;
  const focusTotals = tasks.reduce(
    (totals, task) => {
      const entry = focus[task.id];
      if (entry) {
        totals.sessions += entry.sessions;
        totals.minutes += entry.minutes;
      }
      return totals;
    },
    { sessions: 0, minutes: 0 }
  );

  return [
    {},
    { date: 'Summary' },
    { date: 'Total tasks', day: tasks.length },
    { date: 'To do', day: countBy('todo') },
    { date: 'In progress', day: countBy('in-progress') },
    { date: 'Done', day: countBy('done') },
    { date: 'Overdue', day: overdue },
    { date: 'Focus sessions', day: focusTotals.sessions },
    { date: 'Focus minutes', day: focusTotals.minutes },
    { date: 'Date range', day: range.label },
    { date: 'Counted by', day: dateFieldLabel(field) },
    { date: 'Exported at', day: `${today} ${timePart(generatedAt.toISOString())}` },
  ];
}

/**
 * Export file name: `export-2026-09-13.csv` — always named after the day the
 * file was generated.
 */
export function exportFileName(today = todayIso()): string {
  return `export-${today}.csv`;
}
