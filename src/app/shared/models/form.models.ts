/**
 * Type-safe form model interfaces for the application.
 * All form models use strict types with no null/undefined values
 * (Signal Forms requirement).
 */

/** Task creation/edit form model */
export interface TaskFormModel {
  title: string;
  description: string;
  priority: string; // '1' | '2' | '3' | '4' — string for <select> binding
  quadrant: string; // '' | 'urgent-important' | 'important' | 'urgent' | 'neither'
  deadline: string; // ISO date string or ''
  recurFrequency: string; // '' | 'daily' | 'weekly' | 'monthly'
  recurEndDate: string; // ISO date string or ''
}

/** Habit creation form model */
export interface HabitFormModel {
  name: string;
  icon: string;
}

/** Journal entry form model */
export interface JournalFormModel {
  content: string;
}

/** Settings form model */
export interface SettingsFormModel {
  workDuration: number;
  shortBreak: number;
  longBreak: number;
  sessionsBeforeLongBreak: number;
  notificationSound: NotificationSound;
  notificationRepeatInterval: number;
  alertShakeMs: number;
  trayBehavior: 'minimize' | 'quit';
  theme: ThemePreference;
  waterReminders: boolean;
  waterStart: string;
  waterEnd: string;
  waterIntervalMinutes: number;
  waterAmountMl: number;
  waterGoalMl: number;
  waterAutoLogWhenMinimized: boolean;
  carryForwardTasks: boolean;
}

/** Dashboard task selector form model */
export interface TaskSelectFormModel {
  taskId: string;
}

/** Search form model (reusable) */
export interface SearchFormModel {
  query: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default form values (factory functions to avoid shared references)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Today as `YYYY-MM-DD` in the user's own timezone.
 *
 * Deliberately not `toISOString()`: that is UTC, so anyone east of Greenwich
 * would see yesterday's date in the form every morning.
 */
function todayIsoDate(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Defaults for the Add/Edit task form.
 *
 * The deadline starts on today's date: most tasks are for today, and making the
 * user pick the same day on every new task was pure friction. It stays an ordinary
 * field — clear it for no deadline, or move it to any later day.
 */
export function createTaskFormDefaults(): TaskFormModel {
  return {
    title: '',
    description: '',
    priority: '3',
    quadrant: '',
    deadline: todayIsoDate(),
    recurFrequency: '',
    recurEndDate: '',
  };
}

export function createHabitFormDefaults(): HabitFormModel {
  return { name: '', icon: '✓' };
}

export function createJournalFormDefaults(): JournalFormModel {
  return { content: '' };
}

export function createSettingsFormDefaults(): SettingsFormModel {
  return {
    workDuration: 1500,
    shortBreak: 300,
    longBreak: 900,
    sessionsBeforeLongBreak: 4,
    notificationSound: 'bell',
    notificationRepeatInterval: 60,
    alertShakeMs: DEFAULT_SETTINGS.alertShakeMs,
    trayBehavior: 'minimize',
    theme: 'system',
    waterReminders: DEFAULT_SETTINGS.waterReminders,
    waterStart: DEFAULT_SETTINGS.waterStart,
    waterEnd: DEFAULT_SETTINGS.waterEnd,
    waterIntervalMinutes: DEFAULT_SETTINGS.waterIntervalMinutes,
    waterAmountMl: DEFAULT_SETTINGS.waterAmountMl,
    waterGoalMl: DEFAULT_SETTINGS.waterGoalMl,
    waterAutoLogWhenMinimized: DEFAULT_SETTINGS.waterAutoLogWhenMinimized,
    carryForwardTasks: DEFAULT_SETTINGS.carryForwardTasks,
  };
}

export function createSearchFormDefaults(): SearchFormModel {
  return { query: '' };
}

export function createTaskSelectFormDefaults(): TaskSelectFormModel {
  return { taskId: '' };
}
import {
  DEFAULT_SETTINGS,
  NotificationSound,
  ThemePreference,
} from '../../core/models/settings.model';
