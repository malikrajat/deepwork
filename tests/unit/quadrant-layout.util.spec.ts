import { describe, it, expect } from 'vitest';
import {
  BOARD_SPLITTER_PX,
  buildBoardLayout,
  sharesFor,
  splitShares,
} from '../../src/app/core/utils/quadrant-layout.util';

/**
 * How the four quadrants share the board.
 *
 * Collapsing used to hide a quadrant's contents without giving its space to
 * anybody, which is the complaint this layout answers. The tests therefore care
 * about one thing above all: a collapsed quadrant is not in the grid any more,
 * and the tracks that remain belong to the quadrants that are still open.
 */

const ALL = ['urgent-important', 'important', 'urgent', 'neither'] as const;
const none = { 'urgent-important': false, important: false, urgent: false, neither: false };
const only = (open: string) =>
  Object.fromEntries(ALL.map((id) => [id, id !== open])) as Record<string, boolean>;

describe('buildBoardLayout', () => {
  it('lays all four out as a 2x2 with a divider in each axis', () => {
    const layout = buildBoardLayout(ALL, none, [0.5, 0.5], [0.5, 0.5]);

    expect(layout.expandedCount).toBe(4);
    expect(layout.columns).toContain(`${BOARD_SPLITTER_PX}px`);
    expect(layout.rows).toContain(`${BOARD_SPLITTER_PX}px`);
    expect(layout.columnSplitter).not.toBeNull();
    expect(layout.rowSplitter).toBe(2);

    expect(layout.placements['urgent-important']).toEqual({ column: '1', row: '1' });
    expect(layout.placements['important']).toEqual({ column: '3', row: '1' });
    expect(layout.placements['urgent']).toEqual({ column: '1', row: '3' });
    expect(layout.placements['neither']).toEqual({ column: '3', row: '3' });
  });

  it('gives a collapsed quadrant an auto-height strip across the bottom', () => {
    const layout = buildBoardLayout(ALL, { ...none, important: true }, [0.5, 0.5], [0.5, 0.5]);

    expect(layout.expandedCount).toBe(3);
    expect(layout.placements['important']).toEqual({ column: '1 / -1', row: '4' });
    // The three open ones still have the whole 2x2 shape; the strip is added
    // after the tracks the open quadrants use, so none of it is taken from them.
    expect(layout.rows.endsWith('auto')).toBe(true);
  });

  it('gives the first open quadrant the wide top row when three are open', () => {
    // Minimising Schedule leaves Do First, Delegate and Eliminate. The first one
    // in reading order takes the top row rather than three quadrants being
    // squeezed into columns a window cannot spare.
    const layout = buildBoardLayout(ALL, { ...none, important: true }, [0.5, 0.5], [0.5, 0.5]);

    expect(layout.placements['urgent-important']).toEqual({ column: '1 / -1', row: '1' });
    expect(layout.placements['urgent']).toEqual({ column: '1', row: '3' });
    expect(layout.placements['neither']).toEqual({ column: '3', row: '3' });
    // The column divider only has a boundary under the wide row.
    expect(layout.columnSplitter?.row).toBe('3');
  });

  it('puts two open quadrants side by side and drops the row divider', () => {
    const layout = buildBoardLayout(
      ALL,
      { ...none, urgent: true, neither: true },
      [0.5, 0.5],
      [0.5, 0.5],
    );

    expect(layout.columns).toContain(`${BOARD_SPLITTER_PX}px`);
    expect(layout.columnSplitter).not.toBeNull();
    expect(layout.rowSplitter).toBeNull();
    expect(layout.placements['urgent-important']).toEqual({ column: '1', row: '1' });
    expect(layout.placements['important']).toEqual({ column: '3', row: '1' });
  });

  it('gives the only open quadrant the whole board', () => {
    const layout = buildBoardLayout(ALL, only('urgent'), [0.5, 0.5], [0.5, 0.5]);

    expect(layout.columns).toBe('minmax(0, 1fr)');
    expect(layout.rowSplitter).toBeNull();
    expect(layout.columnSplitter).toBeNull();
    expect(layout.placements['urgent']).toEqual({ column: '1', row: '1' });
  });

  it('stacks four strips and nothing else when everything is collapsed', () => {
    const all = Object.fromEntries(ALL.map((id) => [id, true])) as Record<string, boolean>;
    const layout = buildBoardLayout(ALL, all, [0.5, 0.5], [0.5, 0.5]);

    expect(layout.expandedCount).toBe(0);
    expect(layout.rows).toBe('auto auto auto auto');
    expect(layout.columnSplitter).toBeNull();
    expect(layout.rowSplitter).toBeNull();
    expect(layout.placements['urgent-important'].row).toBe('1');
    expect(layout.placements['neither'].row).toBe('4');
  });

  it('carries the dragged share into the track, and normalises it', () => {
    const layout = buildBoardLayout(ALL, none, [2, 1], [0.5, 0.5]);

    expect(layout.columns).toContain('0.6667fr');
    expect(layout.columns).toContain('0.3333fr');
  });
});

describe('sharesFor', () => {
  it('repairs a missing or unreadable share rather than producing a gap', () => {
    expect(sharesFor([], 2)).toEqual([0.5, 0.5]);
    expect(sharesFor([0, -1], 2)).toEqual([0.5, 0.5]);
    expect(sharesFor([NaN, 3], 2)).toEqual([0.25, 0.75]);
  });

  it('keeps the stored proportions, scaled to the number of tracks', () => {
    expect(sharesFor([3, 1], 2)).toEqual([0.75, 0.25]);
    expect(sharesFor([1, 1, 1], 1)).toEqual([1]);
  });
});

describe('splitShares', () => {
  it('moves the boundary and keeps the pair’s combined share', () => {
    const next = splitShares([0.5, 0.5], 0, 0.2);

    expect(next[0]).toBeCloseTo(0.7);
    expect(next[1]).toBeCloseTo(0.3);
    expect(next[0] + next[1]).toBeCloseTo(1);
  });

  it('never closes a track: the minimum share is the floor', () => {
    const next = splitShares([0.5, 0.5], 0, 5);

    expect(next[0]).toBeCloseTo(0.85);
    expect(next[1]).toBeCloseTo(0.15);
  });

  it('is a no-op for a boundary that does not exist', () => {
    expect(splitShares([0.5], 0, 0.2)).toEqual([0.5]);
    expect(splitShares([0.5, 0.5], 1, 0.2)).toEqual([0.5, 0.5]);
  });
});
