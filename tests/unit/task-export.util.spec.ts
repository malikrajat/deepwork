import { describe, it, expect } from 'vitest';
import {
  TASK_EXPORT_COLUMNS,
  buildCsvContent,
  buildFocusMap,
  buildSummaryRows,
  buildTaskRow,
  dateFieldLabel,
  daysBetween,
  exportColumnsWithBom,
  exportFileName,
  isoWeekLabel,
  resolveRange,
  selectTasksForExport,
  sortTasksForExport,
  taskDateFor,
  toIsoDate,
  weekdayName,
} from '../../src/app/core/utils/task-export.util';
import { PRIORITY_CONFIG, STATUS_CONFIG } from '../../src/app/core/constants/theme.constants';
import type { TaskExportOptions } from '../../src/app/core/models/task-export.model';
import type { PomodoroSession } from '../../src/app/core/models/session.model';
import type { Task } from '../../src/app/core/models/task.model';

/**
 * The CSV export is the artefact people keep: it lands in a spreadsheet, gets
 * mailed on, and is read months later. So the date a task is counted under, the
 * range a preset really covers, and the exact bytes of the file (BOM, quoting,
 * CRLF) are all pinned down here.
 */

const TODAY = '2026-09-21'; // a Monday

function taskOf(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? 't1',
    title: 'Write the report',
    description: 'Some detail',
    priority: 2,
    status: 'todo',
    quadrant: 'urgent-important',
    deadline: null,
    tags: ['work'],
    recurrence: null,
    todayOrder: null,
    createdAt: '2026-09-20T09:05:00.000Z',
    completedAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function optionsOf(overrides: Partial<TaskExportOptions> = {}): TaskExportOptions {
  return {
    range: 'all',
    customFrom: '',
    customTo: '',
    dateField: 'created',
    status: 'all',
    priority: 'all',
    includeUndated: false,
    includeSummary: false,
    ...overrides,
  } as TaskExportOptions;
}

describe('task export: dates', () => {
  it('writes a local calendar day', () => {
    expect(toIsoDate(new Date(2026, 8, 21, 23, 59))).toBe('2026-09-21');
    expect(toIsoDate(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });

  it('measures whole days between two dates, in both directions', () => {
    expect(daysBetween('2026-09-21', '2026-09-24')).toBe(3);
    expect(daysBetween('2026-09-24', '2026-09-21')).toBe(-3);
    expect(daysBetween('2026-09-21', '2026-09-21')).toBe(0);
    // Across a summer-time change, where a naive hour count would drift.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-09-21', 'nonsense')).toBeNull();
    expect(daysBetween('', '')).toBeNull();
  });

  it('labels ISO weeks and weekdays the way a report reads', () => {
    expect(isoWeekLabel('2026-09-21')).toBe('2026-W39');
    expect(weekdayName('2026-09-21')).toBe('Monday');
    expect(weekdayName('2026-09-20')).toBe('Sunday');
    expect(weekdayName('not a date')).toBe('');
    expect(isoWeekLabel('not a date')).toBe('');
  });
});

describe('task export: ranges', () => {
  it('resolves each preset to inclusive dates', () => {
    expect(resolveRange('today', '', '', TODAY)).toEqual({
      from: TODAY,
      to: TODAY,
      label: `Today (${TODAY})`,
    });
    expect(resolveRange('yesterday', '', '', TODAY)).toMatchObject({
      from: '2026-09-20',
      to: '2026-09-20',
    });
    expect(resolveRange('last7', '', '', TODAY)).toMatchObject({
      from: '2026-09-15',
      to: TODAY,
    });
    expect(resolveRange('thisWeek', '', '', TODAY)).toMatchObject({
      from: '2026-09-21',
      to: '2026-09-27',
    });
    expect(resolveRange('thisMonth', '', '', TODAY)).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(resolveRange('lastMonth', '', '', TODAY)).toMatchObject({
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(resolveRange('thisYear', '', '', TODAY)).toMatchObject({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(resolveRange('all', '', '', TODAY)).toMatchObject({ from: null, to: null });
  });

  it('takes a custom range, turning it the right way up when it arrives reversed', () => {
    expect(resolveRange('custom', '2026-09-01', '2026-09-30', TODAY)).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
      label: '2026-09-01 to 2026-09-30',
    });
    expect(resolveRange('custom', '2026-09-30', '2026-09-01', TODAY)).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(resolveRange('custom', '2026-09-09', '2026-09-09', TODAY).label).toBe('2026-09-09');
  });

  it('accepts a half-filled or empty custom range', () => {
    expect(resolveRange('custom', '2026-09-01', '', TODAY)).toEqual({
      from: '2026-09-01',
      to: null,
      label: 'From 2026-09-01',
    });
    expect(resolveRange('custom', '', '2026-09-30', TODAY)).toEqual({
      from: null,
      to: '2026-09-30',
      label: 'Until 2026-09-30',
    });
    expect(resolveRange('custom', 'oops', 'nope', TODAY)).toMatchObject({ from: null, to: null });
  });
});

describe('task export: the file itself', () => {
  const rows = [
    { title: 'Plain', tags: 'work' },
    { title: 'Says "hi", twice', tags: 'a, b' },
    { title: 'No tags' },
  ];
  const columns = [
    { key: 'title' as const, label: 'Task' },
    { key: 'tags' as const, label: 'Tags' },
  ];

  it('writes a verbatim header, every cell quoted, and CRLF between rows', () => {
    const csv = buildCsvContent(rows, columns);
    const lines = csv.split('\r\n');

    expect(lines[0]).toBe('Task,Tags');
    expect(lines[1]).toBe('"Plain","work"');
    // A quote inside a cell is doubled, and the comma stays inside the cell.
    expect(lines[2]).toBe('"Says ""hi"", twice","a, b"');
    expect(lines[3]).toBe('"No tags",""');
    expect(lines).toHaveLength(4);
  });

  it('puts the UTF-8 BOM in the first header so Excel reads it as UTF-8', () => {
    const columns = exportColumnsWithBom();

    expect(columns[0].label.startsWith('\uFEFF')).toBe(true);
    expect(columns[0].label).toBe(`\uFEFF${TASK_EXPORT_COLUMNS[0].label}`);
    expect(columns[1].label).toBe(TASK_EXPORT_COLUMNS[1].label);
    expect(columns).toHaveLength(TASK_EXPORT_COLUMNS.length);
  });

  it('names the file after the day it was made', () => {
    expect(exportFileName('2026-09-21')).toBe('export-2026-09-21.csv');
  });
});

describe('task export: one row per task', () => {
  it('carries the dates, the labels and the focus time booked against the task', () => {
    const task = taskOf({
      id: 't1',
      title: 'Ship the release',
      description: 'with notes',
      priority: 1,
      status: 'done',
      quadrant: 'important',
      deadline: '2026-09-24',
      tags: ['work', 'urgent'],
      todayOrder: 3,
      createdAt: '2026-09-20T09:05:00.000Z',
      completedAt: '2026-09-21T18:30:00.000Z',
      recurrence: { frequency: 'weekly', interval: 2, days: [1, 3], endDate: '2026-12-01' },
    });

    const row = buildTaskRow(task, 'deadline', { t1: { sessions: 4, minutes: 100 } }, TODAY);

    expect(row).toMatchObject({
      date: '2026-09-24',
      day: 'Thursday',
      title: 'Ship the release',
      status: STATUS_CONFIG['done'].label,
      priority: PRIORITY_CONFIG[1].label,
      tags: 'work, urgent',
      deadline: '2026-09-24',
      deadlineDay: 'Thursday',
      daysToDeadline: 3,
      overdue: 'No',
      repeat: 'Weekly on Mon Wed (every 2) until 2026-12-01',
      description: 'with notes',
      createdDate: '2026-09-20',
      completedDate: '2026-09-21',
      focusSessions: 4,
      focusMinutes: 100,
      onTodayList: 'Yes',
      taskId: 't1',
    });
    expect(String(row.quadrant)).toContain('Q2');
    expect(String(row.ageDays)).toBe('1');
  });

  it('flags an overdue task and counts the days it is late', () => {
    const row = buildTaskRow(taskOf({ deadline: '2026-09-19' }), 'deadline', {}, TODAY);

    expect(row.overdue).toBe('Yes');
    expect(row.daysToDeadline).toBe(-2);
  });

  it('leaves the date columns empty for a task with no such date', () => {
    const row = buildTaskRow(
      taskOf({ deadline: null, completedAt: null, todayOrder: null, quadrant: null }),
      'completed',
      {},
      TODAY,
    );

    expect(row).toMatchObject({
      date: '',
      day: '',
      week: '',
      month: '',
      deadline: '',
      deadlineDay: '',
      daysToDeadline: '',
      completedDate: '',
      completedTime: '',
      focusSessions: 0,
      focusMinutes: 0,
      onTodayList: 'No',
      quadrant: 'Unassigned',
      repeat: 'No repeat',
    });
  });

  it('labels every kind of repeat the app can store', () => {
    const labels = [
      { frequency: 'daily', interval: 1 },
      { frequency: 'weekly', interval: 1 },
      { frequency: 'monthly', interval: 1 },
      { frequency: 'monthly', interval: 1, days: [15] },
    ].map((recurrence) =>
      String(
        buildTaskRow(taskOf({ recurrence: recurrence as Task['recurrence'] }), 'created', {}, TODAY)
          .repeat,
      ),
    );

    expect(labels[0]).toBe('Daily');
    expect(labels[1]).toBe('Weekly');
    expect(labels[2]).toBe('Monthly');
    expect(labels[3]).toBe('Monthly on day 15');
  });

  it('counts only completed focus sessions that name a task', () => {
    const sessions: PomodoroSession[] = [
      {
        id: 's1',
        taskId: 't1',
        type: 'work',
        durationPlanned: 1500,
        durationActual: 1500,
        startedAt: '',
        completedAt: '',
        interrupted: false,
      },
      {
        id: 's2',
        taskId: 't1',
        type: 'work',
        durationPlanned: 1500,
        durationActual: 750,
        startedAt: '',
        completedAt: '',
        interrupted: true,
      },
      {
        id: 's3',
        taskId: 't1',
        type: 'short-break',
        durationPlanned: 300,
        durationActual: 300,
        startedAt: '',
        completedAt: '',
        interrupted: false,
      },
      {
        id: 's4',
        taskId: null,
        type: 'work',
        durationPlanned: 1500,
        durationActual: 1500,
        startedAt: '',
        completedAt: '',
        interrupted: false,
      },
    ];

    expect(buildFocusMap(sessions)).toEqual({ t1: { sessions: 2, minutes: 38 } });
    expect(buildFocusMap([])).toEqual({});
  });
});

describe('task export: which tasks get exported', () => {
  const tasks = [
    taskOf({ id: 'old', title: 'Older', createdAt: '2026-09-01T10:00:00.000Z' }),
    taskOf({ id: 'new', title: 'Newer', createdAt: '2026-09-20T10:00:00.000Z' }),
    taskOf({
      id: 'done',
      title: 'Closed',
      status: 'done',
      createdAt: '2026-09-10T10:00:00.000Z',
      completedAt: '2026-09-11T10:00:00.000Z',
    }),
    taskOf({ id: 'undated', title: 'No created date', createdAt: '' }),
  ];

  it('applies the status and priority filters', () => {
    const byStatus = selectTasksForExport({
      tasks,
      options: optionsOf({ status: 'done' }),
      today: TODAY,
    });
    expect(byStatus.tasks.map((task) => task.id)).toEqual(['done']);

    const byPriority = selectTasksForExport({
      tasks: [...tasks, taskOf({ id: 'critical', priority: 1 })],
      options: optionsOf({ priority: '1' }),
      today: TODAY,
    });
    expect(byPriority.tasks.map((task) => task.id)).toEqual(['critical']);
  });

  it('keeps only what falls inside the range, and counts the rest as undated', () => {
    const result = selectTasksForExport({
      tasks,
      options: optionsOf({ range: 'last7' }),
      today: TODAY,
    });

    expect(result.tasks.map((task) => task.id)).toEqual(['new']);
    expect(result.datedCount).toBe(1);
    expect(result.undatedCount).toBe(1);
  });

  it('adds the undated tasks when the option is on', () => {
    const result = selectTasksForExport({
      tasks,
      options: optionsOf({ range: 'last7', includeUndated: true }),
      today: TODAY,
    });

    expect(result.tasks.map((task) => task.id)).toEqual(['new', 'undated']);
  });

  it('can count a task by its deadline instead of the day it was written', () => {
    const withDeadline = [
      ...tasks,
      taskOf({ id: 'due', deadline: TODAY, createdAt: '2026-01-01T10:00:00.000Z' }),
    ];
    const result = selectTasksForExport({
      tasks: withDeadline,
      options: optionsOf({ range: 'today', dateField: 'deadline' }),
      today: TODAY,
    });

    expect(result.tasks.map((task) => task.id)).toEqual(['due']);
    expect(dateFieldLabel('deadline')).toBe('deadline');
    expect(dateFieldLabel('created')).toBe('created date');
    expect(dateFieldLabel('completed')).toBe('completion date');
  });

  it('reads oldest first, then priority, then title', () => {
    const sorted = sortTasksForExport(
      [
        taskOf({ id: 'b', title: 'B', priority: 2, createdAt: '2026-09-02T10:00:00.000Z' }),
        taskOf({ id: 'a', title: 'A', priority: 2, createdAt: '2026-09-02T10:00:00.000Z' }),
        taskOf({ id: 'urgent', title: 'Z', priority: 1, createdAt: '2026-09-02T10:00:00.000Z' }),
        taskOf({ id: 'first', title: 'First', priority: 3, createdAt: '2026-09-01T10:00:00.000Z' }),
        taskOf({ id: 'none', title: 'No date', priority: 1, createdAt: '' }),
      ],
      'created',
    );

    expect(sorted.map((task) => task.id)).toEqual(['first', 'urgent', 'a', 'b', 'none']);
  });

  it('counts a task under its deadline when that is the chosen date', () => {
    const dated = taskOf({ deadline: '2026-09-25', createdAt: '2026-09-01T10:00:00.000Z' });

    expect(taskDateFor(dated, 'deadline')).toBe('2026-09-25');
    expect(taskDateFor(dated, 'created')).toBe('2026-09-01');
    expect(taskDateFor(dated, 'completed')).toBeNull();
    expect(taskDateFor(taskOf({ deadline: null }), 'deadline')).toBeNull();
  });
});

describe('task export: the summary block', () => {
  it('totals the tasks by status, overdue and focus time', () => {
    const tasks = [
      taskOf({ id: 'a', status: 'todo' }),
      taskOf({ id: 'b', status: 'in-progress' }),
      taskOf({ id: 'c', status: 'done' }),
      taskOf({ id: 'd', status: 'todo', deadline: '2026-09-01' }),
    ];
    const range = resolveRange('all', '', '', TODAY);

    const rows = buildSummaryRows(
      tasks,
      range,
      'created',
      { c: { sessions: 3, minutes: 75 } },
      new Date(2026, 8, 21, 18, 30),
    );

    const value = (label: string) => rows.find((row) => row.date === label)?.day;

    expect(rows[0]).toEqual({});
    expect(rows[1]).toEqual({ date: 'Summary' });
    expect(value('Total tasks')).toBe(4);
    expect(value('To do')).toBe(2);
    expect(value('In progress')).toBe(1);
    expect(value('Done')).toBe(1);
    expect(value('Overdue')).toBe(1);
    expect(value('Focus sessions')).toBe(3);
    expect(value('Focus minutes')).toBe(75);
    expect(value('Date range')).toBe('All time');
    expect(value('Counted by')).toBe('created date');
    expect(String(rows.at(-1)?.day)).toContain(TODAY);
  });
});
