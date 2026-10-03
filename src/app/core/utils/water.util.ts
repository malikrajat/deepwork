/**
 * The water feature's arithmetic: how a target reads, when a reminder may fire,
 * and when the day's tally starts over.
 *
 * All of it is pure — no clock of its own, no storage, no timers — so the
 * service that *does* hold a timer stays a thin loop over these answers, and
 * every rule here can be pinned down exactly in a test.
 */

import type { AppSettings } from '../models/settings.model';
import type { WaterPrefs } from '../models/water.model';
import { WATER_QUOTES } from '../constants/water.constants';

/**
 * The six stored water settings, gathered into the one object the feature uses.
 *
 * The record keeps them as flat columns (they are written to the database one
 * field at a time) while everything downstream — the reminder, the card, the
 * tests — passes one `WaterPrefs` around.
 */
export function waterPrefsOf(settings: AppSettings): WaterPrefs {
  return {
    enabled: settings.waterReminders,
    start: settings.waterStart,
    end: settings.waterEnd,
    intervalMinutes: settings.waterIntervalMinutes,
    amountMl: settings.waterAmountMl,
    goalMl: settings.waterGoalMl,
    autoLogWhenMinimized: settings.waterAutoLogWhenMinimized,
  };
}

/**
 * `500` → `500 ml`; `1500` → `1.5 L`; `2000` → `2 L`.
 *
 * Litres once the number is big enough to read better that way, with one
 * decimal only when it says something (`1.5 L`, never `1.0 L`).
 */
export function formatMillilitres(millilitres: number): string {
  if (!Number.isFinite(millilitres) || millilitres <= 0) return '0 ml';
  if (millilitres < 1000) return `${Math.round(millilitres)} ml`;

  const litres = millilitres / 1000;
  const rounded = Math.round(litres * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} L`;
}

/**
 * `'09:30'` → `570` (minutes past midnight), or null for anything else.
 *
 * A time that cannot be read is treated as "no window" by the caller rather
 * than silently becoming midnight, which would move every reminder in the day.
 */
export function parseTimeOfDay(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/** The minute of the local day `date` falls in (0–1439). */
export function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * `Date` → `'14:05'`, in the user's own timezone.
 *
 * Written out rather than taken from `toLocaleTimeString`, so a reminder time
 * reads the same in every webview and in every test.
 */
export function formatClockTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * True when `minute` is inside the window `start`–`end` (inclusive).
 *
 * An `end` at or before `start` wraps midnight — 22:00–06:00 is a night shift,
 * not an empty window — and a window with no length at all (`start === end`)
 * counts as closed, so a stray setting can never mean "remind constantly".
 */
export function isWithinHours(minute: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return minute >= start && minute <= end;
  return minute >= start || minute <= end;
}

/**
 * When the window that contains `from` closes.
 *
 * `from` is expected to be inside the window; for a window that wraps midnight
 * the close belongs to the next calendar day.
 */
export function windowClose(from: Date, start: number, end: number): Date {
  const close = new Date(from);
  close.setSeconds(0, 0);
  close.setHours(Math.floor(end / 60), end % 60, 0, 0);

  // A window that wraps midnight has not closed yet when the clock has.
  if (end <= start && close.getTime() <= from.getTime()) close.setDate(close.getDate() + 1);
  return close;
}

/**
 * The next moment the window opens, at or after `from`.
 *
 * Used for the "reminders resume tomorrow at 09:00" line, and to keep a
 * reminder that would land after hours from being promised inside them.
 */
export function nextWindowOpen(from: Date, start: number, end: number): Date {
  const today = new Date(from);
  today.setSeconds(0, 0);
  today.setHours(Math.floor(start / 60), start % 60, 0, 0);

  if (isWithinHours(minuteOfDay(from), start, end)) return from;
  if (today.getTime() > from.getTime()) return today;

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

/**
 * Local midnight of `date` — the instant today's tally starts from.
 *
 * Deliberately local, unlike the UTC `dayKey` the task list groups by: a water
 * count that reset at 05:30 in the morning for someone in India would be wrong
 * in a way the user would notice.
 */
export function localDayStart(date: Date = new Date()): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Rounds a millilitre total to a whole number, never below zero. */
export function sanitiseAmount(millilitres: number): number {
  if (!Number.isFinite(millilitres)) return 0;
  return Math.max(0, Math.round(millilitres));
}

/**
 * The motivational line shown for the `index`-th reminder.
 *
 * The reminder walks the list in order rather than picking at random — the same
 * index always reads back the same sentence, in every webview and every test —
 * and the index wraps in both directions, so a counter that has run for weeks
 * still lands inside the list. An unreadable index falls back to the first line
 * rather than to nothing at all.
 */
export function quoteFor(index: number): string {
  const count = WATER_QUOTES.length;
  if (count === 0) return '';

  const at = Math.trunc(index);
  if (!Number.isFinite(at)) return WATER_QUOTES[0];

  return WATER_QUOTES[((at % count) + count) % count];
}
