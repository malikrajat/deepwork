import { describe, it, expect } from 'vitest';
import {
  formatClockTime,
  formatMillilitres,
  isWithinHours,
  localDayStart,
  minuteOfDay,
  nextWindowOpen,
  parseTimeOfDay,
  quoteFor,
  sanitiseAmount,
  waterPrefsOf,
  windowClose,
} from '../../src/app/core/utils/water.util';
import { DEFAULT_SETTINGS } from '../../src/app/core/models/settings.model';
import {
  WATER_AMOUNT_OPTIONS,
  WATER_INTERVAL_OPTIONS,
  WATER_QUOTES,
} from '../../src/app/core/constants/water.constants';

/**
 * The water feature's arithmetic, pinned down. The reminder's timer is only as
 * trustworthy as these answers: a window read wrongly is a nudge at midnight,
 * and a cadence computed wrongly is either silence or a stream of them.
 */

/** A local date at a given time — local, because that is what the user's clock says. */
function at(hours: number, minutes = 0, day = 26): Date {
  return new Date(2026, 8, day, hours, minutes, 0, 0);
}

describe('formatMillilitres', () => {
  it('reads small amounts as millilitres', () => {
    expect(formatMillilitres(250)).toBe('250 ml');
    expect(formatMillilitres(999)).toBe('999 ml');
    expect(formatMillilitres(1)).toBe('1 ml');
  });

  it('reads litres from a thousand up, without a pointless decimal', () => {
    expect(formatMillilitres(1000)).toBe('1 L');
    expect(formatMillilitres(1500)).toBe('1.5 L');
    expect(formatMillilitres(2000)).toBe('2 L');
    expect(formatMillilitres(2250)).toBe('2.3 L');
  });

  it('never invents a drink that was not logged', () => {
    expect(formatMillilitres(0)).toBe('0 ml');
    expect(formatMillilitres(-500)).toBe('0 ml');
    expect(formatMillilitres(Number.NaN)).toBe('0 ml');
  });
});

describe('parseTimeOfDay', () => {
  it('reads the times a picker produces', () => {
    expect(parseTimeOfDay('09:00')).toBe(540);
    expect(parseTimeOfDay('9:05')).toBe(545);
    expect(parseTimeOfDay('18:30')).toBe(1110);
    expect(parseTimeOfDay('00:00')).toBe(0);
    expect(parseTimeOfDay(' 07:15 ')).toBe(435);
  });

  it('refuses anything that is not a time', () => {
    expect(parseTimeOfDay('24:00')).toBeNull();
    expect(parseTimeOfDay('09:60')).toBeNull();
    expect(parseTimeOfDay('09')).toBeNull();
    expect(parseTimeOfDay('')).toBeNull();
    expect(parseTimeOfDay(null)).toBeNull();
    expect(parseTimeOfDay(undefined)).toBeNull();
    expect(parseTimeOfDay('quarter past nine')).toBeNull();
  });
});

describe('the clock', () => {
  it('turns a time into a minute of the day and back', () => {
    const time = at(14, 5);
    expect(minuteOfDay(time)).toBe(845);
    expect(formatClockTime(time)).toBe('14:05');
  });

  it('pads the early hours rather than showing 9:5', () => {
    expect(formatClockTime(at(9, 5))).toBe('09:05');
    expect(formatClockTime(at(0, 0))).toBe('00:00');
  });
});

describe('isWithinHours', () => {
  const work = { start: 9 * 60, end: 18 * 60 };

  it('counts the working day, including both ends', () => {
    expect(isWithinHours(9 * 60, work.start, work.end)).toBe(true);
    expect(isWithinHours(13 * 60, work.start, work.end)).toBe(true);
    expect(isWithinHours(18 * 60, work.start, work.end)).toBe(true);
  });

  it('leaves the evening and the night alone', () => {
    expect(isWithinHours(8 * 60 + 59, work.start, work.end)).toBe(false);
    expect(isWithinHours(20 * 60, work.start, work.end)).toBe(false);
    expect(isWithinHours(3 * 60, work.start, work.end)).toBe(false);
  });

  it('wraps midnight for a night shift', () => {
    expect(isWithinHours(23 * 60, 22 * 60, 6 * 60)).toBe(true);
    expect(isWithinHours(3 * 60, 22 * 60, 6 * 60)).toBe(true);
    expect(isWithinHours(12 * 60, 22 * 60, 6 * 60)).toBe(false);
  });

  it('treats a window with no length as closed, not as always on', () => {
    expect(isWithinHours(10 * 60, 9 * 60, 9 * 60)).toBe(false);
  });
});

describe('windowClose', () => {
  it('is today, inside a working day', () => {
    expect(formatClockTime(windowClose(at(11), 9 * 60, 18 * 60))).toBe('18:00');
  });

  it('is tomorrow once a night shift has passed its end', () => {
    const close = windowClose(at(23), 22 * 60, 6 * 60);
    expect(close.getDate()).toBe(27);
    expect(formatClockTime(close)).toBe('06:00');
  });
});

describe('nextWindowOpen', () => {
  it('is today while the window is still ahead', () => {
    expect(formatClockTime(nextWindowOpen(at(7), 9 * 60, 18 * 60))).toBe('09:00');
  });

  it('is tomorrow once today has closed', () => {
    const next = nextWindowOpen(at(20), 9 * 60, 18 * 60);
    expect(next.getDate()).toBe(27);
    expect(formatClockTime(next)).toBe('09:00');
  });

  it('is now when the window is already open', () => {
    const now = at(11, 30);
    expect(nextWindowOpen(now, 9 * 60, 18 * 60)).toEqual(now);
  });
});

describe('localDayStart', () => {
  it('is local midnight, so the day turns over when the user does', () => {
    const start = localDayStart(at(23, 59));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getDate()).toBe(26);
  });
});

describe('sanitiseAmount', () => {
  it('keeps whole millilitres and never goes below zero', () => {
    expect(sanitiseAmount(500)).toBe(500);
    expect(sanitiseAmount(250.4)).toBe(250);
    expect(sanitiseAmount(-100)).toBe(0);
    expect(sanitiseAmount(Number.NaN)).toBe(0);
  });
});

describe('waterPrefsOf', () => {
  it("gathers the stored settings into the feature's own shape", () => {
    const prefs = waterPrefsOf({
      ...DEFAULT_SETTINGS,
      waterReminders: true,
      waterStart: '08:30',
      waterEnd: '17:15',
      waterIntervalMinutes: 45,
      waterAmountMl: 750,
      waterGoalMl: 3000,
      waterAutoLogWhenMinimized: false,
    });

    expect(prefs).toEqual({
      enabled: true,
      start: '08:30',
      end: '17:15',
      intervalMinutes: 45,
      amountMl: 750,
      goalMl: 3000,
      autoLogWhenMinimized: false,
    });
  });

  it('is off, with a full working day offered, before the user asks for it', () => {
    const prefs = waterPrefsOf(DEFAULT_SETTINGS);
    expect(prefs.enabled).toBe(false);
    expect(prefs.intervalMinutes).toBe(60);
    expect(prefs.amountMl).toBe(500);
    expect(prefs.goalMl).toBe(2000);
    // A minimised window is left alone unless the user says otherwise.
    expect(prefs.autoLogWhenMinimized).toBe(true);
  });
});

describe('quoteFor', () => {
  it('walks the list in order, and wraps round at the end', () => {
    expect(quoteFor(0)).toBe(WATER_QUOTES[0]);
    expect(quoteFor(1)).toBe(WATER_QUOTES[1]);
    expect(quoteFor(WATER_QUOTES.length)).toBe(WATER_QUOTES[0]);
    expect(quoteFor(WATER_QUOTES.length + 3)).toBe(WATER_QUOTES[3]);
  });

  it('never lands outside the list, whatever it is handed', () => {
    expect(quoteFor(-1)).toBe(WATER_QUOTES[WATER_QUOTES.length - 1]);
    expect(quoteFor(2.7)).toBe(WATER_QUOTES[2]);
    expect(quoteFor(Number.NaN)).toBe(WATER_QUOTES[0]);
  });

  it('has lines worth reading, and none of them repeated', () => {
    expect(WATER_QUOTES.length).toBeGreaterThan(4);
    for (const quote of WATER_QUOTES) expect(quote.trim().length).toBeGreaterThan(10);
    expect(new Set(WATER_QUOTES).size).toBe(WATER_QUOTES.length);
  });
});

describe('the choices the reminder offers', () => {
  it('offers cadences below half an hour as well as above an hour', () => {
    expect(WATER_INTERVAL_OPTIONS).toContain(15);
    expect(WATER_INTERVAL_OPTIONS).toContain(180);
  });

  it('offers a sip as small as 30 ml and a bottle as large as 1 L', () => {
    expect(WATER_AMOUNT_OPTIONS[0]).toBe(30);
    expect(WATER_AMOUNT_OPTIONS.at(-1)).toBe(1000);
    // The small end is a run of steps a glass actually holds, not one sip and a
    // jump: 30, 50, 70, 90 ml are each a real mouthful from a small glass.
    expect(WATER_AMOUNT_OPTIONS).toEqual(expect.arrayContaining([50, 70, 90]));
    expect(WATER_AMOUNT_OPTIONS).toContain(150);
  });

  it('keeps every list ascending, with nothing offered twice', () => {
    for (const list of [WATER_INTERVAL_OPTIONS, WATER_AMOUNT_OPTIONS]) {
      expect([...list].sort((a, b) => a - b)).toEqual([...list]);
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('still offers the reminders it starts on', () => {
    expect(WATER_INTERVAL_OPTIONS).toContain(DEFAULT_SETTINGS.waterIntervalMinutes);
    expect(WATER_AMOUNT_OPTIONS).toContain(DEFAULT_SETTINGS.waterAmountMl);
  });
});
