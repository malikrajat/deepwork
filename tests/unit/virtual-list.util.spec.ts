import { describe, it, expect } from 'vitest';
import { windowBounds } from '../../src/app/core/utils/virtual-list.util';

/**
 * The windowing maths behind the long task list: which rows are actually put in
 * the DOM for a given scroll position. A mistake here does not crash — it makes
 * rows silently disappear — so the boundaries are pinned down exactly.
 */

const ROW = 40;
const VIEWPORT = 400;

describe('virtual list windowing', () => {
  it('renders nothing for an empty list', () => {
    expect(windowBounds(0, ROW, 0, VIEWPORT)).toEqual({ first: 0, last: 0 });
    expect(windowBounds(-3, ROW, 500, VIEWPORT)).toEqual({ first: 0, last: 0 });
  });

  it('covers the first screen plus the overscan rows', () => {
    // 10 visible rows, 4 rows of overscan above and below, plus the partial row.
    expect(windowBounds(100, ROW, 0, VIEWPORT, 4)).toEqual({ first: 0, last: 19 });
  });

  it('moves the window down with the scroll position', () => {
    // 400px scrolled = row 10; the window starts 4 rows earlier.
    expect(windowBounds(100, ROW, 400, VIEWPORT, 4)).toEqual({ first: 6, last: 25 });
  });

  it('never runs past the end, however far it is scrolled', () => {
    expect(windowBounds(100, ROW, 100_000, VIEWPORT, 4)).toEqual({ first: 99, last: 100 });
    expect(windowBounds(5, ROW, 100_000, VIEWPORT, 4)).toEqual({ first: 4, last: 5 });
  });

  it('always hands back a usable range for odd inputs', () => {
    // A zero row height would mean dividing by zero.
    expect(windowBounds(5, 0, 0, 100, 4)).toEqual({ first: 0, last: 5 });
    // A negative scroll position or viewport, and no overscan at all.
    expect(windowBounds(10, ROW, -50, -100, -3)).toEqual({ first: 0, last: 1 });
  });

  it('keeps the visible rows inside the returned range', () => {
    // Scroll positions inside the list: beyond the end there is no visible row
    // left to cover, and the window correctly stops at the last one.
    for (const scrollTop of [0, 137, 400, 1_000, 9_999]) {
      const { first, last } = windowBounds(250, ROW, scrollTop, VIEWPORT, 4);
      const firstVisible = Math.floor(scrollTop / ROW);
      const lastVisible = Math.ceil((scrollTop + VIEWPORT) / ROW) - 1;

      expect(first).toBeLessThanOrEqual(firstVisible);
      expect(last).toBeGreaterThanOrEqual(Math.min(lastVisible, 249) + 1);
      expect(first).toBeGreaterThanOrEqual(0);
      expect(last).toBeLessThanOrEqual(250);
    }
  });
});
