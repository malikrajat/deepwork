import { describe, it, expect } from 'vitest';
import { fitInsideWorkArea, type WindowGeometry } from '../../src/app/core/utils/window.util';

/**
 * Where a restored window is allowed to land, pinned down.
 *
 * Leaving the mini widget grows the window back to geometry measured somewhere
 * else, and the whole point of the rule is that the user always ends up with a
 * window they can reach: nothing off the top, nothing off the bottom, nothing
 * behind a second monitor that is no longer plugged in.
 */

/** A 1920×1080 screen with a 40px taskbar — the everyday single-monitor case. */
const SCREEN: WindowGeometry = {
  position: { x: 0, y: 0 },
  size: { width: 1920, height: 1040 },
};

/** A second screen to the right of the first, with its own smaller work area. */
const RIGHT_SCREEN: WindowGeometry = {
  position: { x: 1920, y: 0 },
  size: { width: 1280, height: 984 },
};

function geometry(x: number, y: number, width: number, height: number): WindowGeometry {
  return { position: { x, y }, size: { width, height } };
}

describe('fitting a restored window to a desktop', () => {
  it('leaves a window that already fits exactly where it is', () => {
    const wanted = geometry(360, 140, 1200, 800);

    expect(fitInsideWorkArea(wanted, SCREEN)).toEqual(wanted);
  });

  it('leaves a window resting on the far corner untouched', () => {
    // The common "parked in the bottom-right corner" case: still fully visible,
    // so still exactly where the user put it.
    const wanted = geometry(720, 240, 1200, 800);

    expect(fitInsideWorkArea(wanted, SCREEN)).toEqual(wanted);
  });

  it('pulls a window back from the right and bottom edges', () => {
    // What the widget does when it is dragged across the screen: the geometry is
    // fine, but it is measured from a corner the window no longer fits next to.
    const fitted = fitInsideWorkArea(geometry(1800, 900, 1200, 800), SCREEN);

    expect(fitted.position).toEqual({ x: 720, y: 240 });
    expect(fitted.size).toEqual({ width: 1200, height: 800 });
  });

  it('pushes a window in from the left and top edges', () => {
    // A maximised window's frame, to the pixel: Windows draws it 8px past every
    // edge of the screen, so its title bar is above the top of the desktop.
    const fitted = fitInsideWorkArea(geometry(-8, -8, 1200, 800), SCREEN);

    expect(fitted.position).toEqual({ x: 0, y: 0 });
  });

  it('caps a window that is bigger than the desktop it is going to', () => {
    // 1920×1080 minus a taskbar is not 1936×1056, which is what a maximised
    // frame measures; the window is made to fit instead of hanging off.
    const fitted = fitInsideWorkArea(geometry(-8, -8, 1936, 1056), SCREEN);

    expect(fitted.size).toEqual({ width: 1920, height: 1040 });
    expect(fitted.position).toEqual({ x: 0, y: 0 });
  });

  it('fits the window to the monitor that owns the saved position', () => {
    // A second monitor sits to the right, so its work area starts at x=1920 and
    // the same rule has to be applied there rather than to the primary screen.
    const fitted = fitInsideWorkArea(geometry(2500, 100, 1200, 800), RIGHT_SCREEN);

    expect(fitted.position).toEqual({ x: 2000, y: 100 });
    expect(fitted.size).toEqual({ width: 1200, height: 800 });
  });

  it('gives back a geometry with no desktop to reason about', () => {
    // A display asleep, or a virtual desktop mid-rearrangement: moving the
    // window to a made-up corner would be worse than leaving it alone.
    const wanted = geometry(1800, 900, 1200, 800);

    expect(fitInsideWorkArea(wanted, null)).toEqual(wanted);
    expect(fitInsideWorkArea(wanted, undefined)).toEqual(wanted);
    expect(fitInsideWorkArea(wanted, geometry(0, 0, 0, 0))).toEqual(wanted);
    expect(fitInsideWorkArea(wanted, geometry(Number.NaN, 0, 1920, 1040))).toEqual(wanted);
  });

  it('gives back an unreadable geometry rather than inventing one', () => {
    const broken = geometry(Number.NaN, 0, 1200, 800);

    expect(fitInsideWorkArea(broken, SCREEN)).toEqual(broken);
  });

  it('rounds to whole pixels and never writes back through its arguments', () => {
    const wanted = geometry(1800.4, 900.6, 1200.2, 800.8);
    const untouched = structuredClone(wanted);

    const fitted = fitInsideWorkArea(wanted, SCREEN);

    expect(fitted.position).toEqual({ x: 720, y: 239 });
    expect(fitted.size).toEqual({ width: 1200, height: 801 });
    expect(wanted).toEqual(untouched);
  });
});
