import { QUADRANT_CONFIG } from '../constants/theme.constants';
import { TaskQuadrant } from '../models/task.model';

/**
 * The task editor is one place, and this is the link that can still name it.
 *
 * DeepWork edits a task in exactly one place: the slide-in panel that lives in
 * the app shell. Every page opens it over itself through `TaskEditorService` —
 * a card on Today, a card in the Eisenhower Matrix, a rail card on the Calendar
 * and the Dashboard's current-focus card all mean the same thing, and none of
 * them moves the user to another route to say it. What a page was reading, how
 * far it was scrolled and what it was filtered to are still there behind the
 * panel, and are still there when it closes.
 *
 * A `/tasks` address can still name a task or ask for the add form. Nothing in
 * the app writes one any more — the panel makes that unnecessary — but a link is
 * an address: one bookmarked, shared, or handed over from an older version still
 * answers, and {@link parseTaskDeepLink} is how the Tasks page reads it.
 *
 * The reading has to be forgiving. A deadline is only pre-filled when it is a
 * real calendar day that is not in the past (the form's own validator refuses
 * the past, so a stale link must not leave the Add form red before the user has
 * typed anything), and a quadrant is only pre-filled when it is one of the four
 * the app knows.
 */

/** What a `/tasks` link asked for. */
export interface TaskDeepLink {
  /** Task the route named, or null when it named none. */
  editId: string | null;
  /** Whether the route asked for the add form. */
  add: boolean;
  /** Deadline to pre-fill, or '' to keep the form's own default (today). */
  deadline: string;
  /** Quadrant to pre-fill, or null to keep the default (unassigned). */
  quadrant: TaskQuadrant | null;
  /** Whether the task about to be created also belongs on today's list. */
  addToToday: boolean;
  /** Whether the route carried any of these parameters at all. */
  present: boolean;
}

/** The parameters the Tasks page answers to — what a deep link may clear. */
export const TASK_LINK_PARAMS = ['edit', 'add', 'date', 'quadrant', 'today'] as const;

const QUADRANTS = Object.keys(QUADRANT_CONFIG) as TaskQuadrant[];
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Is this `YYYY-MM-DD` a day that exists?
 *
 * `2026-02-30` looks like a date and is not one; a pre-filled deadline has to be
 * something the date field can hold, so the parts are read back from a real
 * `Date` instead of being trusted because they are digits.
 */
function isRealDay(value: string): boolean {
  const match = ISO_DAY.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Today as `YYYY-MM-DD` in the user's own timezone (not UTC). */
function todayIso(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Reads a `/tasks` deep link out of the route.
 *
 * `get` is a parameter getter (`route.snapshot.queryParamMap.get`), which keeps
 * this free of Angular and directly testable. Anything unusable is reported as
 * "not asked for" rather than as an error: a link that names a past date should
 * open the ordinary form, not a form that is already complaining.
 */
export function parseTaskDeepLink(
  get: (name: string) => string | null,
  now = new Date(),
): TaskDeepLink {
  const editId = (get('edit') ?? '').trim();
  const rawDate = (get('date') ?? '').trim();
  const rawQuadrant = (get('quadrant') ?? '').trim();
  const today = todayIso(now);

  return {
    editId: editId || null,
    add: get('add') === '1',
    deadline: isRealDay(rawDate) && rawDate >= today ? rawDate : '',
    quadrant: QUADRANTS.includes(rawQuadrant as TaskQuadrant)
      ? (rawQuadrant as TaskQuadrant)
      : null,
    addToToday: get('today') === '1',
    present: TASK_LINK_PARAMS.some((name) => get(name) !== null),
  };
}
