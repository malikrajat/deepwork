/**
 * How hard a standing reminder insists.
 *
 * The three names are the user's choice at the moment of writing it down, not a
 * technical setting: `gentle` is a note that can wait half an hour, `steady` is
 * an ordinary appointment, and `insistent` is the presentation, the class, the
 * medicine or the train. What differs is the ladder of gaps in
 * `reminder.util.ts`, never whether the reminder is allowed to give up — none of
 * them ever does. See `RHYTHM_LADDERS`.
 */
export type ReminderRhythm = 'gentle' | 'steady' | 'insistent';

/**
 * Where a reminder is in its life.
 *
 * `scheduled` means it is waiting for its time; `standing` means its time has
 * come and it is asking to be dealt with; `done` and `stopped` are the two ways
 * it can end, and they are kept apart on purpose. *Done* is the promise kept.
 * *Stopped* is the user saying "not this one after all" — an honest outcome
 * that should not be counted as an achievement.
 */
export type ReminderStatus = 'scheduled' | 'standing' | 'done' | 'stopped';

/**
 * One thing the user does not want to carry in their head.
 *
 * A standing reminder is deliberately a small record: a sentence, a place to
 * add context, a moment, a rhythm and the bookkeeping that proves it has been
 * asking. It is not a task — it has no quadrant, no project and no completion
 * semantics beyond "handled" — because the things this feature exists for
 * (a presentation, a class, a dose, a call) are often not work at all.
 */
export interface StandingReminder {
  /** Stable id; the notification tag and the storage key both derive from it. */
  id: string;
  /** What it is, in the user's own words. Trimmed and length-capped on creation. */
  title: string;
  /** A line of context — the room, the link, the dose. May be empty. */
  note: string;
  /** When it first came due, as an ISO timestamp. Never rewritten by a repeat. */
  dueAt: string;
  /** How insistently it repeats until answered. */
  rhythm: ReminderRhythm;
  /** Where it is in its life. */
  status: ReminderStatus;
  /** When it was written down. */
  createdAt: string;
  /** How many times it has asked. The zero state is "never rang". */
  fireCount: number;
  /** When it last asked, as an ISO timestamp, or null before its first ring. */
  lastRangAt: string | null;
  /** How many times the user moved it on rather than answering it. */
  snoozes: number;
  /** When it ended — done or stopped — as an ISO timestamp. */
  finishedAt: string | null;
}

/** What the page's form collects before the reminder exists. */
export interface ReminderDraft {
  title: string;
  note?: string;
  /** The first moment it should ask. */
  dueAt: Date;
  rhythm: ReminderRhythm;
}
