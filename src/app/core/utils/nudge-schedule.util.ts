/**
 * When today's reminders are allowed to arrive.
 *
 * The question the app is answering is not "how often" but "at which moments",
 * because a reminder that arrives while somebody is mid-session is a reminder
 * they will remember as an interruption rather than as help. So a day's plan is
 * made once, in the morning, as a handful of clock times spread across the
 * working day, and the question at every tick is only whether one of them has
 * come round.
 *
 * Three properties are deliberate:
 *
 * - **The plan is derived from the date, not stored.** A plan that lives in
 *   storage can be lost, doubled, or left over from yesterday; a pure function
 *   of the day's own name cannot. The same day always produces the same times,
 *   so a reload does not re-roll the reminders, and a test can pin down exactly
 *   what "today" looks like.
 * - **The times are spaced.** Each one gets a slot of the day, and a minimum gap
 *   keeps two from landing on top of each other once the slots are shuffled
 *   within.
 * - **A missed reminder is dropped, not queued.** An app that was closed for
 *   three hours has not earned three reminders on the way back; only a plan
 *   entry that came round while the app was actually running is delivered, and
 *   the rest are counted as passed (see {@link dueNudge}).
 */

/** One day's reminder times, as minutes past local midnight. */
export interface NudgePlan {
  /** `YYYY-MM-DD`, local. */
  day: string;
  /** When the startup reminder may arrive, ascending. */
  startup: number[];
  /** When the taskbar-pin reminder may arrive, ascending. */
  pin: number[];
}

/** The reminder window: the part of the day a work reminder can belong to. */
const WINDOW_START = 9 * 60 + 30;
const WINDOW_END = 20 * 60 + 30;

/** How many times each reminder may arrive in a day. */
export const STARTUP_NUDGES_PER_DAY = { min: 4, max: 5 } as const;
export const PIN_NUDGES_PER_DAY = 3;

/** The smallest gap between two reminders of the same kind, in minutes. */
const STARTUP_MIN_GAP = 75;
const PIN_MIN_GAP = 150;

/** How far apart a pin reminder must stay from a startup one, in minutes. */
const CROSS_GAP = 25;

/** The local date as `YYYY-MM-DD`, which is the seed the plan is made from. */
export function localDayKey(at: Date): string {
  const year = at.getFullYear();
  const month = `${at.getMonth() + 1}`.padStart(2, '0');
  const day = `${at.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Minutes past local midnight, including the seconds as a fraction. */
export function minutesOfDay(at: Date): number {
  return at.getHours() * 60 + at.getMinutes() + at.getSeconds() / 60;
}

/** The plan for one local day. Pure: the same day always gives the same times. */
export function nudgePlanFor(day: string): NudgePlan {
  const startupCount =
    STARTUP_NUDGES_PER_DAY.min +
    (hashString(`${day}:count`) % (STARTUP_NUDGES_PER_DAY.max - STARTUP_NUDGES_PER_DAY.min + 1));

  const startup = spread(
    seededRandom(`${day}:startup`),
    startupCount,
    WINDOW_START,
    WINDOW_END,
    STARTUP_MIN_GAP,
  );
  const pin = spread(
    seededRandom(`${day}:pin`),
    PIN_NUDGES_PER_DAY,
    WINDOW_START + 45,
    WINDOW_END - 30,
    PIN_MIN_GAP,
  ).map((time) => keepApart(time, startup, CROSS_GAP));

  return { day, startup, pin };
}

/**
 * Which planned reminder is due now, and what the fired count becomes.
 *
 * `fired` is the number of entries that have already been dealt with — either
 * delivered, or passed while the app was not running. Entries older than the
 * grace window are stepped over without being delivered, which is what makes a
 * launch after a long absence quiet; an entry inside the window is due, and the
 * caller decides whether this is a moment to interrupt.
 *
 * A due entry is *not* advanced here: the caller advances it once it has
 * actually delivered or deliberately dropped the reminder. That is what lets a
 * paused user receive the reminder they were owed when the pause ends, instead
 * of losing it to the pause.
 */
export function dueNudge(
  times: readonly number[],
  fired: number,
  nowMinute: number,
  graceMinutes = 150,
): { fired: number; dueIndex: number | null } {
  let index = Math.max(0, Math.min(fired, times.length));
  while (index < times.length && times[index] < nowMinute - graceMinutes) {
    index += 1;
  }
  if (index < times.length && times[index] <= nowMinute) {
    return { fired: index, dueIndex: index };
  }
  return { fired: index, dueIndex: null };
}

/** Moves one time away from every time in `others`, staying inside the window. */
function keepApart(time: number, others: readonly number[], gap: number): number {
  let candidate = time;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const nearest = others.reduce(
      (closest, other) =>
        Math.abs(other - candidate) < Math.abs(closest - candidate) ? other : closest,
      others[0] ?? Number.MAX_SAFE_INTEGER,
    );
    if (Math.abs(nearest - candidate) >= gap) return candidate;
    // Move to the far side of the reminder it collided with, and keep going in
    // the same direction so two shifts cannot undo each other.
    candidate += candidate >= nearest ? gap : -gap;
    candidate = Math.min(WINDOW_END, Math.max(WINDOW_START, candidate));
  }
  return candidate;
}

/**
 * `count` times spread across `[start, end]`, each inside its own slot and at
 * least `minGap` from the one before.
 */
function spread(
  random: () => number,
  count: number,
  start: number,
  end: number,
  minGap: number,
): number[] {
  const slot = (end - start) / count;
  const times: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const lower = start + index * slot;
    const upper = start + (index + 1) * slot;
    let time = Math.round(lower + random() * Math.max(0, upper - lower - 1));
    const previous = times[times.length - 1];
    if (previous !== undefined) time = Math.max(time, previous + minGap);
    times.push(Math.min(end, Math.max(start, time)));
  }

  return times;
}

/** A deterministic stream of numbers for one name. */
function seededRandom(seed: string): () => number {
  let state = hashString(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a, 32-bit: small, stable and good enough to name a day. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
