export interface AppSettings {
  workDuration: number;
  shortBreak: number;
  longBreak: number;
  sessionsBeforeLongBreak: number;
  notificationSound: string;
  trayBehavior: 'minimize' | 'quit';
  theme: 'dark';
}

export const DEFAULT_SETTINGS: AppSettings = {
  workDuration: 1500,
  shortBreak: 300,
  longBreak: 900,
  sessionsBeforeLongBreak: 4,
  notificationSound: 'bell',
  trayBehavior: 'minimize',
  theme: 'dark',
};
