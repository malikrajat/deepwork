import {
  REMINDER_NOTE_MAX,
  REMINDER_QUOTES,
  REMINDER_TITLE_MAX,
  RHYTHM_LADDERS,
  RHYTHM_LABELS,
} from '../constants/reminder.constants';
import {
  ReminderDraft,
  ReminderRhythm,
  ReminderStatus,
  StandingReminder,
} from '../models/reminder.model';

/** The statuses that have not ended yet. */
const OPEN_STATUSES: readonly ReminderStatus[] = ['standing', 'scheduled'];

/** The rhythms, as a list, so an unknown string can be rejected without casting. */
const RHYTHMS: readonly ReminderRhythm[] = ['gentle', 'steady', 'insistent'];

/** The statuses, for the same reason. */
const STATUSES: readonly ReminderStatus[] = ['scheduled', 'standing', 'done', 'stopped'];

/**
 * A title as it is stored: trimmed, inner runs collapsed, and capped.
 *
 * The collapse matters more than it looks. A reminder arrives as a notification
 * title and as a row in a list, and a title pasted from a chat with three spaces
 * and a newline in it reads as a paragraph in both. Keeping one shape means the
 * title that is searched, sorted and compared is the title that is shown.
 */
export function cleanTitle(value: string): string {
  return collapse(value).slice(0, REMINDER_TITLE_MAX);
}

/** A note as it is stored: one line, trimmed, capped. Empty is allowed. */
export function cleanNote(value: string): string {
  return collapse(value).slice(0, REMINDER_NOTE_MAX);
}

/** Trims and collapses every run of whitespace — including newlines — to one space. */
function collapse(value: string): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reads the page's two fields as the one moment they mean.
 *
 * A `date` input and a `time` input are two strings, and the browser's own
 * `Date` parser is not the one to hand them to: `new Date('2026-10-19')` is UTC
 * midnight, which is the previous evening for anyone west of Greenwich. The
 * fields are local, so the moment is built from local parts and then checked by
 * round-trip — `2026-02-31` is not a date, but `new Date` would happily roll it
 * into March.
 *
 * Returns null when either field is missing or the pair is not a real local
 * moment, which is what lets the form say "pick a time" instead of guessing.
 */
export function parseDueAt(date: string, time: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? '').trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(time ?? '').trim());
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  if (hours > 23 || minutes > 59 || month < 1 || month > 12 || day < 1) return null;

  const at = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    at.getFullYear() !== year ||
    at.getMonth() !== month - 1 ||
    at.getDate() !== day ||
    at.getHours() !== hours ||
    at.getMinutes() !== minutes
  ) {
    return null;
  }
  return at;
}

/**
 * Builds the record from what the form collected.
 *
 * The rhythm is trusted here because the form only ever offers the three real
 * ones; the function is still total so a caller from a test or a future import
 * cannot produce a reminder that the rest of the feature cannot read.
 */
export function createReminder(draft: ReminderDraft, now: Date, id: string): StandingReminder {
  return {
    id,
    title: cleanTitle(draft.title),
    note: cleanNote(draft.note ?? ''),
    dueAt: draft.dueAt.toISOString(),
    rhythm: RHYTHMS.includes(draft.rhythm) ? draft.rhythm : 'steady',
    status: 'scheduled',
    createdAt: now.toISOString(),
    fireCount: 0,
    lastRangAt: null,
    snoozes: 0,
    finishedAt: null,
  };
}

/** True while the reminder has not been answered or stopped. */
export function isOpen(reminder: StandingReminder): boolean {
  return OPEN_STATUSES.includes(reminder.status);
}

/**
 * True when a scheduled reminder's moment has arrived.
 *
 * A reminder that is already `standing` is not "due" again — it is asking, and
 * its next ring is decided by {@link nextRingAt}. Keeping the two apart is what
 * stops the page and the service from disagreeing about whether a reminder has
 * been delivered.
 */
export function isDue(reminder: StandingReminder, now: Date): boolean {
  if (reminder.status !== 'scheduled') return false;
  const due = Date.parse(reminder.dueAt);
  return Number.isFinite(due) && due <= now.getTime();
}

/**
 * The gap before the next ring, in minutes.
 *
 * `fireCount` is how many times it has already rung, so a reminder that has
 * rung once waits the ladder's first entry, and a reminder that has rung more
 * times than the ladder has entries waits its last one forever. The ladder is
 * the promise: it never grows past the longest gap the user chose a rhythm for,
 * so "insistent" never quietly becomes "silent for a day".
 */
export function ringDelayMinutes(rhythm: ReminderRhythm, fireCount: number): number {
  const ladder = RHYTHM_LADDERS[rhythm] ?? RHYTHM_LADDERS.steady;
  const index = Math.max(0, Math.min(ladder.length - 1, Math.floor(fireCount) - 1));
  return ladder[index] ?? ladder[ladder.length - 1] ?? 10;
}

/**
 * When this reminder should ask again, or null when it is not going to.
 *
 * A scheduled reminder's answer is its own moment. A standing one measures from
 * the last time it actually rang — not from its original due time — because the
 * user may have snoozed it, or answered another reminder first, and the gap the
 * rhythm promises is a gap between rings rather than a gap between appointments.
 */
export function nextRingAt(reminder: StandingReminder): Date | null {
  if (reminder.status === 'scheduled') {
    const due = Date.parse(reminder.dueAt);
    return Number.isFinite(due) ? new Date(due) : null;
  }
  if (reminder.status !== 'standing') return null;

  const base = reminder.lastRangAt ? Date.parse(reminder.lastRangAt) : Date.parse(reminder.dueAt);
  if (!Number.isFinite(base)) return null;
  return new Date(
    base + ringDelayMinutes(reminder.rhythm, Math.max(1, reminder.fireCount)) * 60_000,
  );
}

/**
 * The list's order: what is asking now, then what is coming, then what has ended.
 *
 * Within the open reminders the order is the clock's own — the thing that has
 * been waiting longest is read first — and the ended ones are newest-first, so
 * the just-finished item is where the eye lands after answering it.
 */
export function sortReminders(reminders: readonly StandingReminder[]): StandingReminder[] {
  const rank = (reminder: StandingReminder): number => {
    if (reminder.status === 'standing') return 0;
    if (reminder.status === 'scheduled') return 1;
    return 2;
  };
  return [...reminders].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    if (rank(a) === 2) {
      return (
        (Date.parse(b.finishedAt ?? b.dueAt) || 0) - (Date.parse(a.finishedAt ?? a.dueAt) || 0)
      );
    }
    return (Date.parse(a.dueAt) || 0) - (Date.parse(b.dueAt) || 0);
  });
}

/** The rhythm's name, for a row or a card. */
export function rhythmLabel(rhythm: ReminderRhythm): string {
  return RHYTHM_LABELS[rhythm]?.label ?? 'Steady';
}

/** `first ask`, `2nd ask`, `3rd ask` — the count a card shows in its eyebrow. */
export function askLabel(fireCount: number): string {
  const count = Math.max(1, Math.floor(fireCount));
  const suffix =
    count % 100 >= 11 && count % 100 <= 13
      ? 'th'
      : count % 10 === 1
        ? 'st'
        : count % 10 === 2
          ? 'nd'
          : count % 10 === 3
            ? 'rd'
            : 'th';
  return count === 1 ? 'first ask' : `${count}${suffix} ask`;
}

/**
 * What the card and the notification say about one ring.
 *
 * A reminder that was missed while the app was closed is told the truth: it
 * says when it was due, because the user is owed the difference between "it is
 * time" and "it was time an hour ago". The user's note is appended as a
 * sentence of its own so their words are never buried inside the app's.
 */
export function reminderBody(reminder: StandingReminder, now: Date): string {
  const due = new Date(reminder.dueAt);
  const overdueMinutes = Math.floor((now.getTime() - due.getTime()) / 60_000);
  const missed = reminder.fireCount === 1 && overdueMinutes >= 2;

  let line: string;
  if (missed) {
    line = `It was due at ${clockTime(due)}. We kept it for you.`;
  } else if (reminder.fireCount === 1) {
    line = 'It is time.';
  } else {
    line = `Still standing — reminder ${reminder.fireCount}.`;
  }

  return reminder.note ? `${line} ${reminder.note}` : line;
}

/** The rhythm's one-line explanation, for the form. */
export function rhythmHint(rhythm: ReminderRhythm): string {
  return RHYTHM_LABELS[rhythm]?.hint ?? RHYTHM_LABELS.steady.hint;
}

/** The quote for this ring, walked one per ring so it does not repeat immediately. */
export function quoteForRing(fireCount: number): string {
  if (REMINDER_QUOTES.length === 0) return '';
  const index = Math.max(0, Math.floor(fireCount) - 1) % REMINDER_QUOTES.length;
  return REMINDER_QUOTES[index] ?? REMINDER_QUOTES[0] ?? '';
}

/** `15:04`, from a local date. */
export function clockTime(at: Date): string {
  return `${`${at.getHours()}`.padStart(2, '0')}:${`${at.getMinutes()}`.padStart(2, '0')}`;
}

/** The day a moment belongs to, in local time, as a comparable number. */
function localDay(at: Date): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}

/**
 * When a reminder is for, in words short enough for a row.
 *
 * "Today · 15:00" is the whole of what a user needs at a glance; a full date is
 * noise for the common case and essential for the uncommon one, so the label
 * changes shape rather than always carrying both.
 */
export function dueLabel(iso: string, now: Date): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return '';

  const day = Math.round((localDay(at) - localDay(now)) / 86_400_000);
  const time = clockTime(at);
  if (day === 0) return `Today · ${time}`;
  if (day === 1) return `Tomorrow · ${time}`;
  if (day === -1) return `Yesterday · ${time}`;

  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(at);
  return `${date} · ${time}`;
}

/**
 * How long until a moment, in words.
 *
 * Under a minute is "now" rather than "in 0 min": a countdown that reads zero
 * while the reminder has not appeared yet is the one thing that makes a careful
 * feature look broken.
 */
export function countdownLabel(iso: string, now: Date): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  return countdownFromMs(at - now.getTime());
}

/** The same, from a duration in milliseconds — `countdownLabel` without a date. */
export function countdownFromMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 60_000) return 'now';

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `in ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `in ${hours} h` : `in ${hours} h ${rest} min`;

  const days = Math.floor(hours / 24);
  const hoursLeft = hours % 24;
  return hoursLeft === 0 ? `in ${days} d` : `in ${days} d ${hoursLeft} h`;
}

/**
 * One or two sentences about the whole list, for the page's header.
 *
 * The page is a list first and a reading second, so this never repeats what the
 * rows already say. It answers the one question the rows cannot: *is anything
 * waiting for me right now, and what is next?*
 */
export function reminderReading(reminders: readonly StandingReminder[], now: Date): string {
  const open = reminders.filter(isOpen);
  const standing = open.filter((reminder) => reminder.status === 'standing');
  const scheduled = open
    .filter((reminder) => reminder.status === 'scheduled')
    .sort((a, b) => (Date.parse(a.dueAt) || 0) - (Date.parse(b.dueAt) || 0));

  if (standing.length > 0) {
    const first = standing[0];
    if (!first) return 'Something is standing right now.';
    const since = first.lastRangAt ? clockTime(new Date(first.lastRangAt)) : clockTime(now);
    const rest = standing.length > 1 ? ` ${standing.length - 1} more waiting behind it.` : '';
    return `${first.title} is standing now — it has been asking since ${since}.${rest}`;
  }

  const next = scheduled[0];
  if (next) {
    return `Nothing standing. Next is ${next.title}, ${dueLabel(next.dueAt, now).toLowerCase()}.`;
  }

  const done = reminders.filter((reminder) => reminder.status === 'done').length;
  if (done > 0) {
    return `Nothing standing. ${done} ${done === 1 ? 'promise' : 'promises'} kept so far.`;
  }
  return 'Nothing standing. Write one down and we will keep it in front of you.';
}

/**
 * Reads one stored record, or null when it is not one.
 *
 * The list lives in storage, and storage is the one input this feature cannot
 * control: a device that lost power mid-write, a hand-edited value, or a build
 * that once wrote a shape this one no longer knows. A bad row is dropped rather
 * than thrown, because a reminder feature that crashes on startup is worse than
 * one that forgot a reminder — and the rest of the list is still worth keeping.
 */
export function parseReminder(value: unknown): StandingReminder | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  const id = typeof record['id'] === 'string' ? record['id'] : '';
  const title = typeof record['title'] === 'string' ? cleanTitle(record['title']) : '';
  if (id === '' || title === '') return null;

  const status = record['status'];
  if (typeof status !== 'string' || !STATUSES.includes(status as ReminderStatus)) return null;

  const rhythm = record['rhythm'];
  if (typeof rhythm !== 'string' || !RHYTHMS.includes(rhythm as ReminderRhythm)) return null;

  const dueAt = isoOrNull(record['dueAt']);
  const createdAt = isoOrNull(record['createdAt']) ?? dueAt;
  if (dueAt === null || createdAt === null) return null;

  return {
    id,
    title,
    note: typeof record['note'] === 'string' ? cleanNote(record['note']) : '',
    dueAt,
    rhythm: rhythm as ReminderRhythm,
    status: status as ReminderStatus,
    createdAt,
    fireCount: nonNegativeInteger(record['fireCount']),
    lastRangAt: isoOrNull(record['lastRangAt']),
    snoozes: nonNegativeInteger(record['snoozes']),
    finishedAt: isoOrNull(record['finishedAt']),
  };
}

/** A stored timestamp, or null when it is not one. */
function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/** A count that can be written back, whatever was stored. */
function nonNegativeInteger(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}
