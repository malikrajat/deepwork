/**
 * User-facing explanations for the desktop preferences.
 *
 * "Always on top" and "start with system" are ordinary desktop concepts to a
 * developer but opaque to most users, so the wording lives in one place and is
 * reused by every surface that offers the switches: Settings, the dashboard, and
 * the first-run dialog.
 */

export const START_WITH_SYSTEM_HELP = {
  heading: 'Start with system',
  body:
    'DeepWork opens by itself when you sign in to your computer and waits as a ' +
    'small widget in the corner of your screen, also present in the system tray ' +
    'next to the clock. It will not cover your desktop, and you can start a ' +
    'session straight from the widget.',
  hint: 'You can switch this off any time — here, from the tray menu, or in Settings.',
} as const;

export const ALWAYS_ON_TOP_HELP = {
  heading: 'Always on top',
  body:
    'Keeps the DeepWork window above every other window, so your timer and current ' +
    'task stay visible while you work in other apps. Other windows cannot cover it.',
  hint: 'Turn it off when you want normal windows to be able to cover DeepWork again.',
} as const;

export const CLOSE_TO_TRAY_HELP = {
  heading: 'Keep running in the tray',
  body:
    'Closing the window — with the X in its corner — puts DeepWork next to the ' +
    'clock in the system tray instead of ending it. The timer keeps counting, ' +
    'the water reminder keeps reminding, and the tray icon is always there to ' +
    'bring the window back with a click.',
  hint: 'To quit DeepWork completely, right-click the tray icon and choose Exit. Turning this off makes the X quit straight away again.',
} as const;

export const MINI_WIDGET_HELP = {
  heading: 'Mini widget',
  body:
    'Minimising the window — with the minimise button or from the clock card — ' +
    'shrinks DeepWork into a small floating widget. It has no title bar of its ' +
    'own, stays above your other windows, and can be dragged anywhere on your ' +
    'desktop so it is always within reach. The ring around the timer is full when ' +
    'a session starts and empties as the time runs out.',
  hint: 'Click the play button to run the timer, and the expand arrow (or press Esc) to bring the full window back.',
} as const;
