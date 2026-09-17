/**
 * Windowing maths for fixed-height lists.
 *
 * Given a scroll position, only the rows that can be seen (plus overscan) are
 * returned, so a list of thousands of rows keeps a handful of nodes in the DOM.
 */
export interface WindowBounds {
  /** First row index to render. */
  first: number;
  /** One past the last row index to render. */
  last: number;
}

export function windowBounds(
  total: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscanRows = 4
): WindowBounds {
  if (total <= 0) return { first: 0, last: 0 };

  const height = Math.max(1, rowHeight);
  const overscan = Math.max(0, overscanRows);
  const first = Math.max(0, Math.floor((Math.max(0, scrollTop) - overscan * height) / height));
  const visibleCount = Math.ceil(Math.max(0, viewportHeight) / height);
  const last = Math.min(total, first + visibleCount + overscan * 2 + 1);

  const clampedFirst = Math.min(first, total - 1);
  return { first: clampedFirst, last: Math.max(last, Math.min(total, clampedFirst + 1)) };
}
