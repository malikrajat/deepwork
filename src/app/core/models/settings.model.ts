import {
  DEFAULT_WATER_AMOUNT_ML,
  DEFAULT_WATER_END,
  DEFAULT_WATER_GOAL_ML,
  DEFAULT_WATER_INTERVAL_MINUTES,
  DEFAULT_WATER_START,
} from '../constants/water.constants';
import {
  DEFAULT_MOVEMENT_END,
  DEFAULT_MOVEMENT_INTERVAL_MINUTES,
  DEFAULT_MOVEMENT_START,
} from '../constants/movement.constants';
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
  /**
   * Whether the first-run "start with Windows?" dialog has been shown.
   *
   * A flag of its own rather than reusing `desktopPrefsPrompted`: the two
   * dialogs answer different questions and are retired for different reasons.
   * The prefs dialog is retired by being read; this one is retired by the
   * answer to it — on, or "not now" — and only the second of those starts the
   * reminders. One flag for both would make closing the older dialog count as
   * an answer to the newer question.
   */
  launchPrompted: boolean;
  /**
   * Whether the app may still remind the user to start DeepWork with the
   * computer, four or five times a day, after the first-run dialog was
   * dismissed without turning it on.
   *
   * On by default, because the reminder is the whole point of the dialog
   * having been dismissible; the switch exists so "not now" never has to mean
   * "not ever" and a user who has decided against it can say so once.
   */
  startupNudge: boolean;
  /**
   * Whether the app may remind the user to pin DeepWork to the taskbar, three
   * times a day, while it is not pinned there.
   *
   * The reminder can only ever ask: Windows will not let an app pin itself
   * without a feature token no ordinary build has, so the toast explains the
   * two clicks and the app checks whether they happened before it speaks again.
   */
  taskbarPinNudge: boolean;
  /**
   * Nudge the user to drink water during their working hours.
   *
   * Off by default. DeepWork is a focus app, and a bell every hour is the first
   * thing that makes a focused desk feel noisy; the reminder is a feature to opt
   * into, not one to opt out of. When it is off the app still offers it — a
   * persistent prompt every two hours in the working window, with one-click
   * setup — so the feature is discoverable without being imposed.
   */
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
   * Whether a reminder that arrives while the window is minimised is asked
   * without bringing the full window back.
   *
   * Minimising DeepWork is a deliberate "do not disturb me": someone who has
   * shrunk the app into the mini widget is working in another window, and the
   * reminder has no business pulling the full one back over it. With this on,
   * the reminder rings and asks on the system notification, whose **Yes** and
   * **Not now** buttons the desktop can report, so the question still gets an
   * answer and the widget stays put. On a system whose notifications cannot
   * carry the buttons the drink is counted instead, because a question with no
   * answerer would hold the cadence forever. With this off, the window comes
   * back with the card as it always did.
   */
  waterAutoLogWhenMinimized: boolean;
  /**
   * Nudge the user to stand up and walk during their working hours.
   *
   * Off by default, for the same reason the water reminder is: a focus app that
   * rings every forty-five minutes is working against the focus it exists to
   * protect. The feature stays available, and the app offers it with a persistent
   * two-hourly prompt rather than turning it on for everyone.
   *
   * A desk job is a seated job: the damage is not one long sitting but the
   * hours that pass without a reason to leave the chair. Once enabled, the
   * reminder asks rather than announces — it carries a quote and two answers,
   * and nothing else closes it — and its bell repeats until one of them is
   * pressed.
   */
  movementReminders: boolean;
  /** `HH:MM` local time — the first minute a movement reminder may fire. */
  movementStart: string;
  /** `HH:MM` local time — the last minute a movement reminder may fire. */
  movementEnd: string;
  /** Minutes between movement reminders; see `MOVEMENT_INTERVAL_OPTIONS`. */
  movementIntervalMinutes: number;
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
  // The launch dialog has not been shown yet in this install, and both of the
  // reminders that follow it are wanted: a dialog that can be dismissed only
  // matters if the dismissal is followed by a quieter version of the same
  // question. See `LaunchPromptService`.
  launchPrompted: false,
  startupNudge: true,
  taskbarPinNudge: true,
  // Off by default: a focus app does not ring every hour uninvited. The feature
  // is offered instead — `BodyReminderPromptService` shows a persistent, sticky
  // prompt every two hours while it is off, with one-click setup and a one-click
  // way to stop the offers.
  waterReminders: false,
  waterStart: DEFAULT_WATER_START,
  waterEnd: DEFAULT_WATER_END,
  waterIntervalMinutes: DEFAULT_WATER_INTERVAL_MINUTES,
  waterAmountMl: DEFAULT_WATER_AMOUNT_ML,
  waterGoalMl: DEFAULT_WATER_GOAL_ML,
  // On by default: the mini widget is the user saying "leave me alone", so the
  // reminder counts the glass rather than asking for it.
  waterAutoLogWhenMinimized: true,
  // Off by default, for the same reason the water reminder is: the reminder is
  // noise until the user asks for it, and the offer to turn it on is what makes
  // it discoverable. See `BodyReminderPromptService`.
  movementReminders: false,
  movementStart: DEFAULT_MOVEMENT_START,
  movementEnd: DEFAULT_MOVEMENT_END,
  movementIntervalMinutes: DEFAULT_MOVEMENT_INTERVAL_MINUTES,
  // On by default: this is what the app did before the choice existed, and
  // closing someone's work for them is the kind of thing that has to be asked
  // for. Turning it off is what an empty-every-morning board looks like.
  carryForwardTasks: true,
};
