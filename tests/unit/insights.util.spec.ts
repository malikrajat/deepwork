import { describe, it, expect } from 'vitest';
import {
  addDays,
  buildAnalytics,
  buildHabitStats,
  buildJournalStats,
  currentStreak,
  dayOfIso,
  focusStreak,
  journalFocusCorrelation,
  localDay,
  longestStreak,
  weekStart,
  type HabitEntryLike,
  type HabitLike,
  type JournalLike,
  type SessionLike,
  type TaskLike,
} from '../../src/app/core/utils/insights.util';

/**
 * The insights engine is what the Analytics, Habits and Journal pages show, and
 * every number on those pages comes from here. It is pure, so it can be pinned
 * down exactly: a fixed `now`, fixed records, and the arithmetic checked.
 *
 * The assertions that matter most are the ones a user would notice being wrong:
 * streaks that should not break on a day still in progress, a heatmap that means
 * the same thing in every week, and plain-language takeaways that are only made
 * when the data really shows them.
 */

/** A fixed local "now": Monday 21 September 2026, 10:00 (matches the app's day keys). */
const NOW = new Date(2026, 8, 21, 10, 0, 0);
const TODAY = localDay(NOW);

/** `day(-3)` is three days before the fixed today. */
function day(offset: number): string {
  return addDays(TODAY, offset);
}

/** An ISO timestamp on a day in the window, at a given local hour. */
function at(offset: number, hour = 9, minutes = 0): string {
  const stamp = new Date(`${day(offset)}T00:00:00`);
  stamp.setHours(hour, minutes, 0, 0);
  return stamp.toISOString();
}

function workSession(offset: number, minutes = 25, hour = 9, interrupted = false): SessionLike {
  return {
    type: 'work',
    durationActual: minutes * 60,
    startedAt: at(offset, hour),
    interrupted,
  };
}

function task(overrides: Partial<TaskLike> = {}): TaskLike {
  return {
    id: overrides.id ?? 'task-1',
    status: 'todo',
    quadrant: 'urgent-important',
    priority: 2,
    deadline: null,
    createdAt: at(-2),
    completedAt: null,
    ...overrides,
  };
}

describe('insights: date helpers', () => {
  it('uses local days, so an evening session belongs to the evening', () => {
    const evening = new Date(2026, 8, 21, 23, 30);

    expect(localDay(evening)).toBe('2026-09-21');
    // A UTC day would have moved this into the 22nd in most timezones.
    expect(dayOfIso(evening.toISOString())).toBe('2026-09-21');
  });

  it('reports nothing rather than a wrong day for an unparseable timestamp', () => {
    expect(dayOfIso('not a date')).toBe('');
    expect(dayOfIso('')).toBe('');
  });

  it('walks days forwards and backwards across a month boundary', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-09-21', 0)).toBe('2026-09-21');
  });

  it('starts weeks on Monday, and never after the day itself', () => {
    const start = weekStart(TODAY);

    expect(new Date(`${start}T00:00:00`).getDay()).toBe(1);
    expect(start <= TODAY).toBe(true);
    expect(addDays(start, 6) >= TODAY).toBe(true);

    // Every day of a week maps to the same Monday.
    for (let offset = 0; offset < 7; offset++) {
      expect(weekStart(addDays(start, offset))).toBe(start);
    }
  });
});

describe('insights: streaks', () => {
  const streakMap = (days: string[]) => new Map(days.map((key) => [key, 60]));

  it('counts today when today has focus time', () => {
    expect(focusStreak(streakMap([day(0), day(-1), day(-2)]), TODAY)).toBe(3);
  });

  it('keeps yesterday’s streak alive while today is still empty', () => {
    expect(focusStreak(streakMap([day(-1), day(-2)]), TODAY)).toBe(2);
  });

  it('reports no streak when neither today nor yesterday was focused', () => {
    expect(focusStreak(streakMap([day(-2), day(-3)]), TODAY)).toBe(0);
    expect(focusStreak(new Map(), TODAY)).toBe(0);
  });

  it('finds the longest run of days', () => {
    expect(longestStreak([true, true, false, true, true, true])).toBe(3);
    expect(longestStreak([false, false])).toBe(0);
    expect(longestStreak([])).toBe(0);
  });

  it('does not break a current streak on a day that is still in progress', () => {
    // Today is not done yet, so the streak is the three days before it.
    expect(currentStreak([true, true, true, false], 3)).toBe(3);
    expect(currentStreak([true, true, true, true], 3)).toBe(4);
    expect(currentStreak([false, false], 1)).toBe(0);
    expect(currentStreak([], 0)).toBe(0);
  });
});

describe('insights: habits', () => {
  const habit: HabitLike = { id: 'h1', name: 'Read', icon: '📚', createdAt: at(-40) };

  function entry(offset: number, habitId = 'h1'): HabitEntryLike {
    return { habitId, completedAt: at(offset, 20) };
  }

  it('measures completion over the window, oldest day first', () => {
    const [stat] = buildHabitStats([habit], [entry(0), entry(-1), entry(-2)], NOW, 30);

    expect(stat.name).toBe('Read');
    expect(stat.days).toHaveLength(30);
    expect(stat.days.slice(-3)).toEqual([true, true, true]);
    expect(stat.days[0]).toBe(false);
    expect(stat.completionPercent).toBe(10);
    expect(stat.totalCompletions).toBe(3);
  });

  it('counts streaks over every recorded day, not just the 30-day window', () => {
    const entries = [entry(-40), entry(-39), entry(-38), entry(0), entry(-1)];

    const [stat] = buildHabitStats([habit], entries, NOW, 30);

    // Five completed days, the longest run being the three old ones.
    expect(stat.bestStreak).toBe(3);
    expect(stat.currentStreak).toBe(2);
    expect(stat.totalCompletions).toBe(5);
  });

  it('records one completion per day, however many entries arrive', () => {
    const [stat] = buildHabitStats([habit], [entry(0), entry(0), entry(0)], NOW, 30);

    expect(stat.totalCompletions).toBe(1);
    expect(stat.completionPercent).toBe(3);
  });

  it('ignores entries with an unreadable date, and sorts habits by completion', () => {
    const other: HabitLike = { id: 'h2', name: 'Stretch', icon: '🧘', createdAt: at(-5) };
    const broken: HabitEntryLike = { habitId: 'h1', completedAt: 'whenever' };

    const stats = buildHabitStats(
      [habit, other],
      [broken, entry(0), entry(-1), entry(0, 'h2')],
      NOW,
      30,
    );

    expect(stats.map((stat) => stat.id)).toEqual(['h1', 'h2']);
    expect(stats[0].completionPercent).toBe(7);
    expect(stats[1].completionPercent).toBe(3);
  });

  it('reports a habit that has never been ticked as zero, not as missing', () => {
    const [stat] = buildHabitStats([habit], [], NOW, 30);

    expect(stat.completionPercent).toBe(0);
    expect(stat.currentStreak).toBe(0);
    expect(stat.bestStreak).toBe(0);
    expect(stat.days.every((done) => done === false)).toBe(true);
  });
});

describe('insights: journal', () => {
  const journal = (entries: [number, string][]): JournalLike[] =>
    entries.map(([offset, content]) => ({ date: day(offset), content }));

  it('counts days and words, ignoring entries that say nothing', () => {
    const stats = buildJournalStats(
      journal([
        [0, 'four words right here'],
        [-1, '   '],
        [-2, 'two words'],
      ]),
      NOW,
      12,
    );

    expect(stats.entries).toBe(2);
    expect(stats.words).toBe(6);
    expect(stats.averageWords).toBe(3);
  });

  it('reports the streak and the 30-day consistency', () => {
    const stats = buildJournalStats(
      journal([
        [0, 'today'],
        [-1, 'yes'],
        [-2, 'and'],
      ]),
      NOW,
      12,
    );

    expect(stats.currentStreak).toBe(3);
    expect(stats.longestStreak).toBe(3);
    expect(stats.consistencyPercent).toBe(10);
  });

  it('slices the last twelve weeks, newest last, with words per week', () => {
    const stats = buildJournalStats(journal([[0, 'one two three']]), NOW, 12);

    expect(stats.weeks).toHaveLength(12);
    expect(stats.weeks.at(-1)).toMatchObject({ entries: 1, words: 3 });
    expect(stats.weeks[0]).toMatchObject({ entries: 0, words: 0 });
  });

  it('names the weekday with the longest entries on average', () => {
    // Two long Mondays against one short Tuesday.
    const monday = weekStart(TODAY);
    const stats = buildJournalStats(
      [
        { date: monday, content: 'one two three four five six' },
        { date: addDays(monday, -7), content: 'one two three four five six' },
        { date: addDays(monday, 1), content: 'short' },
      ],
      NOW,
      12,
    );

    const mondayName = new Date(`${monday}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'long',
    });
    expect(stats.bestWeekday).toEqual({ label: mondayName, averageWords: 6 });
  });

  it('says nothing was written when nothing was written', () => {
    const stats = buildJournalStats([], NOW, 12);

    expect(stats.entries).toBe(0);
    expect(stats.words).toBe(0);
    expect(stats.averageWords).toBe(0);
    expect(stats.currentStreak).toBe(0);
    expect(stats.bestWeekday).toBeNull();
  });
});

describe('insights: the analytics report', () => {
  const habits: HabitLike[] = [{ id: 'h1', name: 'Read', icon: '📚', createdAt: at(-30) }];
  const habitEntries: HabitEntryLike[] = [
    { habitId: 'h1', completedAt: at(0, 21) },
    { habitId: 'h1', completedAt: at(-1, 21) },
  ];

  it('adds a day of focus up from its sessions, work only', () => {
    const report = buildAnalytics({
      sessions: [
        workSession(0, 25, 9),
        workSession(0, 25, 10),
        { type: 'short-break', durationActual: 300, startedAt: at(0, 11) },
      ],
      tasks: [],
      habits: [],
      habitEntries: [],
      journal: [],
      now: NOW,
    });

    expect(report.totals.focusMinutes).toBe(50);
    expect(report.totals.sessions).toBe(2);
    expect(report.totals.averageSessionMinutes).toBe(25);
    expect(report.totals.activeDays).toBe(1);
  });

  it('highlights the peak two-hour window and only claims it when it is real', () => {
    const report = buildAnalytics({
      sessions: [workSession(-1, 50, 9), workSession(-1, 50, 10), workSession(-2, 25, 15)],
      tasks: [],
      habits: [],
      habitEntries: [],
      journal: [],
      now: NOW,
    });

    expect(report.peakWindow).toMatchObject({ fromHour: 9, toHour: 11 });
    const highlighted = report.focusByHour.filter((bar) => bar.highlight).map((bar) => bar.label);
    expect(highlighted).toEqual(['09', '10']);

    const quiet = buildAnalytics({
      sessions: [],
      tasks: [],
      habits: [],
      habitEntries: [],
      journal: [],
      now: NOW,
    });
    expect(quiet.peakWindow).toBeNull();
    expect(quiet.focusByHour).toHaveLength(24);
  });

  it('lays out twelve weeks of heatmap, with absolute levels', () => {
    const report = buildAnalytics({
      sessions: [
        workSession(0, 10, 9), // 10m → level 1
        workSession(-1, 30, 9), // 30m → level 2
        workSession(-2, 60, 9), // 60m → level 3
        workSession(-3, 120, 9), // 120m → level 4
      ],
      tasks: [],
      habits: [],
      habitEntries: [],
      journal: [],
      now: NOW,
    });

    expect(report.heatmap).toHaveLength(84);
    expect(report.heatmapWeeks).toHaveLength(12);

    const levelOf = (offset: number) =>
      report.heatmap.find((cell) => cell.date === day(offset))?.level;

    expect(levelOf(0)).toBe(1);
    expect(levelOf(-1)).toBe(2);
    expect(levelOf(-2)).toBe(3);
    expect(levelOf(-3)).toBe(4);
    expect(levelOf(-20)).toBe(0);
    expect(report.heatmap.find((cell) => cell.date === day(0))?.label).toContain('focused');
  });

  it('averages focus per weekday over the days that have passed', () => {
    const report = buildAnalytics({
      sessions: [workSession(0, 60, 9), workSession(-7, 30, 9)],
      tasks: [],
      habits: [],
      habitEntries: [],
      journal: [],
      now: NOW,
    });

    expect(report.focusByWeekday).toHaveLength(7);
    const todayBar = report.focusByWeekday[NOW.getDay()];
    expect(todayBar.highlight).toBe(true);
    expect(todayBar.display).not.toBe('0m');
    expect(report.focusByWeekday.filter((bar) => bar.highlight)).toHaveLength(1);
  });

  it('counts task flow per week for eight weeks', () => {
    const report = buildAnalytics({
      sessions: [],
      tasks: [
        // Both inside the current week: the newest bucket is the one in progress.
        task({ id: 'a', status: 'done', completedAt: at(0), createdAt: at(0) }),
        task({ id: 'b', status: 'todo', createdAt: at(0) }),
      ],
      habits: [],
      habitEntries: [],
      journal: [],
      now: NOW,
    });

    expect(report.taskFlow).toHaveLength(8);
    expect(report.taskFlow.at(-1)).toMatchObject({ created: 2, completed: 1 });
    expect(report.totals.createdTasks).toBe(2);
    expect(report.totals.completedTasks).toBe(1);
    expect(report.totals.openTasks).toBe(1);
  });

  it('adds focus minutes to the task they were linked to, per quadrant', () => {
    const report = buildAnalytics({
      sessions: [
        { ...workSession(0, 50, 9), taskId: 'q1' } as SessionLike,
        { ...workSession(-1, 25, 9), taskId: 'q2' } as SessionLike,
      ],
      tasks: [
        task({ id: 'q1', quadrant: 'urgent-important', status: 'done' }),
        task({ id: 'q2', quadrant: 'important', status: 'todo' }),
        task({ id: 'q3', quadrant: null, status: 'todo' }),
      ],
      habits: [],
      habitEntries: [],
      journal: [],
      now: NOW,
    });

    const [q1, q2] = report.quadrants;
    expect(q1).toMatchObject({
      key: 'urgent-important',
      total: 1,
      done: 1,
      completionPercent: 100,
      focusMinutes: 50,
    });
    expect(q2).toMatchObject({
      key: 'important',
      total: 1,
      done: 0,
      completionPercent: 0,
      focusMinutes: 25,
    });
    expect(report.quadrants.every((quadrant) => quadrant.color.startsWith('#'))).toBe(true);
  });

  it('counts overdue work and interrupted sessions', () => {
    const report = buildAnalytics({
      sessions: [workSession(0, 25, 9, true), workSession(-1, 25, 9)],
      tasks: [
        task({ id: 'late', deadline: day(-1) }),
        task({ id: 'doneLate', status: 'done', deadline: day(-5) }),
        task({ id: 'future', deadline: day(3) }),
      ],
      habits: [],
      habitEntries: [],
      journal: [],
      now: NOW,
    });

    expect(report.totals.overdueTasks).toBe(1);
    expect(report.totals.abandonedPercent).toBe(50);
  });

  it('summarises the last seven days against the seven before them', () => {
    const report = buildAnalytics({
      sessions: [workSession(-1, 60, 9), workSession(-8, 30, 9)],
      tasks: [task({ status: 'done', completedAt: at(-2), createdAt: at(-9) })],
      habits,
      habitEntries,
      journal: [],
      now: NOW,
    });

    const focus = report.kpis.find((kpi) => kpi.key === 'focus7')!;
    expect(focus.value).toBe('1h');
    expect(focus.deltaPercent).toBe(100);
    expect(focus.trend).toHaveLength(14);
    expect(report.totals.focusMinutesPrevious).toBe(30);

    const closed = report.kpis.find((kpi) => kpi.key === 'completed7')!;
    expect(closed.value).toBe('1');
    expect(closed.hint).toContain('1 closed in total');
  });

  it('never invents a percentage change when there is nothing to compare against', () => {
    const report = buildAnalytics({
      sessions: [workSession(0, 25, 9)],
      tasks: [task({ id: 'fresh' })],
      habits: [],
      habitEntries: [],
      journal: [],
      now: NOW,
    });

    expect(report.kpis.every((kpi) => kpi.deltaPercent === null)).toBe(true);
    expect(report.kpis.find((kpi) => kpi.key === 'habits')?.value).toBe('—');
    expect(report.kpis.find((kpi) => kpi.key === 'journal')?.value).toBe('0');
  });

  it('rates completion on the tasks created in the window, falling back to all tasks', () => {
    const inWindow = buildAnalytics({
      sessions: [],
      tasks: [
        task({ id: 'a', status: 'done', createdAt: at(-1), completedAt: at(0) }),
        task({ id: 'b', createdAt: at(-2) }),
      ],
      habits: [],
      habitEntries: [],
      journal: [],
      now: NOW,
    });
    expect(inWindow.kpis.find((kpi) => kpi.key === 'completion')?.value).toBe('50%');

    // Nothing was created in the last 30 days, so every task counts.
    const older = buildAnalytics({
      sessions: [],
      tasks: [
        task({ id: 'a', status: 'done', createdAt: at(-60), completedAt: at(-59) }),
        task({ id: 'b', createdAt: at(-61) }),
      ],
      habits: [],
      habitEntries: [],
      journal: [],
      now: NOW,
    });
    expect(older.kpis.find((kpi) => kpi.key === 'completion')?.value).toBe('50%');

    const empty = buildAnalytics({
      sessions: [],
      tasks: [],
      habits: [],
      habitEntries: [],
      journal: [],
      now: NOW,
    });
    expect(empty.kpis.find((kpi) => kpi.key === 'completion')?.value).toBe('0%');
  });

  it('names the best day and keeps totals in whole minutes', () => {
    const report = buildAnalytics({
      sessions: [workSession(-2, 90, 9), workSession(0, 20, 9)],
      tasks: [],
      habits,
      habitEntries,
      journal: [],
      now: NOW,
    });

    expect(report.totals.bestDayMinutes).toBe(90);
    expect(report.totals.bestDayLabel).not.toBe('—');
    expect(Number.isInteger(report.totals.focusMinutes)).toBe(true);
    expect(report.totals.focusStreak).toBe(1);
  });

  it('survives a completely empty database', () => {
    const report = buildAnalytics({
      sessions: [],
      tasks: [],
      habits: [],
      habitEntries: [],
      journal: [],
    });

    expect(report.kpis).toHaveLength(6);
    expect(report.insights).toEqual([]);
    expect(report.peakWindow).toBeNull();
    expect(report.totals).toMatchObject({
      focusMinutes: 0,
      sessions: 0,
      openTasks: 0,
      overdueTasks: 0,
      activeDays: 0,
      focusStreak: 0,
      averageSessionMinutes: 0,
      abandonedPercent: 0,
      bestDayLabel: '—',
    });
    expect(report.habits).toEqual([]);
    expect(report.journal.entries).toBe(0);
  });
});

describe('insights: the plain-language takeaways', () => {
  it('states each takeaway only when the numbers support it', () => {
    const report = buildAnalytics({
      sessions: [
        workSession(-1, 50, 9),
        workSession(-1, 50, 10),
        workSession(-8, 20, 15),
        workSession(-9, 20, 15, true),
      ],
      tasks: [
        task({ id: 'done', status: 'done', completedAt: at(-1), createdAt: at(-2) }),
        task({ id: 'late', deadline: day(-1), createdAt: at(-2) }),
        task({ id: 'backlog1', quadrant: 'neither', createdAt: at(-40) }),
        task({ id: 'backlog2', quadrant: 'neither', createdAt: at(-41) }),
      ],
      habits: [
        { id: 'h1', name: 'Read', icon: '📚', createdAt: at(-30) },
        { id: 'h2', name: 'Stretch', icon: '🧘', createdAt: at(-30) },
      ],
      habitEntries: [
        { habitId: 'h1', completedAt: at(-1, 21) },
        { habitId: 'h1', completedAt: at(-2, 21) },
        { habitId: 'h2', completedAt: at(-8, 21) },
        { habitId: 'h2', completedAt: at(-9, 21) },
      ],
      journal: [
        { date: day(-1), content: 'reviewed the week' },
        { date: day(-2), content: 'planned the day' },
        { date: day(-8), content: 'notes' },
      ],
      now: NOW,
    });

    const text = report.insights.join('\n');
    expect(report.insights.length).toBeGreaterThan(0);
    expect(text).toContain('sharpest window');
    expect(text).toMatch(/Focus time is (up|down|flat)/);
    expect(text).toMatch(/strongest day/);
    expect(text).toContain('tasks you created this week');
    expect(text).toContain('past the deadline');
    expect(text).toContain('Best habit: Read');
    expect(text).toMatch(/You journalled \d day/);
  });

  it('compares focus on journalled and non-journalled days', () => {
    const byDay = new Map([
      [day(0), 50],
      [day(-1), 40],
      [day(-2), 100],
      [day(-3), 10],
    ]);
    const journalled = [day(0), day(-1)];

    expect(journalFocusCorrelation(byDay, journalled)).toEqual({
      journalledAverage: 45,
      otherAverage: 55,
      journalledDays: 2,
      otherDays: 2,
    });

    expect(journalFocusCorrelation(new Map(), [])).toEqual({
      journalledAverage: 0,
      otherAverage: 0,
      journalledDays: 0,
      otherDays: 0,
    });
  });

  it('stays quiet when a habit is going well and nothing is overdue', () => {
    const report = buildAnalytics({
      sessions: [workSession(0, 25, 9)],
      tasks: [task({ id: 'fresh', createdAt: at(0) })],
      habits: [{ id: 'h1', name: 'Read', icon: '📚', createdAt: at(-30) }],
      habitEntries: [{ habitId: 'h1', completedAt: at(0, 21) }],
      journal: [],
      now: NOW,
    });

    const text = report.insights.join('\n');
    expect(text).not.toContain('past the deadline');
    expect(text).not.toContain('is slipping');
    expect(text).not.toContain('interrupted');
    expect(text).toContain('Best habit: Read');
  });
});
