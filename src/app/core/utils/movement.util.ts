/**
 * The stand-and-walk reminder's arithmetic and its daily why-line.
 *
 * All of it is pure — no clock of its own, no storage, no timers — so the
 * service that *does* hold a timer stays a thin loop over these answers. The
 * time-of-day helpers are the water reminder's, deliberately: two reminders that
 * disagreed about what "09:00–18:00" means would be two reminders with two
 * different ideas of the working day.
 */

import type { AppSettings } from '../models/settings.model';
import type { MovementPrefs } from '../models/movement.model';
import { MOVEMENT_WHY } from '../constants/movement.constants';

/**
 * The four stored movement settings, gathered into the one object the feature
 * uses.
 *
 * The record keeps them as flat columns (they are written to the database one
 * field at a time) while everything downstream — the reminder, the cards, the
 * tests — passes one `MovementPrefs` around.
 */
export function movementPrefsOf(settings: AppSettings): MovementPrefs {
  return {
    enabled: settings.movementReminders,
    start: settings.movementStart,
    end: settings.movementEnd,
    intervalMinutes: settings.movementIntervalMinutes,
  };
}

/**
 * The why-line the dashboard and Settings show, chosen by the local day.
 *
 * Deterministic rather than random: the same day always reads back the same
 * sentence, so the card does not change under the user on every render, and the
 * text can be pinned down in a test. It is not part of the quote rotation —
 * showing a quote on the card would otherwise consume the line the next
 * notification was meant to carry.
 */
export function movementWhyFor(date: Date = new Date()): string {
  const count = MOVEMENT_WHY.length;
  if (count === 0) return '';

  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86_400_000);
  const index = ((dayOfYear % count) + count) % count;
  return MOVEMENT_WHY[index];
}
