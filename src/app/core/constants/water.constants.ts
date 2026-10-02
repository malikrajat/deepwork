/**
 * The choices the water reminder asks about, in one place.
 *
 * Every one of these is a **fixed list rather than a field the user types**.
 * The useful range for each is narrow — a reminder every 6 minutes, a 12 ml
 * glass, a 40 litre target — and a number that has to be typed is a number that
 * can be mistyped, so the app offers the sensible ones and nothing else. The
 * defaults are the middle of each range: 500 ml is a bottle, sixty minutes is
 * the common "a glass an hour" advice, and 2 L is eight glasses of 250 ml.
 *
 * This is a habit nudge, not medical advice; anyone with a reason to drink more
 * or less water is the one who knows their own number.
 */

/**
 * Minutes between reminders, from a sip every quarter of an hour to a glass
 * every three hours.
 *
 * Half an hour is the shortest cadence most people want, but it is not the
 * shortest one there is: someone who works through the day with a small glass
 * beside them may want one every fifteen minutes, and a half-hour floor would
 * have made that choice unavailable rather than merely unusual.
 */
export const WATER_INTERVAL_OPTIONS: readonly number[] = [15, 20, 25, 30, 45, 60, 90, 120, 180];

/** The default cadence, and the one the switch starts on. */
export const DEFAULT_WATER_INTERVAL_MINUTES = 60;

/**
 * Millilitres per drink: a mouthful, a sip, a cup, a glass, a bottle, a large
 * bottle.
 *
 * One number cannot describe a drink for everyone — a mouthful from a small glass
 * and a full one-litre bottle are both "a glass" — and the small end is where
 * rounding costs the most: 30 ml in a stemmed glass counted as 100 ml is a day
 * that reads three times fuller than it was. So the list starts at a 30 ml sip
 * and runs in steps an actual glass is likely to hold, and the user picks the one
 * that matches what is in front of them instead of the app rounding it to
 * something else.
 */
export const WATER_AMOUNT_OPTIONS: readonly number[] = [
  30, 50, 70, 90, 100, 150, 200, 250, 300, 400, 500, 750, 1000,
];

/** What one drink counts as unless the user says otherwise. */
export const DEFAULT_WATER_AMOUNT_ML = 500;

/** The day's target, in millilitres (2 L ≈ 8 glasses of 250 ml). */
export const WATER_GOAL_OPTIONS: readonly number[] = [1500, 2000, 2500, 3000];

/** What the day is measured against unless the user says otherwise. */
export const DEFAULT_WATER_GOAL_ML = 2000;

/**
 * Working hours: reminders fire between these two times and nowhere else.
 *
 * A nudge at 03:00 is not a habit, so the window is part of the feature rather
 * than something the user has to work out for themselves.
 */
export const DEFAULT_WATER_START = '09:00';
export const DEFAULT_WATER_END = '18:00';

/**
 * What the persistent nudge says to make the next glass worth taking.
 *
 * The nudge waits for an answer rather than fading away, so it is the one
 * message in the app that is always read: it carries a line worth reading —
 * short, plain, and about the glass in front of the user rather than about
 * hydration in the abstract. The reminder walks the list one entry per nudge, so
 * the same sentence does not come back every hour, and nothing here is fetched
 * or typed.
 */
export const WATER_QUOTES: readonly string[] = [
  'Water is the cheapest performance boost you will get today.',
  'A glass now saves you the headache at four.',
  'Your brain is mostly water — top it up before the next task.',
  'Small sips, all day. That is the whole trick.',
  'Drink first, then decide whether you were thirsty.',
  'Two minutes for a glass, and the afternoon gets easier.',
  'The best time to drink was an hour ago. The next best is now.',
  'Refill the bottle and the habit refills itself.',
  'Focus is easier when you are not quietly dehydrated.',
  'Every glass is a small break your eyes needed anyway.',
];
