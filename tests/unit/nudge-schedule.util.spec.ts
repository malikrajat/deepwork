import { describe, it, expect } from 'vitest';
import {
  dueNudge,
  localDayKey,
  minutesOfDay,
  nudgePlanFor,
  PIN_NUDGES_PER_DAY,
  STARTUP_NUDGES_PER_DAY,
} from '../../src/app/core/utils/nudge-schedule.util';

/**
 * The day's reminder plan: how many, when, and which of them a given moment is
 * allowed to deliver.
 *
 * The schedule is the feature's whole behaviour, so every property that matters
 * is asserted here rather than watched for in a running app: a count in the
 * promised range, times that never collide, a plan that is stable across a
 * reload, and a due check that drops what came round while the app was closed.
 */

const DAY = '2026-10-17';

describe('nudgePlanFor', () => {
  it('plans four or five startup reminders and three pin reminders', () => {
    for (const day of ['2026-10-17', '2026-10-18', '2026-11-01', '2027-02-28']) {
      const plan = nudgePlanFor(day);
      expect(plan.startup.length).toBeGreaterThanOrEqual(STARTUP_NUDGES_PER_DAY.min);
      expect(plan.startup.length).toBeLessThanOrEqual(STARTUP_NUDGES_PER_DAY.max);
      expect(plan.pin).toHaveLength(PIN_NUDGES_PER_DAY);
    }
  });

  it('keeps every reminder inside the working day, in order', () => {
    const plan = nudgePlanFor(DAY);

    for (const times of [plan.startup, plan.pin]) {
      let previous = -1;
      for (const time of times) {
        expect(time).toBeGreaterThanOrEqual(9 * 60 + 30);
        expect(time).toBeLessThanOrEqual(20 * 60 + 30);
        expect(time).toBeGreaterThan(previous);
        previous = time;
      }
    }
  });

  it('spaces the startup reminders far enough apart to be separate events', () => {
    const plan = nudgePlanFor(DAY);

    for (let index = 1; index < plan.startup.length; index += 1) {
      expect(plan.startup[index] - plan.startup[index - 1]).toBeGreaterThanOrEqual(75);
    }
    for (let index = 1; index < plan.pin.length; index += 1) {
      expect(plan.pin[index] - plan.pin[index - 1]).toBeGreaterThanOrEqual(150);
    }
  });

  it('never puts a pin reminder on top of a startup one', () => {
    const plan = nudgePlanFor(DAY);

    for (const pin of plan.pin) {
      for (const startup of plan.startup) {
        expect(Math.abs(pin - startup)).toBeGreaterThanOrEqual(25);
      }
    }
  });

  it('gives the same day the same plan every time', () => {
    // A reload must not re-roll the reminders, and a second launch must not
    // deliver a different set of times from the one already partly spent.
    expect(nudgePlanFor(DAY)).toEqual(nudgePlanFor(DAY));
  });

  it('gives different days different plans', () => {
    const plans = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'].map((day) =>
      nudgePlanFor(day).startup.join(','),
    );
    expect(new Set(plans).size).toBeGreaterThan(1);
  });

  it('holds every invariant for every day of a year', () => {
    // The plan is generated, not stored, so the only way to know a day will not
    // produce a 06:00 reminder or two on top of each other is to walk a year of
    // them. This is where a shift that pushed a time out of the window would be
    // caught, rather than by a user noticing it at breakfast.
    for (let offset = 0; offset < 366; offset += 1) {
      const day = new Date(2026, 0, 1 + offset);
      const key = localDayKey(day);
      const plan = nudgePlanFor(key);

      for (const times of [plan.startup, plan.pin]) {
        expect(times.length).toBeGreaterThan(0);
        for (let index = 0; index < times.length; index += 1) {
          expect(times[index]).toBeGreaterThanOrEqual(9 * 60 + 30);
          expect(times[index]).toBeLessThanOrEqual(20 * 60 + 30);
          if (index > 0) expect(times[index]).toBeGreaterThan(times[index - 1]);
        }
      }

      for (const pin of plan.pin) {
        for (const startup of plan.startup) {
          expect(Math.abs(pin - startup)).toBeGreaterThanOrEqual(25);
        }
      }
    }
  });
});

describe('dueNudge', () => {
  const times = [600, 720, 840];

  it('is not due before the first planned time', () => {
    expect(dueNudge(times, 0, 599)).toEqual({ fired: 0, dueIndex: null });
  });

  it('is due on the minute it was planned for', () => {
    expect(dueNudge(times, 0, 600)).toEqual({ fired: 0, dueIndex: 0 });
  });

  it('stays due until the caller deals with it', () => {
    // This is what lets a pause hold a reminder: the clock moves on, but the
    // entry is still the one waiting, not three missed ones.
    expect(dueNudge(times, 0, 615).dueIndex).toBe(0);
    expect(dueNudge(times, 0, 660).dueIndex).toBe(0);
  });

  it('steps over a reminder that came round while the app was closed', () => {
    // Reopened at 15:00: the 10:00 and 12:00 entries are long past and are
    // counted as passed rather than delivered in a burst.
    const result = dueNudge(times, 0, 900, 150);
    expect(result.fired).toBe(2);
    expect(result.dueIndex).toBe(2);
  });

  it('delivers nothing when the whole day is behind it', () => {
    expect(dueNudge(times, 0, 23 * 60)).toEqual({ fired: 3, dueIndex: null });
  });

  it('never moves the count backwards', () => {
    expect(dueNudge(times, 2, 610)).toEqual({ fired: 2, dueIndex: null });
  });
});

describe('the clock helpers', () => {
  it('names a local day without a UTC shift', () => {
    expect(localDayKey(new Date(2026, 9, 7, 23, 55))).toBe('2026-10-07');
    expect(localDayKey(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });

  it('reads minutes past midnight, seconds included', () => {
    expect(minutesOfDay(new Date(2026, 9, 17, 14, 30, 30))).toBeCloseTo(14 * 60 + 30.5);
  });
});
