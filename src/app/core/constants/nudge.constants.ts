/**
 * The words the app uses when it asks for a small favour from the desktop.
 *
 * Two rules shape all of it, and they are the reason the copy lives in one file
 * instead of at the call sites:
 *
 * - **Say what is in it for the user, in one line.** "Start with Windows" is an
 *   instruction; "your timer is ready when you sign in" is a reason. Every
 *   message leads with the second and only then says what to do.
 * - **Never a paragraph.** These arrive while somebody is working. A title they
 *   can read at a glance and one short line under it is the whole budget; the
 *   longer explanation belongs in Settings, where someone has chosen to read.
 */

export const LAUNCH_DIALOG_COPY = {
  heading: 'Start DeepWork with your computer',
  subtitle: 'Your focus timer is ready the moment you sign in — no app to find, nothing to forget.',
  benefits: [
    'It opens by itself at sign-in and waits in the system tray.',
    'The timer, reminders and your day are already there when you sit down.',
    'One switch, and you can turn it off here or in Settings at any time.',
  ],
  accept: 'Start with your computer',
  decline: 'Not now',
  never: 'Don’t remind me again',
  footnote:
    'Not now is fine: DeepWork will remind you quietly a few times a day. You can stop that in Settings → App Behaviour.',
} as const;

/**
 * The startup reminder, in the order it is used.
 *
 * Rotated rather than picked at random so the same line does not come back on
 * the next reminder, and so a user who sees two in a day reads two different
 * reasons rather than the same sentence twice.
 */
export const STARTUP_NUDGES = [
  {
    title: 'Start DeepWork with your computer',
    body: 'Your timer is ready when you sign in — no app to find, no session missed.',
    system:
      'Choose Yes and DeepWork is ready when you sign in — no app to find, no session missed.',
  },
  {
    title: 'Your morning could start with the timer already on',
    body: 'Turn on “Start with your computer” and DeepWork is waiting at sign-in, not buried in a menu.',
    system: 'Turn on startup and DeepWork is waiting at sign-in, not buried in a menu. Choose Yes.',
  },
  {
    title: 'One less thing to remember tomorrow',
    body: 'DeepWork can open with your computer, so the day starts with the app already there.',
    system: 'Let DeepWork open with your computer — your timer and today’s list ready at sign-in.',
  },
  {
    title: 'Keep your focus timer within reach',
    body: 'Start DeepWork at sign-in and it waits in the tray, one click from your first session.',
    system: 'Start DeepWork at sign-in: it waits in the tray, one click from your first session.',
  },
  {
    title: 'Never lose a session to a closed app',
    body: 'Starting with your computer means the timer is already running its day when you sit down.',
    system: 'Start DeepWork with your computer so the timer is already there when you sit down.',
  },
] as const;

/** The taskbar reminder, rotated the same way. */
export const TASKBAR_PIN_NUDGES = [
  {
    title: 'Pin DeepWork to the taskbar',
    body: 'One click from your timer. Choose Yes and Windows will ask you to confirm the pin.',
    system:
      'One click from your timer. Choose Yes and Windows will confirm the pin — or No to pass.',
  },
  {
    title: 'Your timer, one click from the taskbar',
    body: 'Windows will pin DeepWork for you after its own confirmation. One click, from here on.',
    system: 'Keep your timer one click away. Choose Yes and Windows will confirm the pin.',
  },
  {
    title: 'Stop hunting for the app',
    body: 'Pin DeepWork to the taskbar and it is always in the same place, one click from your session.',
    system:
      'Pin DeepWork to the taskbar so it is always in the same place. Choose Yes to ask Windows.',
  },
] as const;

/** One line for Settings, under the switch that ends the reminders. */
export const NUDGE_SETTINGS_HELP = {
  startup: {
    label: 'Remind me to start with my computer',
    body: 'A few short reminders a day while DeepWork is not set to open at sign-in. Stops by itself once it is on.',
  },
  pin: {
    label: 'Remind me to pin DeepWork to the taskbar',
    body: 'Three short reminders a day while DeepWork is not pinned. Choose Yes and Windows asks you to confirm the pin — an app cannot do it silently.',
  },
} as const;

/** The one line the tray uses when a timed mute is set. */
export function muteConfirmation(untilLabel: string): string {
  return `Sound muted until ${untilLabel}. Reminders still appear.`;
}
