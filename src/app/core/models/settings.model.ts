export type ThemePreference = 'system' | 'light' | 'dark';
export type NotificationSound = 'bell' | 'chime' | 'ding' | 'none';

export interface AppSettings {
  workDuration: number;
  shortBreak: number;
  longBreak: number;
  sessionsBeforeLongBreak: number;
  notificationSound: NotificationSound;
  /** Repeat interval for notification sound/toast in seconds */
  notificationRepeatInterval: number;
  /** Nudge 5 minutes before a scheduled calendar block starts and ends */
  calendarReminders: boolean;
  trayBehavior: 'minimize' | 'quit';
  theme: ThemePreference;
  /**
   * Launch DeepWork automatically when the user signs in to the computer.
   *
   * The operating system is the source of truth for the *actual* state; this
   * field remembers what we last synced so the UI opens on the right value.
   */
  startWithSystem: boolean;
  /** Keep the main window above every other window. */
  alwaysOnTop: boolean;
  /** Whether the one-time "desktop preferences" dialog has been shown. */
  desktopPrefsPrompted: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  workDuration: 1500,
  shortBreak: 300,
  longBreak: 900,
  sessionsBeforeLongBreak: 4,
  notificationSound: 'bell',
  notificationRepeatInterval: 60,
  calendarReminders: true,
  trayBehavior: 'quit',
  theme: 'system',
  // Both are opt-in: nothing changes the user's desktop until they ask for it.
  startWithSystem: false,
  alwaysOnTop: false,
  desktopPrefsPrompted: false,
};

/** Minutes before a scheduled block starts/ends that a reminder fires. */
export const CALENDAR_REMINDER_LEAD_MINUTES = 5;
