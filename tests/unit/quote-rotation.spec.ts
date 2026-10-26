import { beforeEach, describe, expect, it } from 'vitest';
import {
  NOTIFICATION_QUOTES,
  NotificationQuoteKind,
} from '../../src/app/core/constants/notification-quotes.constants';
import { BREAK_QUOTES, FOCUS_QUOTES } from '../../src/app/core/constants/alert.constants';
import { QuoteRotation } from '../../src/app/core/utils/quote-rotation';

describe('the quote decks', () => {
  it('gives every notification kind a deep deck with no repeated line', () => {
    // The complaint this answers is repetition, and repetition is only beaten by
    // depth: a deck that a working day cannot exhaust before it wraps. Each kind
    // is checked separately, so a short deck cannot hide behind a long one.
    for (const [kind, lines] of Object.entries(NOTIFICATION_QUOTES)) {
      expect(lines.length, kind).toBeGreaterThanOrEqual(20);
      expect(new Set(lines).size, kind).toBe(lines.length);
      for (const line of lines) {
        expect(line.trim(), kind).toBe(line);
        expect(line.length, kind).toBeGreaterThan(10);
      }
    }
  });
});

describe('QuoteRotation', () => {
  beforeEach(() => localStorage.clear());

  it('walks a deck in order instead of sampling it', () => {
    const rotation = new QuoteRotation();

    expect(rotation.next('focus')).toBe(FOCUS_QUOTES[0]);
    expect(rotation.next('focus')).toBe(FOCUS_QUOTES[1]);
    expect(rotation.next('focus')).toBe(FOCUS_QUOTES[2]);
  });

  it('keeps one position per kind, so a break does not advance the focus deck', () => {
    const rotation = new QuoteRotation();

    expect(rotation.next('focus')).toBe(FOCUS_QUOTES[0]);
    expect(rotation.next('break')).toBe(BREAK_QUOTES[0]);
    expect(rotation.next('focus')).toBe(FOCUS_QUOTES[1]);
    expect(rotation.next('break')).toBe(BREAK_QUOTES[1]);
  });

  it('wraps round a deck once it has been walked', () => {
    const rotation = new QuoteRotation();

    for (let i = 0; i < FOCUS_QUOTES.length; i += 1) rotation.next('focus');

    expect(rotation.next('focus')).toBe(FOCUS_QUOTES[0]);
  });

  it('remembers where each deck was between launches', () => {
    // The first message of every morning used to be the first line of every
    // deck, however many lines the deck held. The position lives in storage so
    // relaunching continues the rotation rather than restarting it.
    const first = new QuoteRotation();
    expect(first.next('focus')).toBe(FOCUS_QUOTES[0]);
    expect(first.next('focus')).toBe(FOCUS_QUOTES[1]);

    const second = new QuoteRotation();
    expect(second.next('focus')).toBe(FOCUS_QUOTES[2]);
  });

  it('says nothing for a kind with no list', () => {
    const rotation = new QuoteRotation();
    // A kind outside the catalogue is a caller's mistake, not a crash: the
    // message still goes out, it just carries no line.
    expect(rotation.next('missing' as NotificationQuoteKind)).toBe('');
  });
});
