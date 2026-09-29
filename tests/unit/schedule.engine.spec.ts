import { describe, it, expect } from 'vitest';
import { buildDaySchedule, type PomodoroConfig } from '../../src/app/core/services/schedule.engine';
import type {
  FocusBlock,
  ScheduleEntry,
  ScheduleItem,
  SchedulePrefs,
} from '../../src/app/core/models/schedule.model';
import type { Task, TaskQuadrant } from '../../src/app/core/models/task.model';

/**
 * The day planner. The Eisenhower matrix decides *what* runs; this decides
 * *when*, and it is the only place that reserves rest — so the rules worth
 * defending are the ones a user would notice: a task placed by hand stays where
 * it was put, a break is never filled with work, and a task that does not fit
 * is reported instead of silently dropped.
 */

const CONFIG: PomodoroConfig = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  pomodorosBeforeLongBreak: 2,
};

/** 09:00 → 12:00. */
const PREFS: SchedulePrefs = { dayStart: 9 * 60, dayEnd: 12 * 60 };

function taskOf(id: string, quadrant: TaskQuadrant | null): Task {
  return {
    id,
    title: id,
    description: '',
    priority: 2,
    status: 'todo',
    quadrant,
    deadline: null,
    tags: [],
    recurrence: null,
    todayOrder: null,
    createdAt: '2026-09-21T00:00:00.000Z',
    completedAt: null,
    updatedAt: null,
  };
}

function item(
  id: string,
  index: number,
  entry: Partial<ScheduleEntry> = {},
  quadrant: TaskQuadrant | null = 'urgent-important',
): ScheduleItem {
  return {
    task: taskOf(id, quadrant),
    quadrant,
    entry: { taskId: id, order: index + 1, slotStart: null, pomodoros: null, ...entry },
    index,
  };
}

const focusBlocks = (items: ScheduleItem[], config = CONFIG, prefs = PREFS) =>
  buildDaySchedule(items, prefs, config).blocks.filter(
    (block): block is FocusBlock => block.kind === 'focus',
  );

describe('schedule engine: the automatic flow', () => {
  it('fills the day from the start, one pomodoro at a time', () => {
    const schedule = buildDaySchedule([item('a', 0)], PREFS, CONFIG);

    expect(schedule.blocks).toHaveLength(1);
    expect(schedule.blocks[0]).toMatchObject({
      kind: 'focus',
      startMin: 540,
      endMin: 565,
      index: 1,
    });
    expect(schedule.placements).toEqual([
      {
        taskId: 'a',
        startMin: 540,
        endMin: 565,
        blockIds: ['auto-a-0'],
        pomodoros: 1,
        pinned: false,
        quadrant: 'urgent-important',
      },
    ]);
    expect(schedule.totals).toEqual({
      focusMinutes: 25,
      breakMinutes: 0,
      pomodoros: 1,
      breaks: 0,
      tasks: 1,
    });
  });

  it('reserves a break between two pomodoros of the same task, and marks the second as a continuation', () => {
    const schedule = buildDaySchedule([item('a', 0, { pomodoros: 2 })], PREFS, CONFIG);

    expect(schedule.blocks.map((block) => block.kind)).toEqual(['focus', 'short-break', 'focus']);
    expect(schedule.blocks[0]).toMatchObject({ startMin: 540, endMin: 565 });
    expect(schedule.blocks[1]).toMatchObject({ startMin: 565, endMin: 570, afterId: 'auto-a-0' });
    expect(schedule.blocks[2]).toMatchObject({ startMin: 570, endMin: 595, continued: true });
    expect(schedule.totals).toMatchObject({ focusMinutes: 50, breakMinutes: 5, breaks: 1 });
  });

  it('takes a break between two different tasks as well', () => {
    const schedule = buildDaySchedule([item('a', 0), item('b', 1)], PREFS, CONFIG);

    expect(schedule.blocks.map((block) => block.kind)).toEqual(['focus', 'short-break', 'focus']);
    expect(schedule.placements.map((placement) => placement.startMin)).toEqual([540, 570]);
    expect(schedule.totals.tasks).toBe(2);
  });

  it('makes the break after every second focus block the long one', () => {
    const schedule = buildDaySchedule([item('a', 0), item('b', 1), item('c', 2)], PREFS, CONFIG);

    expect(schedule.blocks.map((block) => block.kind)).toEqual([
      'focus',
      'short-break',
      'focus',
      'long-break',
      'focus',
    ]);
    expect(schedule.totals.breaks).toBe(2);
  });

  it('never leaves a rest slot at the end of the day', () => {
    const schedule = buildDaySchedule([item('a', 0, { pomodoros: 2 })], PREFS, CONFIG);

    expect(schedule.blocks.at(-1)?.kind).toBe('focus');
  });

  it('clamps a task to at least one pomodoro and at most eight', () => {
    // A long enough day for the eight-block ceiling to be reached at all.
    const longDay: SchedulePrefs = { dayStart: 8 * 60, dayEnd: 14 * 60 };

    expect(focusBlocks([item('a', 0, { pomodoros: 0 })])).toHaveLength(1);
    expect(
      focusBlocks(
        [item('a', 0, { pomodoros: 99 })],
        { ...CONFIG, pomodorosBeforeLongBreak: 8 },
        longDay,
      ),
    ).toHaveLength(8);
  });

  it('treats an empty or fractional configuration as real work', () => {
    const schedule = buildDaySchedule([item('a', 0)], PREFS, {
      focusMinutes: 0,
      shortBreakMinutes: 0.4,
      longBreakMinutes: 0,
      pomodorosBeforeLongBreak: 0,
    });

    expect(schedule.totals.focusMinutes).toBe(1);
  });
});

describe('schedule engine: tasks placed by hand', () => {
  it('keeps a pinned task at the minute it was put, and flows the rest around it', () => {
    const schedule = buildDaySchedule(
      [item('pinned', 0, { slotStart: 600 }), item('auto', 1)],
      PREFS,
      CONFIG,
    );

    const [firstPlacement, secondPlacement] = schedule.placements;
    expect(firstPlacement).toMatchObject({
      taskId: 'pinned',
      startMin: 600,
      endMin: 625,
      pinned: true,
    });
    expect(secondPlacement).toMatchObject({
      taskId: 'auto',
      startMin: 540,
      endMin: 565,
      pinned: false,
    });
    // The timeline is chronological, so the automatic block comes first.
    expect(schedule.blocks[0]).toMatchObject({ startMin: 540 });
    expect(schedule.blocks.at(-1)).toMatchObject({ startMin: 600, pinned: true });
  });

  it('lays the automatic flow after a pinned block it cannot fit before', () => {
    const schedule = buildDaySchedule(
      [item('pinned', 0, { slotStart: 540, pomodoros: 2 }), item('auto', 1)],
      PREFS,
      CONFIG,
    );

    // Pinned: 09:00–09:25, break, 09:30–09:55. The automatic task starts after that.
    expect(schedule.placements[1]).toMatchObject({ taskId: 'auto', startMin: 595, endMin: 620 });
  });

  it('merges two tasks placed at the same minute into one slot', () => {
    const schedule = buildDaySchedule(
      [item('a', 0, { slotStart: 600 }), item('b', 1, { slotStart: 600 })],
      PREFS,
      CONFIG,
    );

    const focus = focusBlocks([item('a', 0, { slotStart: 600 }), item('b', 1, { slotStart: 600 })]);
    expect(focus).toHaveLength(1);
    // The first in the queue owns the slot; the other was added to it.
    expect(focus[0].taskIds).toEqual(['a', 'b']);
    expect(focus[0].pinned).toBe(true);
    expect(schedule.placements).toHaveLength(2);
    expect(schedule.placements[0].blockIds).toEqual(schedule.placements[1].blockIds);
  });

  it('snaps a pinned time onto the grid and keeps it inside the day', () => {
    const schedule = buildDaySchedule([item('late', 0, { slotStart: 5000 })], PREFS, CONFIG);

    expect(schedule.placements[0].startMin).toBe(1435);
    expect(schedule.viewEndMin).toBeGreaterThanOrEqual(1440);
  });
});

describe('schedule engine: what does not fit', () => {
  it('reports a task that overflows the day instead of dropping it quietly', () => {
    const tight: SchedulePrefs = { dayStart: 9 * 60, dayEnd: 10 * 60 };
    const schedule = buildDaySchedule([item('huge', 0, { pomodoros: 8 })], tight, CONFIG);

    expect(schedule.unscheduled).toEqual([{ taskId: 'huge', reason: 'overflow' }]);
    expect(schedule.placements).toEqual([]);
    expect(schedule.blocks).toEqual([]);
    expect(schedule.totals).toMatchObject({ focusMinutes: 0, pomodoros: 0, tasks: 0 });
  });

  it('stops the automatic flow at the last task that fits', () => {
    // 09:00–10:00 (the shortest window the engine allows): the first task's two
    // pomodoros fill it, and the second task has nowhere left to go.
    const tight: SchedulePrefs = { dayStart: 9 * 60, dayEnd: 10 * 60 };
    const schedule = buildDaySchedule(
      [item('first', 0, { pomodoros: 2 }), item('second', 1)],
      tight,
      CONFIG,
    );

    expect(schedule.placements.map((placement) => placement.taskId)).toEqual(['first']);
    expect(schedule.unscheduled).toEqual([{ taskId: 'second', reason: 'overflow' }]);
  });

  it('keeps a day window at least an hour long', () => {
    const schedule = buildDaySchedule([], { dayStart: 9 * 60, dayEnd: 500 }, CONFIG);

    expect(schedule.viewStartMin).toBe(540);
    expect(schedule.viewEndMin).toBe(600);
  });

  it('has an empty timeline for an empty day', () => {
    const schedule = buildDaySchedule([], PREFS, CONFIG);

    expect(schedule.blocks).toEqual([]);
    expect(schedule.placements).toEqual([]);
    expect(schedule.unscheduled).toEqual([]);
    expect(schedule.totals).toEqual({
      focusMinutes: 0,
      breakMinutes: 0,
      pomodoros: 0,
      breaks: 0,
      tasks: 0,
    });
    expect(schedule.viewStartMin).toBe(540);
    expect(schedule.viewEndMin).toBe(720);
  });
});
