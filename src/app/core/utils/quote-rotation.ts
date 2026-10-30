import { quoteAt } from '../constants/alert.constants';
import type { NotificationQuoteKind } from '../constants/notification-quotes.constants';
import { NOTIFICATION_QUOTES } from '../constants/notification-quotes.constants';

/** Where the position in each deck is remembered between launches. */
const STORAGE_KEY = 'deepwork.quotes.cursors.v1';

/**
 * Walks each quote deck in order, without starting over on every launch.
 *
 * A deck is long enough that repetition is not the concern of a single run; the
 * concern is the first message of every morning. Resetting to the first line at
 * startup made the same greeting follow every launch, however large the deck
 * grew. The cursor lives in storage so the tenth launch reads the tenth line,
 * and a deck that has been exhausted simply wraps.
 *
 * The walk stays deterministic rather than random for the same reason the alert
 * lists always did: the line after this one is predictable, so a test can pin it
 * down, and no two consecutive draws from the same deck can collide.
 */
export class QuoteRotation {
  private readonly cursors = new Map<NotificationQuoteKind, number>();

  constructor() {
    for (const [kind, cursor] of Object.entries(readCursors())) {
      if (typeof cursor === 'number' && Number.isFinite(cursor) && cursor >= 0) {
        this.cursors.set(kind as NotificationQuoteKind, Math.trunc(cursor));
      }
    }
  }

  /** The next line for `kind`, and the position after it for next time. */
  next(kind: NotificationQuoteKind): string {
    const quotes = NOTIFICATION_QUOTES[kind];
    if (!quotes || quotes.length === 0) return '';

    const index = this.cursors.get(kind) ?? 0;
    this.cursors.set(kind, index + 1);
    writeCursors(this.cursors);
    return quoteAt(quotes, index);
  }
}

/** Reads the stored positions, ignoring anything that is not a count. */
function readCursors(): Record<string, unknown> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Writes every deck's position, best effort. */
function writeCursors(cursors: Map<NotificationQuoteKind, number>): void {
  try {
    const record: Record<string, number> = {};
    for (const [kind, cursor] of cursors) record[kind] = cursor;
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage unavailable: this run still rotates, it just cannot remember where.
  }
}
