import { describe, it, expect } from 'vitest';
import {
  groupAddDate,
  groupTasksByDate,
  sectionKeyFor,
  taskDay,
} from '../../src/app/pages/tasks/task-date-groups.view';
import { Task } from '../../src/app/core/models/task.model';

/** A creation stamp on the given local day, so the tests read the same everywhere. */
const localStamp = (year: number, month: number, day: number, hour = 9): string =>
  new Date(year, month - 1, day, hour).toISOString();

const task = (title: string, over: Partial<Task> = {}): Task => ({
  id: title,
  title,
  description: '',
  priority: 3,
  status: 'todo',
  quadrant: null,
  deadline: null,
  tags: [],
  recurrence: null,
  todayOrder: null,
  createdAt: localStamp(2026, 9, 18),
  completedAt: null,
  updatedAt: localStamp(2026, 9, 18),
  ...over,
});

/** Friday 18 September 2026 — a week with days on both sides of "today". */
const TODAY = new Date(2026, 8, 18, 12);

const labelsFor = (tasks: Task[]) => groupTasksByDate(tasks, TODAY).map((group) => group.label);

describe('task date sections', () => {
  it('files a task by its deadline, not by when it was written', () => {
    const due = task('Pay the invoice', {
      deadline: '2026-09-14',
      createdAt: localStamp(2026, 9, 18),
    });

    expect(labelsFor([due])).toEqual(['Earlier this week']);
  });

  it('files a task with no deadline under the day it was written', () => {
    const written = task('Read the proposal', { createdAt: localStamp(2026, 9, 17) });

    expect(labelsFor([written])).toEqual(['Yesterday']);
  });

  it('names the days around today', () => {
    expect(labelsFor([task('a', { deadline: '2026-09-18' })])).toEqual(['Today']);
    expect(labelsFor([task('b', { deadline: '2026-09-19' })])).toEqual(['Tomorrow']);
    expect(labelsFor([task('c', { deadline: '2026-09-17' })])).toEqual(['Yesterday']);
  });

  it('folds the rest of the week, the next week and the rest of the month', () => {
    expect(labelsFor([task('a', { deadline: '2026-09-20' })])).toEqual(['Next week']);
    expect(labelsFor([task('b', { deadline: '2026-09-30' })])).toEqual(['Later this month']);
    expect(labelsFor([task('c', { deadline: '2026-09-13' })])).toEqual(['Earlier this week']);
    expect(labelsFor([task('d', { deadline: '2026-09-12' })])).toEqual(['Last week']);
    expect(labelsFor([task('e', { deadline: '2026-09-02' })])).toEqual(['Earlier this month']);
  });

  it('names older and future months, with the year once it differs', () => {
    expect(labelsFor([task('a', { deadline: '2026-08-05' })])).toEqual(['August']);
    expect(labelsFor([task('b', { deadline: '2026-10-02' })])).toEqual(['October']);
    expect(labelsFor([task('c', { deadline: '2025-12-31' })])).toEqual(['December 2025']);
  });

  it('orders sections today first, then ahead, then back through time', () => {
    const groups = groupTasksByDate(
      [
        task('old', { deadline: '2025-12-31' }),
        task('last month', { deadline: '2026-08-05' }),
        task('last week', { deadline: '2026-09-12' }),
        task('yesterday', { deadline: '2026-09-17' }),
        task('today', { deadline: '2026-09-18' }),
        task('tomorrow', { deadline: '2026-09-19' }),
        task('next week', { deadline: '2026-09-20' }),
        task('later this month', { deadline: '2026-09-30' }),
        task('next month', { deadline: '2026-10-02' }),
      ],
      TODAY,
    );

    expect(groups.map((group) => group.label)).toEqual([
      'Today',
      'Tomorrow',
      'Next week',
      'Later this month',
      'October',
      'Yesterday',
      'Last week',
      'August',
      'December 2025',
    ]);
  });

  it('keeps the page order inside a section and counts the finished ones', () => {
    const groups = groupTasksByDate(
      [
        task('first', { deadline: '2026-09-18' }),
        task('second', { deadline: '2026-09-18', status: 'done' }),
        task('third', { deadline: '2026-09-18' }),
      ],
      TODAY,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].tasks.map((entry) => entry.title)).toEqual(['first', 'second', 'third']);
    expect(groups[0].doneCount).toBe(1);
  });

  it('drops the sections that ended up with no tasks', () => {
    const groups = groupTasksByDate([task('only', { deadline: '2026-09-18' })], TODAY);

    expect(groups.map((group) => group.key)).toEqual(['today']);
  });

  it('reads an unbounded task date as its local creation day', () => {
    const day = taskDay(task('no deadline', { createdAt: localStamp(2026, 9, 18, 1) }), TODAY);

    expect(day.key).toBe('2026-09-18');
  });

  it('names the section a task lands in, so a new task can be revealed', () => {
    expect(sectionKeyFor(task('today', { deadline: '2026-09-18' }), TODAY)).toBe('today');
    expect(sectionKeyFor(task('last week', { deadline: '2026-09-12' }), TODAY)).toBe('last-week');
    expect(sectionKeyFor(task('next month', { deadline: '2026-10-02' }), TODAY)).toBe(
      'month-2026-10',
    );
  });
});

/**
 * The "+" in a section header has to write a date that puts the new task back
 * in that very section — otherwise the button lies about where the task went.
 */
describe('the date a section adds to', () => {
  it('gives Today and Tomorrow their own day', () => {
    expect(groupAddDate('today', TODAY)).toBe('2026-09-18');
    expect(groupAddDate('tomorrow', TODAY)).toBe('2026-09-19');
  });

  it('crosses a month and a year boundary correctly', () => {
    expect(groupAddDate('tomorrow', new Date(2026, 8, 30, 12))).toBe('2026-10-01');
    expect(groupAddDate('tomorrow', new Date(2026, 11, 31, 12))).toBe('2027-01-01');
  });

  it('adds to a future month on its first day', () => {
    expect(groupAddDate('month-2026-10', TODAY)).toBe('2026-10-01');
    expect(groupAddDate('month-2027-01', TODAY)).toBe('2027-01-01');
  });

  it('offers no date for a section that spans several days', () => {
    expect(groupAddDate('this-week', TODAY)).toBe('');
    expect(groupAddDate('next-week', TODAY)).toBe('');
    expect(groupAddDate('this-month', TODAY)).toBe('');
  });

  it('offers no date in the past, which the deadline field refuses', () => {
    expect(groupAddDate('yesterday', TODAY)).toBe('');
    expect(groupAddDate('last-week', TODAY)).toBe('');
    expect(groupAddDate('month-2026-08', TODAY)).toBe('');
  });

  it('files the task it creates back under the same header', () => {
    const due = groupAddDate('tomorrow', TODAY);

    expect(sectionKeyFor(task('added tomorrow', { deadline: due }), TODAY)).toBe('tomorrow');
  });
});
