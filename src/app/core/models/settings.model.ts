import {
  DEFAULT_WATER_AMOUNT_ML,
  DEFAULT_WATER_END,
  DEFAULT_WATER_GOAL_ML,
  DEFAULT_WATER_INTERVAL_MINUTES,
  DEFAULT_WATER_START,
} from '../constants/water.constants';
import { DEFAULT_ALERT_SHAKE_MS } from '../constants/alert.constants';

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
  /**
   * How long the mini widget shakes for when it repeats the alert, in
   * milliseconds; see `ALERT_SHAKE_OPTIONS`.
   *
   * The shake is how the alert is seen repeating rather than only heard, and how
   * long it should last is the user's call: long enough to outlast the alert
   * tone is the reason it exists, and anything past that is taste.
   */
  alertShakeMs: number;
  /**
   * What the window's close button does: `minimize` parks DeepWork in the tray
   * and leaves the timer and reminders running (`quit` still quits, for anyone
   * who asks for that from the tray menu instead).
   */
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
  /** Nudge the user to drink water during their working hours. */
  waterReminders: boolean;
  /** `HH:MM` local time — the first minute of the day a reminder may fire. */
  waterStart: string;
  /** `HH:MM` local time — the last minute of the day a reminder may fire. */
  waterEnd: string;
  /** Minutes between water reminders; see `WATER_INTERVAL_OPTIONS`. */
  waterIntervalMinutes: number;
  /** Millilitres one drink counts as; see `WATER_AMOUNT_OPTIONS`. */
  waterAmountMl: number;
  /** The day's water target in millilitres; see `WATER_GOAL_OPTIONS`. */
  waterGoalMl: number;
  /**
   * Whether a reminder that arrives while the window is minimised counts the
   * glass by itself instead of asking.
   *
   * Minimising DeepWork is a deliberate "do not disturb me": someone who has
   * shrunk the app into the mini widget is working in another window, and the
   * reminder has no business pulling the full one back over it. With this on,
   * the reminder rings, tells the operating system it counted the glass, and
   * leaves the window alone; with it off, the old behaviour stands and the
   * window comes back with the question.
   */
  waterAutoLogWhenMinimized: boolean;
  /**
   * What happens to work that was not finished on the day it was for.
   *
   * On — an unfinished task keeps its place and stays open, so nothing the user
   * wrote down is ever closed behind their back. This is the behaviour DeepWork
   * had before the choice existed, which is why it is the default.
   *
   * Off — an unfinished task whose own day has passed (its deadline when it has
   * one, otherwise the day it was written) is closed automatically at the start
   * of the next day. The day a task names then means something: a board that is
   * not finished is a board that is done, and the backlog cannot grow quietly.
   * See `TaskService.closeExpiredTasks`.
   */
  carryForwardTasks: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  workDuration: 1500,
  shortBreak: 300,
  longBreak: 900,
  sessionsBeforeLongBreak: 4,
  notificationSound: 'bell',
  notificationRepeatInterval: 60,
  alertShakeMs: DEFAULT_ALERT_SHAKE_MS,
  // Closing the window puts DeepWork in the tray rather than quitting: the
  // window is easy to reopen (the tray icon, or the app again), while a timer
  // that was quit by accident is not, and the tray menu's Exit is one click away
  // for anyone who really is finished.
  trayBehavior: 'minimize',
  theme: 'system',
  // Both are opt-in: nothing changes the user's desktop until they ask for it.
  startWithSystem: false,
  alwaysOnTop: false,
  desktopPrefsPrompted: false,
  // Off by default: a reminder is something the user asks for, never something
  // the app starts doing to them.
  waterReminders: false,
  waterStart: DEFAULT_WATER_START,
  waterEnd: DEFAULT_WATER_END,
  waterIntervalMinutes: DEFAULT_WATER_INTERVAL_MINUTES,
  waterAmountMl: DEFAULT_WATER_AMOUNT_ML,
  waterGoalMl: DEFAULT_WATER_GOAL_ML,
  // On by default: the mini widget is the user saying "leave me alone", so the
  // reminder counts the glass rather than asking for it.
  waterAutoLogWhenMinimized: true,
  // On by default: this is what the app did before the choice existed, and
  // closing someone's work for them is the kind of thing that has to be asked
  // for. Turning it off is what an empty-every-morning board looks like.
  carryForwardTasks: true,
};
