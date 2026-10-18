/**
 * How the four quadrants share the board.
 *
 * The board is a CSS grid, and this module is the only place that decides its
 * tracks: which columns and rows exist, where each quadrant sits in them, and
 * where the draggable dividers land. The component reads the answer and writes
 * it as `grid-template-*` and `grid-column`/`grid-row`, so the layout can be
 * tested as arithmetic instead of by looking at a browser.
 *
 * Two ideas do the work:
 *
 * - **A collapsed quadrant leaves the grid.** It becomes an `auto`-height strip
 *   across the bottom, and the remaining ones re-flow into the space it gave up.
 *   That is what makes "minimise Illuminate to see all of Schedule" real rather
 *   than cosmetic: the old board folded the *contents* of a quadrant while its
 *   1fr track stayed exactly where it was, so nothing ever got bigger.
 * - **Every visible column and row is a weight.** A drag moves the boundary
 *   between two neighbours and the pair keeps its combined share, so widening
 *   one never leaves a gap and never pushes the last column off the board.
 *
 * The shapes are deliberately few: four quadrants make 2x2, three make a wide
 * row over two halves, two sit side by side, one takes the board, and none is
 * just the strips. Three as 3x1 was considered and rejected — at the window's
 * 800px minimum it leaves each quadrant about 200px, which is narrower than a
 * card's own controls.
 */

/** The width of a draggable divider, in pixels. */
export const BOARD_SPLITTER_PX = 8;

/** The smallest share a column or row may be dragged down to. */
export const MIN_TRACK_SHARE = 0.15;

/** Where one quadrant sits in the grid, as CSS `grid-column`/`grid-row` values. */
export interface BoardPlacement {
  column: string;
  row: string;
}

/** The whole board for one set of collapse states and weights. */
export interface BoardLayout {
  /** For `grid-template-columns`. */
  columns: string;
  /** For `grid-template-rows`. */
  rows: string;
  /** For each quadrant id, where it sits — collapsed ones included. */
  placements: Record<string, BoardPlacement>;
  /** The vertical divider between the two visible columns, if there are two. */
  columnSplitter: { column: number; row: string } | null;
  /** The grid row of the horizontal divider, if the visible ones need two rows. */
  rowSplitter: number | null;
  /** How many quadrants are still open. */
  expandedCount: number;
}

/**
 * Builds the grid for a set of quadrant ids.
 *
 * `all` is the canonical order, which is also the reading order: the first
 * expanded quadrant is the one that gets the wide top row when there are three
 * of them.
 */
export function buildBoardLayout(
  all: readonly string[],
  collapsed: Readonly<Record<string, boolean>>,
  columnWeights: readonly number[],
  rowWeights: readonly number[],
): BoardLayout {
  const expanded = all.filter((id) => collapsed[id] !== true);
  const minimized = all.filter((id) => collapsed[id] === true);
  const shape = shapeFor(expanded.length);

  const columnShares = sharesFor(columnWeights, shape.columns);
  const columns =
    shape.columns === 1
      ? 'minmax(0, 1fr)'
      : `minmax(0, ${columnShares[0]}fr) ${BOARD_SPLITTER_PX}px minmax(0, ${columnShares[1]}fr)`;

  const rowTracks: string[] = [];
  if (shape.rows === 2) {
    const rowShares = sharesFor(rowWeights, 2);
    rowTracks.push(
      `minmax(0, ${rowShares[0]}fr)`,
      `${BOARD_SPLITTER_PX}px`,
      `minmax(0, ${rowShares[1]}fr)`,
    );
  } else if (shape.rows === 1) {
    rowTracks.push('minmax(0, 1fr)');
  }
  const expandedTrackCount = rowTracks.length;
  // A strip is as tall as its one row of text, so the space it gives up goes to
  // the quadrants that are still open rather than to an empty band.
  for (let index = 0; index < minimized.length; index += 1) rowTracks.push('auto');

  const placements: Record<string, BoardPlacement> = {};
  expanded.forEach((id, index) => {
    if (shape.rows === 2 && shape.wideFirst && index === 0) {
      // The wide row crosses the divider track as well, so it spans every
      // column the open quadrants use.
      placements[id] = { column: '1 / -1', row: '1' };
    } else if (shape.rows === 2 && shape.wideFirst) {
      // The two underneath the wide row: index 1 is the left one, index 2 the
      // right. The visible columns are grid tracks 1 and 3 — track 2 is the
      // divider — which is the one piece of arithmetic this layout has to get
      // right or the second column is drawn under the divider.
      placements[id] = { column: `${(index - 1) * 2 + 1}`, row: '3' };
    } else if (shape.rows === 2) {
      // Two rows of two, with the divider on the grid's own second track.
      placements[id] = {
        column: `${(index % 2) * 2 + 1}`,
        row: index < 2 ? '1' : '3',
      };
    } else if (shape.columns === 2) {
      placements[id] = { column: `${index * 2 + 1}`, row: '1' };
    } else {
      placements[id] = { column: '1', row: '1' };
    }
  });

  // The strips go last, in their canonical order, each across the whole board.
  minimized.forEach((id, index) => {
    placements[id] = { column: '1 / -1', row: `${expandedTrackCount + 1 + index}` };
  });

  return {
    columns,
    rows: rowTracks.length ? rowTracks.join(' ') : 'auto',
    placements,
    columnSplitter:
      shape.columns === 2
        ? {
            column: 2,
            // With a wide top row there is no boundary to drag up there: the
            // divider only exists between the two quadrants underneath it.
            row: shape.wideFirst
              ? '3'
              : expandedTrackCount > 0
                ? `1 / ${expandedTrackCount + 1}`
                : '1',
          }
        : null,
    rowSplitter: shape.rows === 2 ? 2 : null,
    expandedCount: expanded.length,
  };
}

/**
 * Moves the boundary between two neighbouring tracks.
 *
 * `delta` is a share of the whole axis (a pixel delta divided by the board's
 * width or height), and the two tracks keep their combined share: growing one
 * by `delta` shrinks the other by exactly as much. Neither is allowed below
 * {@link MIN_TRACK_SHARE}, which is what stops a drag from closing a quadrant
 * instead of resizing it — collapsing has its own control, and it is reversible.
 */
export function splitShares(
  shares: readonly number[],
  index: number,
  delta: number,
  minShare = MIN_TRACK_SHARE,
): number[] {
  if (index < 0 || index + 1 >= shares.length) return [...shares];

  const next = [...shares];
  const pair = next[index] + next[index + 1];
  const floor = Math.min(minShare, pair / 2);
  const wanted = clamp(next[index] + delta, floor, pair - floor);
  next[index] = wanted;
  next[index + 1] = pair - wanted;
  return next;
}

/** Two equal shares, or the stored ones repaired into usable fractions. */
export function sharesFor(weights: readonly number[], count: number): number[] {
  const picked = Array.from({ length: count }, (_, index) => {
    const value = Number(weights[index]);
    return Number.isFinite(value) && value > 0 ? value : 1;
  });
  const sum = picked.reduce((total, value) => total + value, 0) || count;
  return picked.map((value) => round(value / sum));
}

/** A share as `fr` text, short enough that two layouts compare as strings. */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * How many columns and rows the open quadrants need.
 *
 * `wideFirst` says the first open quadrant takes the whole top row. That is the
 * three-quadrant case, and it is the only one where the arrangement is a choice
 * rather than a consequence: a quadrant and a half of space reads better than
 * three columns squeezed into a window that can be 900px wide.
 */
function shapeFor(count: number): {
  columns: number;
  rows: number;
  wideFirst: boolean;
} {
  if (count >= 4) return { columns: 2, rows: 2, wideFirst: false };
  if (count === 3) return { columns: 2, rows: 2, wideFirst: true };
  if (count === 2) return { columns: 2, rows: 1, wideFirst: false };
  if (count === 1) return { columns: 1, rows: 1, wideFirst: false };
  return { columns: 1, rows: 0, wideFirst: false };
}
