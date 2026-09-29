import { describe, it, expect } from 'vitest';
import {
  QUADRANT_ORDER,
  addDays,
  clampMinute,
  dayKey,
  formatDuration,
  formatMinute,
  parseTimeInput,
  snapMinute,
  weekStart,
} from '../../src/app/core/services/schedule.util';

/**
 * The small arithmetic the calendar is built on: day keys, the timeline grid
 * and the way a time is written back to the user. All of it is pure, and all of
 * it is easy to get subtly wrong (a week that starts on Sunday, a typed `24:00`
 * that silently becomes midnight).
 */

describe('schedule: day keys', () => {
  it('keys days the way the rest of the app does', () => {
    expect(dayKey(new Date('2026-09-21T23:30:00Z'))).toBe('2026-09-21');
    expect(dayKey(new Date('2026-09-22T00:30:00Z'))).toBe('2026-09-22');
  });

  it('walks days across a month end', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-09-21', 0)).toBe('2026-09-21');
  });

  it('starts weeks on Monday', () => {
    // 2026-09-23 is a Wednesday.
    const start = weekStart('2026-09-23');

    expect(start).toBe('2026-09-21');
    for (let day = 0; day < 7; day++) {
      expect(weekStart(addDays(start, day))).toBe(start);
    }
  });
});

describe('schedule: the timeline grid', () => {
  it('writes a minute as a clock time, wrapping past midnight', () => {
    expect(formatMinute(0)).toBe('00:00');
    expect(formatMinute(9 * 60 + 5)).toBe('09:05');
    expect(formatMinute(23 * 60 + 59)).toBe('23:59');
    expect(formatMinute(24 * 60)).toBe('00:00');
    expect(formatMinute(-5)).toBe('23:55');
    expect(formatMinute(90.4)).toBe('01:30');
  });

  it('reads a typed time, and refuses anything that is not one', () => {
    expect(parseTimeInput(' 9:05 ')).toBe(545);
    expect(parseTimeInput('09:05')).toBe(545);
    expect(parseTimeInput('23:59')).toBe(1439);
    expect(parseTimeInput('24:00')).toBeNull();
    expect(parseTimeInput('9:60')).toBeNull();
    expect(parseTimeInput('9:5')).toBeNull();
    expect(parseTimeInput('nine')).toBeNull();
    expect(parseTimeInput('')).toBeNull();
  });

  it('snaps to the grid and stays inside the day', () => {
    expect(snapMinute(12)).toBe(10);
    expect(snapMinute(13)).toBe(15);
    expect(snapMinute(12, 60)).toBe(0);

    expect(clampMinute(12)).toBe(10);
    expect(clampMinute(-30)).toBe(0);
    expect(clampMinute(2000)).toBe(1435);
  });

  it('writes durations the way a person would say them', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(75)).toBe('1h 15m');
    expect(formatDuration(-10)).toBe('0m');
    expect(formatDuration(89.6)).toBe('1h 30m');
  });

  it('orders quadrants by execution order', () => {
    expect(QUADRANT_ORDER).toEqual(['urgent-important', 'important', 'urgent', 'neither']);
  });
});
