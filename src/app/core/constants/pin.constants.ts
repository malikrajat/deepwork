import type { PinTarget } from '../models/pin.model';

/**
 * The words the pin offer uses, per desktop.
 *
 * They are written out per target rather than assembled from a template
 * ("Pin to {{target}}") because the sentences around the name differ as much as
 * the name does: macOS pins to the *Dock* with **Keep in Dock**, Linux desktops
 * each call the thing something else, and only Windows has a shell that will do
 * it for the user. A single template would have to be vague enough to fit all
 * three, which is how a prompt ends up telling a Mac user about a taskbar.
 */

/** The eyebrow above the title: what the offer is about, on this desktop. */
export const PIN_EYEBROW: Record<PinTarget, string> = {
  taskbar: 'Taskbar',
  dock: 'Dock',
  panel: 'Panel',
};

/** The one-line question the offer asks. */
export const PIN_TITLE = 'Keep DeepWork one click away';

/** The offer's body: what pinning buys the user here. */
export const PIN_BODY: Record<PinTarget, string> = {
  taskbar:
    'Pin DeepWork to the taskbar and it is one click away — even when the window is closed and the timer is still running next to the clock.',
  dock: 'Keep DeepWork in the Dock and it is one click away, whether the window is open or sitting in the tray.',
  panel:
    'Pin DeepWork to your panel and it is one click away, whether the window is open or sitting in the tray.',
};

/** The button that says yes. The desktop's own verb, where it has one. */
export const PIN_CONFIRM: Record<PinTarget, string> = {
  taskbar: 'Pin to taskbar',
  dock: 'Keep in Dock',
  panel: 'Pin to panel',
};

/** The button that says no thanks — and is remembered. */
export const PIN_DISMISS = 'Not now';

/** The button that closes the card once it is showing instructions. */
export const PIN_ACKNOWLEDGE = 'Got it';

/**
 * What the card says while the desktop's own prompt is on screen.
 *
 * The app asked; the desktop is asking now, and the card cannot answer for the
 * user. Saying so is the difference between "the button did nothing" and "look at
 * the dialog" — and the second is what the user needs, because that dialog is
 * somewhere else on their screen, possibly behind this window.
 */
export const PIN_AWAITING: Record<PinTarget, string> = {
  taskbar:
    'Windows is asking you to confirm. Look for its "Pin to taskbar?" prompt — it can appear behind this window — and answer it there.',
  dock: 'Your desktop is asking you to confirm. Look for its prompt and answer it there.',
  panel: 'Your desktop is asking you to confirm. Look for its prompt and answer it there.',
};

/** The title while the desktop's own prompt is up. */
export const PIN_AWAITING_TITLE = 'Waiting for you to confirm';

/**
 * What the card says when the desktop would not do it for the user.
 *
 * The backend sends a sentence of its own when it has one — it is the side that
 * saw the refusal — so this is the fallback for the case where the message is
 * missing rather than a second opinion about why.
 */
export const PIN_MANUAL_FALLBACK =
  'This desktop does not let an app pin itself. Pin DeepWork by hand from the running app: right-click its icon and choose the pin option.';
