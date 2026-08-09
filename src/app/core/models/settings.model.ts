export interface AppSettings {
  workDuration: number;
  shortBreak: number;
  longBreak: number;
  sessionsBeforeLongBreak: number;
  notificationSound: string;
  /** Repeat interval for notification sound/toast in seconds */
  notificationRepeatInterval: number;
  theme: 'system' | 'light' | 'dark';
}

export const DEFAULT_SETTINGS: AppSettings = {
  workDuration: 1500,
  shortBreak: 300,
  longBreak: 900,
  sessionsBeforeLongBreak: 4,
  notificationSound: 'bell',
  notificationRepeatInterval: 60,
  theme: 'system',
};
