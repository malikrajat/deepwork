import { TaskQuadrant } from '../models/task.model';
import { QUADRANT_CONFIG } from '../constants/theme.constants';
import { MinuteOfDay, SNAP_MINUTES } from '../models/schedule.model';

/** Quadrants in execution order: Q1 → Q2 → Q3 → Q4. */
export const QUADRANT_ORDER: readonly TaskQuadrant[] = (
  Object.keys(QUADRANT_CONFIG) as TaskQuadrant[]
).sort((a, b) => QUADRANT_CONFIG[a].sortOrder - QUADRANT_CONFIG[b].sortOrder);

/** Day keys follow the convention already used by the tasks feature (UTC). */
export function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return dayKey(d);
}

/** Monday-first week start for a day key. */
export function weekStart(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  return addDays(key, -shift);
}

export function formatMinute(min: number): string {
  const clamped = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseTimeInput(value: string): MinuteOfDay | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function snapMinute(min: number, step: number = SNAP_MINUTES): number {
  return Math.round(min / step) * step;
}

export function clampMinute(min: number): MinuteOfDay {
  return Math.max(0, Math.min(24 * 60 - SNAP_MINUTES, snapMinute(min)));
}

export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}
