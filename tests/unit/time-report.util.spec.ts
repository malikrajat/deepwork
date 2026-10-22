import { describe, it, expect } from 'vitest';
import { PomodoroSession } from '../../src/app/core/models/session.model';
import { Task } from '../../src/app/core/models/task.model';
import {
  TIME_PERIODS,
  UNTASKED_TITLE,
  buildTimeReport,
  dayKey,
  formatDayLabel,
  formatDuration,
  formatTimeOfDay,
  timePeriodFor,
} from '../../src/app/core/utils/time-report.util';

/**
 * The Time page is only useful if its arithmetic is honest: one row per piece
 * of work however many daily copies it arrived as, an all-time total that does
 * not move when the period changes, and a breakdown whose buckets add up to the
 * period's total. These cases pin those three promises.
 */

const NOW = new Date(2026, 9, 18, 12, 0, 0); // Sunday 18 October 2026, local

/** A local timestamp in October 2026 (or another month when asked). */
function at(day: number, hour = 9, minute = 0, month = 9): string {
  return new Date(2026, month, day, hour, minute).toISOString();
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    title: 'Code review',
    description: '',
    priority: 3,
    status: 'todo',
    quadrant: null,
    deadline: null,
    tags: [],
    recurrence: null,
    todayOrder: null,
    todayOrderDate: null,
    createdAt: at(1),
    completedAt: null,
    ...overrides,
  };
}

function makeSession(overrides: Partial<PomodoroSession> = {}): PomodoroSession {
  return {
    id: crypto.randomUUID(),
    taskId: null,
    taskTitle: null,
    type: 'work',
    durationPlanned: 1500,
    durationActual: 1500,
    startedAt: at(5),
    completedAt: at(5, 9, 25),
    interrupted: false,
    ...overrides,
  };
}

describe('time report: formatting', () => {
  it('reads a duration in the units a person uses', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(-5)).toBe('0m');
    expect(formatDuration(30)).toBe('<1m');
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(45 * 60)).toBe('45m');
    expect(formatDuration(60 * 60)).toBe('1h');
    expect(formatDuration(2 * 60 * 60 + 15 * 60)).toBe('2h 15m');
    expect(formatDuration(Number.NaN)).toBe('0m');
  });

  it('writes a day and a time without depending on the machine locale', () => {
    expect(formatDayLabel('2026-10-05')).toBe('5 Oct 2026');
    expect(formatDayLabel(at(5))).toBe('5 Oct 2026');
    expect(formatDayLabel('not a date')).toBe('');
    expect(formatTimeOfDay(at(5, 14, 30))).toContain(':');
    expect(formatTimeOfDay('not a date')).toBe('');
    expect(dayKey(new Date(2026, 0, 2, 23, 59))).toBe('2026-01-02');
  });
});

describe('time report: periods', () => {
  it('offers the six windows in reading order', () => {
    expect(TIME_PERIODS.map((period) => period.key)).toEqual([
      'today',
      'week',
      'month',
      'year',
      'all',
      'custom',
    ]);
  });

  it('makes today one day, by time of day', () => {
    const period = timePeriodFor('today', NOW);
    expect(period.from).toBe('2026-10-18');
    expect(period.to).toBe('2026-10-18');
    expect(period.grain).toBe('hour');
    expect(period.bucketHeader).toBe('Time of day');
  });

  it('makes this week the last seven days, by day', () => {
    const period = timePeriodFor('week', NOW);
    expect(period.from).toBe('2026-10-12');
    expect(period.to).toBe('2026-10-18');
    expect(period.grain).toBe('day');
    expect(period.bucketHeader).toBe('Day');
  });

  it('makes this month the calendar month to date, by week', () => {
    const period = timePeriodFor('month', NOW);
    expect(period.from).toBe('2026-10-01');
    expect(period.grain).toBe('week');
    expect(period.bucketHeader).toBe('Week');
  });

  it('makes this year the calendar year to date, by month', () => {
    const period = timePeriodFor('year', NOW);
    expect(period.from).toBe('2026-01-01');
    expect(period.grain).toBe('month');
    expect(period.bucketHeader).toBe('Month');
  });

  it('picks an all-time grain that keeps the chart readable', () => {
    expect(timePeriodFor('all', NOW, '2026-10-10').grain).toBe('day');
    expect(timePeriodFor('all', NOW, '2026-07-01').grain).toBe('week');
    expect(timePeriodFor('all', NOW, '2025-10-18').grain).toBe('month');
    expect(timePeriodFor('all', NOW, '2022-01-01').grain).toBe('year');
    // No history yet: one day, not an empty chart.
    expect(timePeriodFor('all', NOW, null).from).toBe('2026-10-18');
    expect(timePeriodFor('all', NOW, null).grain).toBe('day');
  });

  it('uses the two custom bounds as given', () => {
    const period = timePeriodFor('custom', NOW, null, '2026-09-05', '2026-09-19');
    expect(period.from).toBe('2026-09-05');
    expect(period.to).toBe('2026-09-19');
    expect(period.grain).toBe('day');
    expect(period.description).toBe('the selected range');
  });

  it('accepts one day as a custom range, read by time of day', () => {
    const period = timePeriodFor('custom', NOW, null, '2026-09-05', '2026-09-05');
    expect(period.from).toBe('2026-09-05');
    expect(period.to).toBe('2026-09-05');
    expect(period.grain).toBe('hour');
    expect(period.bucketHeader).toBe('Time of day');
  });

  it('repairs an inverted or impossible custom range', () => {
    const inverted = timePeriodFor('custom', NOW, null, '2026-09-19', '2026-09-05');
    expect(inverted.from).toBe('2026-09-05');
    expect(inverted.to).toBe('2026-09-19');

    // A future bound is time that has not happened; it is clamped to today.
    const future = timePeriodFor('custom', NOW, null, '2026-10-10', '2026-12-01');
    expect(future.to).toBe('2026-10-18');

    // A day that does not exist falls back rather than building bad buckets.
    const invalid = timePeriodFor('custom', NOW, null, '2026-02-30', '2026-10-18');
    expect(invalid.from).toBe('2026-10-12');
    expect(invalid.to).toBe('2026-10-18');
  });
});

describe('time report: one row per piece of work', () => {
  it('adds daily copies of the same title into one row', () => {
    const monday = makeTask({ id: 'm', title: 'Code review' });
    const tuesday = makeTask({ id: 't', title: '  code   review ' });
    const wednesday = makeTask({ id: 'w', title: 'CODE REVIEW' });
    const sessions = [
      makeSession({ taskId: 'm', taskTitle: 'Code review', startedAt: at(12) }),
      makeSession({ taskId: 't', taskTitle: 'code review', startedAt: at(13) }),
      makeSession({ taskId: 'w', taskTitle: 'CODE REVIEW', startedAt: at(14) }),
    ];

    const report = buildTimeReport({
      sessions,
      tasks: [monday, tuesday, wednesday],
      period: 'month',
      now: NOW,
    });

    expect(report.groups).toHaveLength(1);
    const group = report.groups[0];
    expect(group.title).toBe('CODE REVIEW');
    expect(group.totalSessionCount).toBe(3);
    expect(group.instanceCount).toBe(3);
    expect(group.totalDays).toBe(3);
    expect(group.cadence).toBe('daily');
    expect(group.cadenceLabel).toBe('Repeats daily');
    expect(group.totalSeconds).toBe(3 * 1500);
    expect(group.firstAt).toBe(at(12));
    expect(group.lastAt).toBe(at(14));
    expect(report.totals.allTimeTasks).toBe(1);
  });

  it('uses the current task title, so a renamed task keeps its history together', () => {
    const task = makeTask({ id: 'renamed', title: 'Review the pull request' });
    const sessions = [
      makeSession({ taskId: 'renamed', taskTitle: 'Code review', startedAt: at(12) }),
      makeSession({ taskId: 'renamed', taskTitle: 'Code review', startedAt: at(13) }),
    ];

    const report = buildTimeReport({
      sessions,
      tasks: [task],
      period: 'month',
      now: NOW,
    });

    expect(report.groups[0].title).toBe('Review the pull request');
    expect(report.groups[0].totalSessionCount).toBe(2);
  });

  it('keeps a deleted task’s time under its recorded title', () => {
    const sessions = [
      makeSession({ taskId: null, taskTitle: 'Old report', startedAt: at(12) }),
      makeSession({ taskId: null, taskTitle: 'Old report', startedAt: at(13) }),
    ];

    const report = buildTimeReport({
      sessions,
      tasks: [],
      period: 'month',
      now: NOW,
    });

    expect(report.groups[0].title).toBe('Old report');
    expect(report.groups[0].totalSessionCount).toBe(2);
    expect(report.groups[0].cadence).toBe('multi-day');
  });

  it('shows untasked time instead of dropping it', () => {
    const report = buildTimeReport({
      sessions: [
        makeSession({ taskId: null, taskTitle: null, startedAt: at(12) }),
        makeSession({ taskId: null, taskTitle: '  ', startedAt: at(13) }),
      ],
      tasks: [],
      period: 'month',
      now: NOW,
    });

    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].isUntasked).toBe(true);
    expect(report.groups[0].title).toBe(UNTASKED_TITLE);
    expect(report.groups[0].cadence).toBe('untasked');
    expect(report.totals.tasks).toBe(0);
    expect(report.totals.allTimeTasks).toBe(0);
  });

  it('ignores breaks, empty sessions and unreadable timestamps', () => {
    const report = buildTimeReport({
      sessions: [
        makeSession({ type: 'short-break', startedAt: at(12) }),
        makeSession({ durationActual: 0, startedAt: at(12) }),
        makeSession({ startedAt: 'not a date' }),
        makeSession({ startedAt: at(13), durationActual: 900 }),
      ],
      tasks: [],
      period: 'month',
      now: NOW,
    });

    expect(report.totals.allTimeSessions).toBe(1);
    expect(report.totals.allTimeSeconds).toBe(900);
    expect(report.hasAnySessions).toBe(true);
  });

  it('sorts the busiest work in the period first', () => {
    const report = buildTimeReport({
      sessions: [
        makeSession({ taskId: 'a', taskTitle: 'Small', startedAt: at(12), durationActual: 300 }),
        makeSession({ taskId: 'b', taskTitle: 'Big', startedAt: at(12), durationActual: 3000 }),
      ],
      tasks: [makeTask({ id: 'a', title: 'Small' }), makeTask({ id: 'b', title: 'Big' })],
      period: 'month',
      now: NOW,
    });

    expect(report.groups.map((group) => group.title)).toEqual(['Big', 'Small']);
  });
});

describe('time report: cadence', () => {
  const build = (sessions: PomodoroSession[], tasks: Task[] = []) =>
    buildTimeReport({ sessions, tasks, period: 'month', now: NOW });

  it('reads a configured recurrence over the gaps', () => {
    const task = makeTask({
      id: 'weekly',
      title: 'Weekly report',
      recurrence: { frequency: 'weekly', interval: 1 },
    });
    const report = build([makeSession({ taskId: 'weekly', taskTitle: 'Weekly report' })], [task]);
    expect(report.groups[0].cadence).toBe('weekly');
    expect(report.groups[0].cadenceLabel).toBe('Repeats weekly');
  });

  it('calls daily work daily from its median gap', () => {
    const report = build([
      makeSession({ taskTitle: 'Standup', startedAt: at(12) }),
      makeSession({ taskTitle: 'Standup', startedAt: at(13) }),
      makeSession({ taskTitle: 'Standup', startedAt: at(14) }),
    ]);
    expect(report.groups[0].cadence).toBe('daily');
  });

  it('calls work seen about every week weekly', () => {
    const report = build([
      makeSession({ taskTitle: 'Plan the week', startedAt: at(1) }),
      makeSession({ taskTitle: 'Plan the week', startedAt: at(8) }),
      makeSession({ taskTitle: 'Plan the week', startedAt: at(15) }),
    ]);
    expect(report.groups[0].cadence).toBe('weekly');
  });

  it('calls work seen about every month monthly', () => {
    const report = build([
      makeSession({ taskTitle: 'Pay the bill', startedAt: at(1, 9, 0, 7) }),
      makeSession({ taskTitle: 'Pay the bill', startedAt: at(1, 9, 0, 8) }),
      makeSession({ taskTitle: 'Pay the bill', startedAt: at(1, 9, 0, 9) }),
    ]);
    expect(report.groups[0].cadence).toBe('monthly');
  });

  it('calls a long, uneven history occasional', () => {
    const report = build([
      makeSession({ taskTitle: 'Rare job', startedAt: at(1, 9, 0, 0) }),
      makeSession({ taskTitle: 'Rare job', startedAt: at(1, 9, 0, 5) }),
      makeSession({ taskTitle: 'Rare job', startedAt: at(1, 9, 0, 9) }),
    ]);
    expect(report.groups[0].cadence).toBe('occasional');
  });

  it('calls one task across several days a multi-day piece of work', () => {
    const report = build([
      makeSession({ taskId: 'one', taskTitle: 'Big migration', startedAt: at(1) }),
      makeSession({ taskId: 'one', taskTitle: 'Big migration', startedAt: at(9) }),
    ]);
    expect(report.groups[0].cadence).toBe('multi-day');
    expect(report.groups[0].instanceCount).toBe(1);
  });

  it('calls one task on one day a one-off', () => {
    const report = build([
      makeSession({ taskId: 'one', taskTitle: 'One thing', startedAt: at(1, 9) }),
      makeSession({ taskId: 'one', taskTitle: 'One thing', startedAt: at(1, 15) }),
    ]);
    expect(report.groups[0].cadence).toBe('one-off');
    expect(report.groups[0].spanDays).toBe(1);
    expect(report.groups[0].consistency).toBe(1);
  });
});

describe('time report: periods, totals and buckets', () => {
  const sessions = [
    makeSession({ taskId: 'a', taskTitle: 'Daily work', startedAt: at(2), durationActual: 600 }),
    makeSession({ taskId: 'a', taskTitle: 'Daily work', startedAt: at(9), durationActual: 1200 }),
    makeSession({ taskId: 'a', taskTitle: 'Daily work', startedAt: at(16), durationActual: 1800 }),
    // Previous month: it counts all time, never this month.
    makeSession({
      taskId: 'b',
      taskTitle: 'Old work',
      startedAt: at(2, 9, 0, 7),
      durationActual: 3600,
    }),
  ];

  const reportFor = (period: 'week' | 'month' | 'year' | 'all') =>
    buildTimeReport({ sessions, tasks: [], period, now: NOW });

  it('keeps the all-time total steady while the period moves', () => {
    const month = reportFor('month');
    const week = reportFor('week');

    expect(month.totals.allTimeSeconds).toBe(600 + 1200 + 1800 + 3600);
    expect(week.totals.allTimeSeconds).toBe(month.totals.allTimeSeconds);
    expect(month.totals.allTimeSessions).toBe(4);
    expect(week.totals.sessions).toBe(1); // 16 October is the only one in the last seven days
    expect(week.totals.seconds).toBe(1800);
  });

  it('counts the period totals, active days and tasks', () => {
    const month = reportFor('month');
    expect(month.totals.sessions).toBe(3);
    expect(month.totals.seconds).toBe(600 + 1200 + 1800);
    expect(month.totals.days).toBe(3);
    expect(month.totals.tasks).toBe(1);
    expect(month.totals.allTimeTasks).toBe(2);
  });

  it('keeps only today for the Today window', () => {
    const today = buildTimeReport({
      sessions: [
        makeSession({ taskTitle: 'Today work', startedAt: at(18) }),
        makeSession({ taskTitle: 'Yesterday work', startedAt: at(17) }),
      ],
      tasks: [],
      period: 'today',
      now: NOW,
    });

    expect(today.period.from).toBe('2026-10-18');
    expect(today.groups.map((group) => group.title)).toEqual(['Today work']);
    expect(today.totals.sessions).toBe(1);
    expect(today.groups[0].buckets).toHaveLength(6);
    // 09:00 falls in the 08:00–11:59 block.
    const morning = today.groups[0].buckets.find((bucket) => bucket.fromHour === 8);
    expect(morning?.seconds).toBe(1500);
  });

  it('filters a custom range, including a single chosen day', () => {
    const oneDay = buildTimeReport({
      sessions,
      tasks: [],
      period: 'custom',
      customFrom: '2026-10-09',
      customTo: '2026-10-09',
      now: NOW,
    });

    expect(oneDay.period.from).toBe('2026-10-09');
    expect(oneDay.period.to).toBe('2026-10-09');
    expect(oneDay.totals.sessions).toBe(1);
    expect(oneDay.totals.seconds).toBe(1200);
    expect(oneDay.groups).toHaveLength(1);
    expect(oneDay.groups[0].buckets).toHaveLength(6);
    expect(oneDay.groups[0].buckets.find((bucket) => bucket.fromHour === 8)?.seconds).toBe(1200);

    const span = buildTimeReport({
      sessions,
      tasks: [],
      period: 'custom',
      customFrom: '2026-10-02',
      customTo: '2026-10-16',
      now: NOW,
    });
    expect(span.totals.sessions).toBe(3);
    expect(span.totals.seconds).toBe(600 + 1200 + 1800);
  });

  it('builds one bucket per day for a week, including empty days', () => {
    const week = reportFor('week');
    const group = week.groups[0];
    expect(group.buckets).toHaveLength(7);
    expect(group.buckets.map((bucket) => bucket.axisLabel)).toEqual([
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
    ]);
    expect(group.buckets.reduce((sum, bucket) => sum + bucket.seconds, 0)).toBe(
      group.periodSeconds,
    );
    expect(group.buckets.find((bucket) => bucket.isCurrent)?.axisLabel).toBe('18');
    expect(group.buckets.some((bucket) => bucket.seconds === 0)).toBe(true);
  });

  it('builds week buckets for a month and month buckets for a year', () => {
    const month = reportFor('month');
    expect(month.groups[0].buckets).toHaveLength(3); // 1–7, 8–14, 15–18
    expect(month.groups[0].buckets[0].label).toBe('1–7 Oct');
    expect(month.groups[0].buckets.at(-1)?.isCurrent).toBe(true);

    const year = reportFor('year');
    expect(year.groups[0].buckets).toHaveLength(10); // January to October
    expect(year.groups[0].buckets[0].label).toBe('January 2026');
    expect(year.groups[0].buckets.at(-1)?.label).toBe('October 2026');
    expect(year.groups[0].buckets.reduce((sum, bucket) => sum + bucket.sessions, 0)).toBe(3);
  });

  it('uses all-time buckets that cover the whole history', () => {
    const all = reportFor('all');
    expect(all.period.from).toBe('2026-08-02');
    expect(all.period.grain).toBe('week');
    expect(
      all.groups.flatMap((group) => group.buckets).reduce((sum, bucket) => sum + bucket.seconds, 0),
    ).toBe(all.totals.seconds);
  });

  it('splits the period into repeating and one-off work', () => {
    const month = reportFor('month');
    expect(month.totals.repeatSeconds).toBe(month.totals.seconds);
    expect(month.totals.oneOffSeconds).toBe(0);

    const all = reportFor('all');
    expect(all.totals.repeatSeconds).toBe(600 + 1200 + 1800);
    expect(all.totals.oneOffSeconds).toBe(3600);
  });

  it('carries per-task all-time figures and the period subset together', () => {
    const month = reportFor('month');
    const group = month.groups[0];
    expect(group.totalSeconds).toBe(group.periodSeconds);
    expect(group.totalSessionCount).toBe(3);
    expect(group.averageSessionSeconds).toBe((600 + 1200 + 1800) / 3);
    expect(group.spanDays).toBe(15); // 2 October to 16 October inclusive
    expect(group.consistency).toBeCloseTo(3 / 15);
  });
});

describe('time report: readings', () => {
  it('has nothing to read with no sessions', () => {
    const report = buildTimeReport({ sessions: [], tasks: [], period: 'month', now: NOW });
    expect(report.hasAnySessions).toBe(false);
    expect(report.groups).toHaveLength(0);
    expect(report.insights).toHaveLength(0);
  });

  it('says when a period is empty but history exists', () => {
    const report = buildTimeReport({
      sessions: [
        makeSession({ taskTitle: 'Old', startedAt: at(2, 9, 0, 7), durationActual: 3600 }),
      ],
      tasks: [],
      period: 'month',
      now: NOW,
    });
    expect(report.groups).toHaveLength(0);
    expect(report.insights[0]).toMatch(/^No focus sessions in this month/);
    expect(report.insights[0]).toContain('1h');
  });

  it('names the work that took most of the period and its rhythm', () => {
    const report = buildTimeReport({
      sessions: [
        makeSession({ taskTitle: 'Code review', startedAt: at(12) }),
        makeSession({ taskTitle: 'Code review', startedAt: at(13) }),
        makeSession({ taskTitle: 'Code review', startedAt: at(14) }),
        makeSession({ taskTitle: 'One-off', startedAt: at(15), durationActual: 300 }),
      ],
      tasks: [],
      period: 'month',
      now: NOW,
    });

    expect(report.insights[0]).toContain('Most of this period went to Code review');
    expect(report.insights[0]).toContain('repeats daily');
    expect(report.insights[1]).toContain('% of this period went to work that repeats');
  });

  it('calls out one-off work when it dominates', () => {
    const report = buildTimeReport({
      sessions: [
        makeSession({ taskTitle: 'One-off', startedAt: at(12), durationActual: 6000 }),
        makeSession({ taskTitle: 'Small repeat', startedAt: at(13), durationActual: 600 }),
      ],
      tasks: [],
      period: 'month',
      now: NOW,
    });

    expect(report.insights.some((line) => line.startsWith('Work that does not repeat took'))).toBe(
      true,
    );
  });

  it('says when nothing in the period repeats', () => {
    const report = buildTimeReport({
      sessions: [makeSession({ taskTitle: 'One-off', startedAt: at(12), durationActual: 3000 })],
      tasks: [],
      period: 'month',
      now: NOW,
    });

    expect(
      report.insights.some((line) => line.startsWith('Work that does not repeat took all')),
    ).toBe(true);
  });

  it('adds a consistency reading for steady work', () => {
    const report = buildTimeReport({
      sessions: [
        makeSession({ taskTitle: 'Daily', startedAt: at(12), durationActual: 600 }),
        makeSession({ taskTitle: 'Daily', startedAt: at(13), durationActual: 600 }),
        makeSession({ taskTitle: 'Daily', startedAt: at(14), durationActual: 600 }),
        makeSession({ taskTitle: 'Daily', startedAt: at(15), durationActual: 600 }),
      ],
      tasks: [],
      period: 'month',
      now: NOW,
    });

    expect(report.insights.some((line) => line.includes('100% consistency'))).toBe(true);
  });

  it('adds a block-length reading when the period has room for it', () => {
    const report = buildTimeReport({
      sessions: [
        makeSession({
          taskTitle: 'One long block',
          startedAt: at(12),
          durationActual: 50 * 60,
        }),
      ],
      tasks: [],
      period: 'month',
      now: NOW,
    });

    expect(
      report.insights.some((line) => line.includes('average focus block was 50 minutes')),
    ).toBe(true);
  });
});
