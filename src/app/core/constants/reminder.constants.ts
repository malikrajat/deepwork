import { ReminderRhythm } from '../models/reminder.model';

/**
 * The gaps between rings, one ladder per rhythm.
 *
 * A standing reminder does not repeat on a stopwatch. The first repeat comes
 * quickly — the point of the feature is that *this* moment is the one that
 * matters — and each later gap is longer, because a reminder that keeps
 * arriving every three minutes is one the user learns to hate rather than one
 * they act on. The ladder never ends: the last entry repeats for as long as the
 * reminder stands. See `ringDelayMinutes`.
 *
 * The numbers are minutes, and they are ordinary human numbers rather than
 * computed backoff: "five minutes, then ten" is a cadence a person can predict,
 * and a predictable reminder is one that can be trusted rather than merely
 * endured.
 */
export const RHYTHM_LADDERS: Record<ReminderRhythm, readonly number[]> = {
  gentle: [30, 45, 60, 90, 120],
  steady: [10, 20, 30, 45, 60],
  insistent: [3, 5, 10, 15, 20, 30],
};

/** What each rhythm is called, where the user chooses it and where it is read back. */
export const RHYTHM_LABELS: Record<ReminderRhythm, { label: string; hint: string }> = {
  gentle: {
    label: 'Gentle',
    hint: 'Half an hour between reminders. For things that can wait.',
  },
  steady: {
    label: 'Steady',
    hint: 'Ten minutes between reminders. For an ordinary appointment.',
  },
  insistent: {
    label: 'Insistent',
    hint: 'Three minutes between reminders. For a presentation, a class or a dose.',
  },
};

/**
 * The lines a standing reminder carries, walked one per ring.
 *
 * These are not productivity slogans. The feature asks the user to trust it
 * with something that matters and to leave the screen — a class, a
 * presentation, a call — so the copy has to be the voice of something that
 * stays, not something that scolds. Each line is short enough to sit on a card
 * beside the user's own words without competing with them.
 */
export const REMINDER_QUOTES: readonly string[] = [
  "You don't have to hold this in your head. It's written down.",
  "We'll keep it here until it's handled — no need to rush, no chance to forget.",
  'One thing at a time. This is the one.',
  'Your health, your promises and your attention all deserve the same care.',
  'A reminder that gives up is a reminder you learn to ignore. This one will not.',
  'It waited for you. Now it is your turn.',
  'Small step, then done. That is all this is.',
  'You asked us to make sure. So we are.',
  'The world can wait for the next few minutes. This cannot.',
  'We hold the worry so you can hold the work.',
  'This is the moment you planned for. You are ready enough.',
  'Nothing else is more important than the thing you wrote down.',
  'One clear action is waiting. Take it.',
  'The reminder is not a scold. It is a hand on your shoulder.',
  'You will feel better once this is done. Start there.',
  'The thing you promised is still worth keeping.',
  'Stand up, step out, show up. This is that moment.',
  'It is here now, and you are here now. That is enough.',
  'Do the next right thing, then let it go.',
  'You thought this mattered. It still does.',
  'The reminder kept its side of the deal. Keep yours.',
  'A few minutes of courage beats a day of dread.',
  'You do not have to be perfect. You have to be present.',
  'This is not an interruption. It is the point.',
  'The time you planned for is now. Use it.',
  'Your attention is the gift. Give it here first.',
  'One thing, done properly, is a good day.',
  'You can rest after. Right now, begin.',
  'The promise is small enough to keep. Keep it.',
  'Everything else can wait its turn.',
  'Show up for the thing you said you would.',
  'The reminder is a bridge back to what matters.',
  'Take a breath, then take the step.',
  'You already know what to do. Do that.',
  'This moment will pass. Meet it before it does.',
  'A calm reminder for a real commitment.',
  'Nothing is lost. It is still here, still waiting.',
  'The next few minutes are the whole ask.',
  'You are allowed to stop everything else for this.',
  'Keep the promise, and the day keeps its shape.',
  'Your future self is counting on this one.',
  'The task is not bigger than you. It never was.',
  'One reminder, one action, one clear step.',
  'Be where your feet are. That is here.',
  'This is worth leaving the scroll for.',
  'You made a plan. Honour it gently.',
  'The world will still be there when you are done.',
  'Do it now, while it is still small.',
  'A standing reminder for something that matters.',
  'You asked to be kept honest. Here it is.',
  'The best time to act is before the second reminder.',
  'Your attention is not divided right now. Spend it well.',
  'The moment is asking for you. Answer.',
  'One thing at a time is not slow. It is how things get done.',
  'You have carried this far enough. Finish the step.',
  'Let the reminder do its job, then let it go.',
  'This is the part that counts, and it is only a few minutes.',
  'No perfect words needed. Just begin.',
  'You are more capable than the avoidance says.',
  'Keep this one promise, and trust grows.',
];

/** The most a title may be, after trimming. */
export const REMINDER_TITLE_MAX = 80;

/** The most a note may be. It rides in a notification, so it is one line's worth. */
export const REMINDER_NOTE_MAX = 160;

/** How far ahead a snooze moves the reminder, in minutes. */
export const REMINDER_SNOOZE_MINUTES = 10;

/**
 * How long a crossed notification waits before the question comes back.
 *
 * Deliberately the same three minutes the water reminder and the completion
 * alert use: crossing is not answering, and three minutes is long enough not to
 * fight the user for the minute they are in and short enough that the thing is
 * not lost.
 */
export const REMINDER_REASK_MS = 3 * 60_000;
