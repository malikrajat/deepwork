/**
 * The choices the water reminder asks about, in one place.
 *
 * Every one of these is a **fixed list rather than a field the user types**.
 * The useful range for each is narrow — a reminder every 6 minutes, a 12 ml
 * glass, a 40 litre target — and a number that has to be typed is a number that
 * can be mistyped, so the app offers the sensible ones and nothing else. The
 * defaults are the everyday end of each range: 50 ml is a comfortable mouthful
 * from the glass most people have beside them, sixty minutes is the common "a
 * glass an hour" advice, and 2 L is a day's worth of those.
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

/**
 * What one drink counts as unless the user says otherwise.
 *
 * Fifty millilitres is a comfortable mouthful — a real drink rather than a sip,
 * and still small enough that the day's tally stays honest instead of becoming a
 * handful of guesses at 500 ml each. Anyone drinking in bigger glasses picks
 * their own size in Settings, and the target above is unchanged either way —
 * only the count of drinks it takes to reach it.
 */
export const DEFAULT_WATER_AMOUNT_ML = 50;

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
  'One glass changes nothing. A day of them changes everything.',
  'Your body asked politely. Answer with water.',
  'Sip before the thirst. That is the upgrade.',
  'Water first, coffee second. Your afternoon will thank you.',
  'A dry mouth is the last signal, not the first.',
  'The glass is not a chore. It is a reset.',
  'Hydrate the machine that does all your thinking.',
  'A bottle on the desk is a promise within reach.',
  'Drink now, and the next hour belongs to you.',
  'Clear water, clear head.',
  'You would not run an engine dry. Do not run yourself dry.',
  'One mouthful is enough to start. Start.',
  'Refill it while you think. Then drink it while you work.',
  'Thirst is a lagging indicator. Beat it.',
  'Water is the quietest productivity tool you own.',
  'A sip is a small kindness to the next version of you.',
  'The headache is optional. The glass is free.',
  'Hydration is not a mood. It is maintenance.',
  'Your focus has a water bill. Pay it.',
  'Drink like it is part of the job, because it is.',
  'The next idea may just be a glass of water away.',
  'Warm room, busy mind, dry throat — drink.',
  'A full bottle is a full tank for the next block.',
  'You remembered the task. Now remember the water.',
  'Every sip buys back a little clarity.',
  'Water is the one break that makes the work better.',
  'Do not wait for your body to raise its voice.',
  'One glass now, one fewer excuse later.',
  'Your future self is thirsty too. Help them out.',
  'The desk can be a desert if you let it. Do not.',
  'Take the sip. The task will wait two seconds.',
  'Hydrated people make better decisions. Be one.',
  'A glass of water is a tiny act of self-respect.',
  'You are mostly water. Keep the percentage honest.',
  'Water in, noise out.',
  'Refresh the body, then refresh the page.',
  'The simplest health habit is sitting right beside you.',
  'Drink before you are owed it. That is the habit.',
  'A sip now is worth an hour of feeling off later.',
  'Keep the glass moving and the day moving.',
  'Your mind runs on water. Top up the tank.',
  'One glass is progress you can actually feel.',
  'Pause, sip, continue. That is a complete reset.',
  'Water is not a reward. It is a requirement.',
  'The best productivity hack is still just water.',
  'Give your body what it has been asking for.',
  'Drink the glass you keep forgetting about.',
  'Clear the fog with something that costs nothing.',
  'Sip your way through the afternoon instead of crashing through it.',
  'Water first. The rest of the day gets easier from there.',
];
