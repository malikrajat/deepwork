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
  trayBehavior: 'minimize' | 'quit';
  theme: ThemePreference;
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

export function createTaskFormDefaults(): TaskFormModel {
  return {
    title: '',
    description: '',
    priority: '3',
    quadrant: '',
    deadline: '',
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
    trayBehavior: 'minimize',
    theme: 'system',
  };
}

export function createSearchFormDefaults(): SearchFormModel {
  return { query: '' };
}

export function createTaskSelectFormDefaults(): TaskSelectFormModel {
  return { taskId: '' };
}
import { NotificationSound, ThemePreference } from '../../core/models/settings.model';
