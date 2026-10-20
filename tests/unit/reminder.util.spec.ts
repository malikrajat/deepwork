import { describe, expect, it } from 'vitest';
import {
  askLabel,
  cleanNote,
  cleanTitle,
  clockTime,
  countdownFromMs,
  countdownLabel,
  createReminder,
  dueLabel,
  isDue,
  isOpen,
  nextRingAt,
  parseDueAt,
  parseReminder,
  quoteForRing,
  reminderBody,
  reminderReading,
  rhythmHint,
  rhythmLabel,
  ringDelayMinutes,
  sortReminders,
} from '../../src/app/core/utils/reminder.util';
import { StandingReminder } from '../../src/app/core/models/reminder.model';
import { REMINDER_QUOTES } from '../../src/app/core/constants/reminder.constants';

/** A fixed local moment, so no test depends on the machine's clock. */
const NOW = new Date(2026, 9, 19, 9, 0, 0, 0);

/** A reminder, with only the fields a test cares about overridden. */
function reminder(overrides: Partial<StandingReminder> = {}): StandingReminder {
  return {
    id: 'r1',
    title: 'Presentation',
    note: '',
    dueAt: new Date(2026, 9, 19, 9, 0).toISOString(),
    rhythm: 'steady',
    status: 'scheduled',
    createdAt: new Date(2026, 9, 18, 9, 0).toISOString(),
    fireCount: 0,
    lastRangAt: null,
    snoozes: 0,
    finishedAt: null,
    ...overrides,
  };
}

describe('reminder text cleaning', () => {
  it('collapses whitespace and newlines into one trimmed line', () => {
    expect(cleanTitle('  Presentation\n\n in   Room 4  ')).toBe('Presentation in Room 4');
  });

  it('caps a title and a note at their limits', () => {
    expect(cleanTitle('x'.repeat(200))).toHaveLength(80);
    expect(cleanNote('y'.repeat(400))).toHaveLength(160);
  });

  it('treats a missing value as empty rather than the word undefined', () => {
    expect(cleanTitle(undefined as unknown as string)).toBe('');
    expect(cleanNote(null as unknown as string)).toBe('');
  });
});

describe('parseDueAt', () => {
  it('reads a date and a time as one local moment', () => {
    const at = parseDueAt('2026-10-19', '15:04');
    expect(at?.getFullYear()).toBe(2026);
    expect(at?.getMonth()).toBe(9);
    expect(at?.getDate()).toBe(19);
    expect(at?.getHours()).toBe(15);
    expect(at?.getMinutes()).toBe(4);
  });

  it('refuses a missing or malformed field', () => {
    expect(parseDueAt('', '15:04')).toBeNull();
    expect(parseDueAt('19/10/2026', '15:04')).toBeNull();
    expect(parseDueAt('2026-10-19', '')).toBeNull();
    expect(parseDueAt('2026-10-19', '3pm')).toBeNull();
  });

  it('refuses an impossible date instead of rolling it into the next month', () => {
    expect(parseDueAt('2026-02-31', '09:00')).toBeNull();
    expect(parseDueAt('2026-13-01', '09:00')).toBeNull();
  });

  it('refuses an impossible time', () => {
    expect(parseDueAt('2026-10-19', '24:00')).toBeNull();
    expect(parseDueAt('2026-10-19', '09:60')).toBeNull();
  });
});

describe('createReminder', () => {
  it('stores a trimmed title, a trimmed note and a scheduled start', () => {
    const created = createReminder(
      {
        title: '  Presentation  ',
        note: '  Room 4  ',
        dueAt: new Date(2026, 9, 19, 15, 0),
        rhythm: 'insistent',
      },
      NOW,
      'id-1',
    );

    expect(created).toMatchObject({
      id: 'id-1',
      title: 'Presentation',
      note: 'Room 4',
      rhythm: 'insistent',
      status: 'scheduled',
      fireCount: 0,
      lastRangAt: null,
      snoozes: 0,
      finishedAt: null,
    });
    expect(created.dueAt).toBe(new Date(2026, 9, 19, 15, 0).toISOString());
    expect(created.createdAt).toBe(NOW.toISOString());
  });

  it('falls back to steady when handed a rhythm it does not know', () => {
    const created = createReminder(
      {
        title: 'Call',
        dueAt: NOW,
        rhythm: 'wild' as unknown as 'steady',
      },
      NOW,
      'id-2',
    );
    expect(created.rhythm).toBe('steady');
  });

  it('defaults a missing note to an empty one', () => {
    const created = createReminder({ title: 'Call', dueAt: NOW, rhythm: 'gentle' }, NOW, 'id-3');
    expect(created.note).toBe('');
  });
});

describe('isOpen and isDue', () => {
  it('counts only scheduled and standing reminders as open', () => {
    expect(isOpen(reminder({ status: 'scheduled' }))).toBe(true);
    expect(isOpen(reminder({ status: 'standing' }))).toBe(true);
    expect(isOpen(reminder({ status: 'done' }))).toBe(false);
    expect(isOpen(reminder({ status: 'stopped' }))).toBe(false);
  });

  it('is due at its moment, and not before', () => {
    expect(isDue(reminder(), new Date(2026, 9, 19, 8, 59))).toBe(false);
    expect(isDue(reminder(), NOW)).toBe(true);
    expect(isDue(reminder(), new Date(2026, 9, 19, 10, 0))).toBe(true);
  });

  it('is never due once it is already standing or ended', () => {
    expect(isDue(reminder({ status: 'standing' }), NOW)).toBe(false);
    expect(isDue(reminder({ status: 'done' }), NOW)).toBe(false);
  });

  it('is not due when its stored moment cannot be read', () => {
    expect(isDue(reminder({ dueAt: 'not a date' }), NOW)).toBe(false);
  });
});

describe('ringDelayMinutes', () => {
  it('walks each rhythm’s ladder and then stays on its last rung', () => {
    expect([1, 2, 3, 4, 5, 9].map((n) => ringDelayMinutes('insistent', n))).toEqual([
      3, 5, 10, 15, 20, 30,
    ]);
    expect([1, 2, 3, 4, 5].map((n) => ringDelayMinutes('steady', n))).toEqual([10, 20, 30, 45, 60]);
    expect([1, 2, 3, 4, 5].map((n) => ringDelayMinutes('gentle', n))).toEqual([
      30, 45, 60, 90, 120,
    ]);
    expect(ringDelayMinutes('gentle', 50)).toBe(120);
  });

  it('reads a zero or negative count as the first rung', () => {
    expect(ringDelayMinutes('insistent', 0)).toBe(3);
    expect(ringDelayMinutes('insistent', -4)).toBe(3);
  });
});

describe('nextRingAt', () => {
  it('returns the due moment for a scheduled reminder', () => {
    expect(nextRingAt(reminder())?.toISOString()).toBe(reminder().dueAt);
  });

  it('returns null for a scheduled reminder with no readable moment', () => {
    expect(nextRingAt(reminder({ dueAt: 'nope' }))).toBeNull();
  });

  it('measures a standing repeat from the last ring, not the appointment', () => {
    const lastRangAt = new Date(2026, 9, 19, 9, 0).toISOString();
    const at = nextRingAt(reminder({ status: 'standing', fireCount: 2, lastRangAt }));
    expect(at?.toISOString()).toBe(new Date(2026, 9, 19, 9, 20).toISOString());
  });

  it('uses the first rung when a standing reminder somehow has no ring count', () => {
    const lastRangAt = NOW.toISOString();
    const at = nextRingAt(reminder({ status: 'standing', fireCount: 0, lastRangAt }));
    expect(at?.toISOString()).toBe(new Date(2026, 9, 19, 9, 10).toISOString());
  });

  it('falls back to the due moment when a standing reminder has never rung', () => {
    const at = nextRingAt(reminder({ status: 'standing', fireCount: 1, lastRangAt: null }));
    expect(at?.toISOString()).toBe(new Date(2026, 9, 19, 9, 10).toISOString());
  });

  it('returns null for an ended reminder', () => {
    expect(nextRingAt(reminder({ status: 'done' }))).toBeNull();
    expect(nextRingAt(reminder({ status: 'stopped' }))).toBeNull();
  });

  it('returns null when a standing reminder has no readable clock at all', () => {
    expect(
      nextRingAt(reminder({ status: 'standing', dueAt: 'nope', lastRangAt: null })),
    ).toBeNull();
  });
});

describe('sortReminders', () => {
  it('puts standing first, then scheduled by time, then ended newest first', () => {
    const standing = reminder({ id: 'standing', status: 'standing' });
    const later = reminder({
      id: 'later',
      dueAt: new Date(2026, 9, 20, 9, 0).toISOString(),
    });
    const sooner = reminder({
      id: 'sooner',
      dueAt: new Date(2026, 9, 19, 12, 0).toISOString(),
    });
    const doneOld = reminder({
      id: 'done-old',
      status: 'done',
      finishedAt: new Date(2026, 9, 18, 9, 0).toISOString(),
    });
    const doneNew = reminder({
      id: 'done-new',
      status: 'done',
      finishedAt: new Date(2026, 9, 19, 8, 0).toISOString(),
    });

    const sorted = sortReminders([doneOld, later, standing, doneNew, sooner]);
    expect(sorted.map((item) => item.id)).toEqual([
      'standing',
      'sooner',
      'later',
      'done-new',
      'done-old',
    ]);
  });

  it('does not mutate the list it was given', () => {
    const list = [reminder({ id: 'b' }), reminder({ id: 'a' })];
    const sorted = sortReminders(list);
    expect(list.map((item) => item.id)).toEqual(['b', 'a']);
    expect(sorted).not.toBe(list);
  });
});

describe('labels', () => {
  it('names and explains each rhythm', () => {
    expect(rhythmLabel('gentle')).toBe('Gentle');
    expect(rhythmLabel('steady')).toBe('Steady');
    expect(rhythmLabel('insistent')).toBe('Insistent');
    expect(rhythmLabel('unknown' as 'steady')).toBe('Steady');
    expect(rhythmHint('insistent')).toContain('presentation');
    expect(rhythmHint('unknown' as 'steady')).toContain('appointment');
  });

  it('counts asks with the right ordinal', () => {
    expect(askLabel(1)).toBe('first ask');
    expect(askLabel(2)).toBe('2nd ask');
    expect(askLabel(3)).toBe('3rd ask');
    expect(askLabel(4)).toBe('4th ask');
    expect(askLabel(11)).toBe('11th ask');
    expect(askLabel(12)).toBe('12th ask');
    expect(askLabel(13)).toBe('13th ask');
    expect(askLabel(21)).toBe('21st ask');
    expect(askLabel(22)).toBe('22nd ask');
    expect(askLabel(23)).toBe('23rd ask');
    expect(askLabel(0)).toBe('first ask');
  });

  it('walks the quote list one per ring and wraps', () => {
    expect(quoteForRing(1)).toBe(REMINDER_QUOTES[0]);
    expect(quoteForRing(2)).toBe(REMINDER_QUOTES[1]);
    expect(quoteForRing(REMINDER_QUOTES.length + 1)).toBe(REMINDER_QUOTES[0]);
    expect(quoteForRing(0)).toBe(REMINDER_QUOTES[0]);
  });

  it('writes a local clock time', () => {
    expect(clockTime(new Date(2026, 9, 19, 9, 4))).toBe('09:04');
    expect(clockTime(new Date(2026, 9, 19, 15, 0))).toBe('15:00');
  });
});

describe('dueLabel', () => {
  it('names today, tomorrow and yesterday without a date', () => {
    expect(dueLabel(new Date(2026, 9, 19, 15, 0).toISOString(), NOW)).toBe('Today · 15:00');
    expect(dueLabel(new Date(2026, 9, 20, 9, 0).toISOString(), NOW)).toBe('Tomorrow · 09:00');
    expect(dueLabel(new Date(2026, 9, 18, 9, 0).toISOString(), NOW)).toBe('Yesterday · 09:00');
  });

  it('uses a short date for anything further away', () => {
    const label = dueLabel(new Date(2026, 9, 22, 9, 0).toISOString(), NOW);
    expect(label).toContain('09:00');
    expect(label).toContain('Oct');
    expect(label).not.toContain('Today');
  });

  it('is empty for an unreadable moment', () => {
    expect(dueLabel('nope', NOW)).toBe('');
  });
});

describe('countdowns', () => {
  it('says now under a minute, and never says zero', () => {
    expect(countdownFromMs(0)).toBe('now');
    expect(countdownFromMs(-5000)).toBe('now');
    expect(countdownFromMs(59_999)).toBe('now');
    expect(countdownFromMs(Number.NaN)).toBe('now');
  });

  it('counts minutes, hours and days', () => {
    expect(countdownFromMs(5 * 60_000)).toBe('in 5 min');
    expect(countdownFromMs(2 * 3_600_000)).toBe('in 2 h');
    expect(countdownFromMs(2 * 3_600_000 + 30 * 60_000)).toBe('in 2 h 30 min');
    expect(countdownFromMs(25 * 3_600_000)).toBe('in 1 d 1 h');
    expect(countdownFromMs(48 * 3_600_000)).toBe('in 2 d');
  });

  it('reads a countdown from a stored moment', () => {
    expect(countdownLabel(new Date(2026, 9, 19, 9, 5).toISOString(), NOW)).toBe('in 5 min');
    expect(countdownLabel('nope', NOW)).toBe('');
  });
});

describe('reminderBody', () => {
  it('says it is time on the first, punctual ring', () => {
    expect(reminderBody(reminder({ fireCount: 1 }), NOW)).toBe('It is time.');
  });

  it('admits when it was missed, with the time it was due', () => {
    const body = reminderBody(reminder({ fireCount: 1 }), new Date(2026, 9, 19, 9, 12));
    expect(body).toBe('It was due at 09:00. We kept it for you.');
  });

  it('counts the repeats once it is standing', () => {
    expect(reminderBody(reminder({ fireCount: 4 }), NOW)).toBe('Still standing — reminder 4.');
  });

  it('adds the user’s own note as its own sentence', () => {
    const body = reminderBody(reminder({ fireCount: 2, note: 'Room 4' }), NOW);
    expect(body).toBe('Still standing — reminder 2. Room 4');
  });
});

describe('reminderReading', () => {
  it('leads with the reminder that is asking', () => {
    const reading = reminderReading(
      [
        reminder({ status: 'standing', fireCount: 2, lastRangAt: NOW.toISOString() }),
        reminder({
          id: 'r2',
          status: 'standing',
          title: 'Call home',
          lastRangAt: NOW.toISOString(),
        }),
      ],
      NOW,
    );
    expect(reading).toContain('Presentation is standing now');
    expect(reading).toContain('1 more waiting behind it.');
  });

  it('names the next appointment when nothing is standing', () => {
    expect(
      reminderReading([reminder({ dueAt: new Date(2026, 9, 19, 15, 0).toISOString() })], NOW),
    ).toBe('Nothing standing. Next is Presentation, today · 15:00.');
  });

  it('counts the promises kept when there is nothing ahead', () => {
    expect(reminderReading([reminder({ status: 'done' })], NOW)).toBe(
      'Nothing standing. 1 promise kept so far.',
    );
    expect(
      reminderReading(
        [reminder({ id: 'a', status: 'done' }), reminder({ id: 'b', status: 'done' })],
        NOW,
      ),
    ).toBe('Nothing standing. 2 promises kept so far.');
  });

  it('invites the first reminder when the list is empty', () => {
    expect(reminderReading([], NOW)).toContain('Write one down');
  });

  it('falls back to a readable line when the first standing row is missing', () => {
    expect(reminderReading([reminder({ status: 'done' })], NOW)).not.toContain('undefined');
  });
});

describe('parseReminder', () => {
  it('reads a stored reminder back unchanged', () => {
    const original = reminder({ status: 'standing', fireCount: 3, note: 'Room 4' });
    expect(parseReminder(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  it('drops a value that is not an object', () => {
    expect(parseReminder(null)).toBeNull();
    expect(parseReminder('string')).toBeNull();
    expect(parseReminder(42)).toBeNull();
  });

  it('requires an id, a title, a known status and a known rhythm', () => {
    expect(parseReminder({ ...reminder(), id: '' })).toBeNull();
    expect(parseReminder({ ...reminder(), title: '   ' })).toBeNull();
    expect(parseReminder({ ...reminder(), status: 'unknown' })).toBeNull();
    expect(parseReminder({ ...reminder(), rhythm: 'wild' })).toBeNull();
  });

  it('requires a readable due moment, and defaults the created moment to it', () => {
    expect(parseReminder({ ...reminder(), dueAt: 'nope' })).toBeNull();
    expect(parseReminder({ ...reminder(), createdAt: undefined })).toMatchObject({
      dueAt: reminder().dueAt,
      createdAt: reminder().dueAt,
    });
  });

  it('cleans what it reads and repairs unreadable counts and timestamps', () => {
    const parsed = parseReminder({
      ...reminder(),
      title: '  Room   4 ',
      note: '  a   note ',
      fireCount: -3,
      snoozes: '2',
      lastRangAt: 'nope',
      finishedAt: undefined,
    });
    expect(parsed).toMatchObject({
      title: 'Room 4',
      note: 'a note',
      fireCount: 0,
      snoozes: 2,
      lastRangAt: null,
      finishedAt: null,
    });
  });

  it('keeps an integer count and floors a fraction', () => {
    expect(parseReminder({ ...reminder(), fireCount: 3.9 })?.fireCount).toBe(3);
    expect(parseReminder({ ...reminder(), snoozes: 2.2 })?.snoozes).toBe(2);
  });
});
