/**
 * Window geometry arithmetic: where a window is allowed to be.
 *
 * All of it is pure — numbers in, numbers out, no Tauri import and no window — so
 * the rule that decides where a restored window lands is the same in the desktop
 * app and in a test. `UiService` is the only caller: it hands over the geometry it
 * wants back and the desktop it wants it on, and puts the window there.
 */

/**
 * A size and the top-left corner it is drawn from, in physical pixels — the shape
 * `outerPosition()` and `outerSize()` answer with, and the shape a monitor's
 * `workArea` has too.
 */
export interface WindowGeometry {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

/**
 * Pulls a window's geometry inside a desktop, so no part of it lands somewhere the
 * user cannot reach.
 *
 * This is the second half of leaving the mini widget. The widget is dragged
 * anywhere, including across monitors of different sizes and DPI scales, and the
 * geometry the window wants back was measured in a different place and time: the
 * widget can be sitting on the far right of a smaller second monitor, a display can
 * have been unplugged, or the window can have been maximised when it shrank — and a
 * maximised window's frame is *larger* than the desktop (it hangs off every edge by
 * the resize border). Growing back to that without a check leaves the title bar
 * above the top of the screen, which is a window that cannot be dragged or closed.
 *
 * So the window is capped to the desktop it is landing on, then slid in from
 * whichever edge it overhangs. A geometry that already fits — every restore on a
 * single monitor, and every resize that never left the screen — comes back
 * unchanged, to the pixel: this only ever moves a window that would otherwise be
 * partly unreachable.
 *
 * An unreadable or empty work area means "no usable desktop to reason about" (a
 * display asleep, a virtual desktop mid-rearrangement), and the geometry is handed
 * back as it came rather than moved to a corner the user did not choose.
 */
export function fitInsideWorkArea(
  geometry: WindowGeometry,
  workArea: WindowGeometry | null | undefined,
): WindowGeometry {
  if (!isReadable(geometry)) return copyOf(geometry);

  const wanted = copyOf(geometry);
  if (!workArea || !isReadable(workArea)) return wanted;

  const desktop = copyOf(workArea);
  if (desktop.size.width <= 0 || desktop.size.height <= 0) return wanted;

  // The window can only be as large as the desktop it is landing on...
  wanted.size.width = Math.min(wanted.size.width, desktop.size.width);
  wanted.size.height = Math.min(wanted.size.height, desktop.size.height);

  // ...and both of its edges have to be inside that desktop, which is the same
  // rule for a window hanging off the left of the screen as for one hanging off
  // the right.
  wanted.position.x = clamp(
    wanted.position.x,
    desktop.position.x,
    desktop.position.x + desktop.size.width - wanted.size.width,
  );
  wanted.position.y = clamp(
    wanted.position.y,
    desktop.position.y,
    desktop.position.y + desktop.size.height - wanted.size.height,
  );

  return wanted;
}

/** A whole number that can be reasoned about, or null for anything else. */
function whole(value: number): number | null {
  return Number.isFinite(value) ? Math.round(value) : null;
}

/** True when all six numbers of a geometry can be worked with. */
function isReadable(geometry: WindowGeometry): boolean {
  return (
    whole(geometry.position?.x) !== null &&
    whole(geometry.position?.y) !== null &&
    whole(geometry.size?.width) !== null &&
    whole(geometry.size?.height) !== null
  );
}

/**
 * Rounds a geometry to whole physical pixels and detaches it from the caller's
 * object, so nothing here writes back through the arguments.
 */
function copyOf(geometry: WindowGeometry): WindowGeometry {
  return {
    position: {
      x: whole(geometry.position?.x) ?? geometry.position?.x,
      y: whole(geometry.position?.y) ?? geometry.position?.y,
    },
    size: {
      width: whole(geometry.size?.width) ?? geometry.size?.width,
      height: whole(geometry.size?.height) ?? geometry.size?.height,
    },
  };
}

/** `value` kept between `low` and `high`, both ends included. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * Is the page drawn *under* a native macOS title bar?
 *
 * It is on macOS in the desktop shell, and only there. Tauri's default
 * `titleBarStyle` for a Mac window is `Visible`, which it implements as
 * `titlebarAppearsTransparent(false)` **plus** `fullsizeContentView(true)` —
 * an ordinary opaque title bar that the page is laid out *behind*, so the top of
 * the app sits underneath the traffic lights unless the layout reserves that
 * strip. Windows and Linux put the webview below the frame instead, and the
 * browser build has no native bar at all, so neither of them needs the inset.
 *
 * Pure, so the rule can be unit-tested without a Mac: the caller passes the user
 * agent and whether it is running inside the desktop shell.
 */
export function hasNativeMacTitlebar(userAgent: string, isTauriEnv: boolean): boolean {
  return isTauriEnv && /Mac OS X|Macintosh/i.test(userAgent);
}
