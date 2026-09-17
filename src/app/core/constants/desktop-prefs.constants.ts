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
    'DeepWork opens by itself when you sign in to your computer and waits quietly ' +
    'in the system tray, next to the clock. It will not pop a window open over ' +
    'your desktop or interrupt what you are doing.',
  hint: 'You can switch this off any time — here, from the tray menu, or in Settings.',
} as const;

export const ALWAYS_ON_TOP_HELP = {
  heading: 'Always on top',
  body:
    'Keeps the DeepWork window above every other window, so your timer and current ' +
    'task stay visible while you work in other apps. Other windows cannot cover it.',
  hint: 'Turn it off when you want normal windows to be able to cover DeepWork again.',
} as const;

export const MINI_WIDGET_HELP = {
  heading: 'Mini widget',
  body:
    'Minimising from the clock card shrinks DeepWork into a small floating widget. ' +
    'It stays above your other windows, and you can drag it anywhere on your ' +
    'desktop with the mouse so it is always within reach.',
  hint: 'Click the expand arrow in the widget (or press Esc) to bring the full window back.',
} as const;
