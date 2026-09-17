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
};

/** Minutes before a scheduled block starts/ends that a reminder fires. */
export const CALENDAR_REMINDER_LEAD_MINUTES = 5;
