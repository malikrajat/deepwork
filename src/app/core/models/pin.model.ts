/**
 * Whether DeepWork is pinned somewhere the user can reach it in one click, and
 * what this desktop calls that place.
 *
 * Answered by the Rust layer — see `src-tauri/src/taskbar.rs` — because it is
 * the only side that can ask a desktop anything. The names are the desktop's
 * own: Windows pins to the **taskbar**, macOS to the **Dock**, Linux to a
 * **panel**, and an app that used the wrong one would read as a port that never
 * looked out of the window.
 */

/** The location an app is pinned to, as this desktop names it. */
export type PinTarget = 'taskbar' | 'dock' | 'panel';

/** What this desktop can do about pinning. */
export interface PinStatus {
  target: PinTarget;
  /**
   * True when the app can make the pin happen itself — Windows only.
   *
   * It still asks the user: this says whether there is a call to make, not
   * whether the pin is silent.
   */
  canAutoPin: boolean;
  /**
   * True when this desktop already holds DeepWork among its pinned apps.
   *
   * Always false away from Windows, where no application is given an interface
   * to read the pinned list — so the offer there is governed by the stored
   * answer instead (see `taskbarPinPrompted`).
   */
  pinned: boolean;
}

/** How one attempt at pinning ended. */
export interface PinOutcome {
  /** True once the app is pinned. False means it is not, whatever was asked. */
  pinned: boolean;
  /** True when the desktop did the work itself, after its own confirmation. */
  automatic: boolean;
  /** What to tell the user instead, when the app could not do it for them. */
  message: string | null;
}
