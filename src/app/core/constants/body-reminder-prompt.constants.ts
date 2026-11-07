/**
 * The words the app uses when it offers one of the two body reminders.
 *
 * Both reminders are off by default, so the offer is the only way most users
 * will meet the feature. Two rules shape every line:
 *
 * - **Lead with what the body gets, not with the switch.** "A glass every hour
 *   keeps your head clear" is a reason; "Water reminders are off" is a status
 *   line. The title names the feature, the body carries the reason, and the
 *   quote under it is the motivational line the notification is required to
 *   bring.
 * - **Always say the way out.** The offer repeats every two hours while the
 *   feature is off, so every line has to make the two answers obvious: set it
 *   up now, or stop the offers. The reminder itself can be turned off from the
 *   Dashboard in one click, and that is said too.
 *
 * The variants are rotated rather than picked at random, so a user who meets the
 * offer twice in a day reads two different reasons instead of the same sentence.
 */

/** How often the offer returns while the feature is still off. */
export const BODY_PROMPT_REPEAT_MINUTES = 120;

/**
 * How long after DeepWork starts (or after a reminder is switched off) the first
 * offer is allowed to arrive.
 *
 * The two features are staggered by an hour so a first run does not raise both
 * offers at the same moment. Neither is immediate: the user has just made a
 * choice about the reminders in the first-run setup, and asking again in the
 * same minute would be the same question twice.
 */
export const FIRST_BODY_PROMPT_DELAY_MINUTES = {
  water: 120,
  movement: 180,
} as const;

/** One variant of the offer, in the app and on the desktop. */
export interface BodyPromptCopy {
  /** The card's heading — the feature, at a glance. */
  title: string;
  /** The card's one line: why it helps, and the way out. */
  body: string;
  /** The same message for an OS notification, where the answers are buttons. */
  system: string;
}

/** The water reminder's offers, walked one per prompt. */
export const WATER_SETUP_PROMPTS: readonly BodyPromptCopy[] = [
  {
    title: 'Water reminders are off',
    body: 'A glass every hour keeps your head clear and your energy steady. Set it up in one click — turn it off any time from the Dashboard.',
    system:
      'A glass every hour keeps your head clear and your energy steady. Choose Set up to turn on water reminders — one click, and off any time from the Dashboard.',
  },
  {
    title: 'Want a reminder to drink?',
    body: 'Small sips through the day do more for focus than one big glass ever will. Set it up in one click — turn it off any time from the Dashboard.',
    system:
      'Small sips through the day protect focus and energy. Choose Set up to turn on water reminders — and off any time from the Dashboard.',
  },
  {
    title: 'Deep work needs water',
    body: 'The afternoon fog is often just a dry tank. Set up a short water nudge — one click now, off any time from the Dashboard.',
    system:
      'The afternoon fog is often a dry tank. Choose Set up to turn on water reminders — one click now, and off any time from the Dashboard.',
  },
];

/** The stand-and-walk reminder's offers, in the same shape. */
export const MOVEMENT_SETUP_PROMPTS: readonly BodyPromptCopy[] = [
  {
    title: 'Stand & walk reminders are off',
    body: 'Two minutes on your feet resets your back and the next hour of focus. Set it up in one click — turn it off any time from the Dashboard.',
    system:
      'Two minutes on your feet resets your back and the next hour of focus. Choose Set up to turn on stand & walk reminders — off any time from the Dashboard.',
  },
  {
    title: 'Your back is asking',
    body: 'A short walk between tasks is the cheapest fix for a stiff desk day. Set it up in one click — turn it off any time from the Dashboard.',
    system:
      'A short walk between tasks is the cheapest fix for a stiff desk day. Choose Set up to turn on stand & walk reminders — off any time from the Dashboard.',
  },
  {
    title: 'Move before the ache sets in',
    body: 'Standing up every hour or so keeps your focus and your back in better shape. Set it up in one click — turn it off any time from the Dashboard.',
    system:
      'Standing up every hour or so keeps focus and your back in better shape. Choose Set up to turn on stand & walk reminders — off any time from the Dashboard.',
  },
];

/** What the confirmation says once the switch has been turned on. */
export const SETUP_CONFIRMATION_TITLES = {
  water: 'Water reminders are on',
  movement: 'Stand & walk reminders are on',
} as const;

/** The two answers every add-reminder offer carries. */
export const BODY_PROMPT_ACTIONS = {
  setup: 'Set up',
  stop: 'Stop asking',
} as const;

/** What the app says after **Stop asking** has been pressed. */
export const SETUP_PROMPTS_STOPPED = {
  water: {
    title: 'No more water setup prompts',
    body: 'Water reminders stay off. Turn them on any time from the Dashboard.',
  },
  movement: {
    title: 'No more stand & walk setup prompts',
    body: 'Stand & walk reminders stay off. Turn them on any time from the Dashboard.',
  },
} as const;
