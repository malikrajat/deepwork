export interface AppSettings {
  workDuration: number;
  shortBreak: number;
  longBreak: number;
  sessionsBeforeLongBreak: number;
  notificationSound: string;
  /** Repeat interval for notification sound/toast in seconds */
  notificationRepeatInterval: number;
  trayBehavior: 'minimize' | 'quit';
  theme: 'dark' | 'light' | 'auto';
}

export const DEFAULT_SETTINGS: AppSettings = {
  workDuration: 1500,
  shortBreak: 300,
  longBreak: 900,
  sessionsBeforeLongBreak: 4,
  notificationSound: 'bell',
  notificationRepeatInterval: 60,
  trayBehavior: 'minimize',
  theme: 'dark',
};
