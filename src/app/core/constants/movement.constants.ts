/**
 * The stand-and-walk reminder: the choices it offers, and the lines it says.
 *
 * A desk job is a seated job, and the damage is not in one long sitting — it is
 * in the hours that pass without a reason to stand up. This reminder exists to
 * supply that reason: a short, answerable nudge to leave the chair, walk for a
 * couple of minutes, and come back. Like the water reminder, every choice here
 * is a fixed list rather than a number the user types; the useful range is
 * narrow and a mistyped cadence is a mistyped habit.
 */

/**
 * Minutes between stand-and-walk reminders, from every twenty minutes to every
 * two hours.
 *
 * Forty-five is the everyday setting: long enough to get a real block of work
 * done, short enough that the body does not spend most of the morning in one
 * position. The shorter end is for anyone whose back or doctor has already made
 * the decision for them; the longer end is for deep work that should not be
 * interrupted every half hour.
 */
export const MOVEMENT_INTERVAL_OPTIONS: readonly number[] = [20, 30, 45, 60, 90, 120];

/** The default cadence, and the one the switch starts on. */
export const DEFAULT_MOVEMENT_INTERVAL_MINUTES = 45;

/**
 * Working hours: reminders fire between these two times and nowhere else.
 *
 * The same shape as the water reminder's window, and for the same reason: a
 * nudge at 03:00 is not a habit. The default matches the working day most
 * people keep.
 */
export const DEFAULT_MOVEMENT_START = '09:00';
export const DEFAULT_MOVEMENT_END = '18:00';

/**
 * How long the walk is meant to last.
 *
 * Not a setting on purpose. The choice that matters is *whether* the user gets
 * out of the chair; a minute or three is a detail the reminder should not turn
 * into another form field. Two minutes is long enough to reach the end of a
 * corridor and back, and short enough that "no time" is not a real excuse.
 */
export const MOVEMENT_WALK_MINUTES = 2;

/**
 * How far a snooze moves the next reminder, in minutes.
 *
 * Ten minutes is a real deferral, not a dismissal: the user is in the middle of
 * a sentence or a call, and the chair should not be the thing that interrupts
 * it. It is short enough that the walk still happens in the same working block.
 */
export const MOVEMENT_SNOOZE_MINUTES = 10;

/**
 * Why the reminder exists, in the words the Settings card and the dashboard use.
 *
 * These are not medical claims and they are not a lecture. Each line says the
 * same thing in a different way: sitting still for hours is what stiffens a
 * back and flattens an afternoon, and a two-minute walk is enough to interrupt
 * it. One is picked per day so the card does not repeat itself.
 */
export const MOVEMENT_WHY: readonly string[] = [
  'Sitting for an hour stiffens your back and narrows your attention. Two minutes of walking resets both.',
  'The desk is not the problem. Staying still at it is. A short walk interrupts the stillness.',
  'A walk is not a break from the work. It is what makes the next block possible.',
  'Stand up, roll your shoulders, walk to the window. The next hour is easier from there.',
  'Movement is the cheapest fix for a sore back, tired eyes and a flat afternoon.',
  'Two minutes away from the screen buys back an hour of focus.',
  'Your body was built to move between tasks, not to hold one position until lunch.',
  'Walk first, then sit down to work. The order matters more than the distance.',
];

/**
 * The lines a stand-and-walk reminder carries, walked one per ring.
 *
 * The reminder asks the user to leave what they are doing, so the copy has to be
 * worth the interruption: short, specific to a body at a desk, and encouraging
 * rather than scolding. Nothing here is a productivity slogan, and nothing is
 * copied from a quote site — every line was written for this reminder. The deck
 * is deliberately deep, because the rotation walks it in order and a short list
 * would greet the user with the same sentence every morning.
 */
export const MOVEMENT_QUOTES: readonly string[] = [
  'Your back was not designed for an eight-hour chair. Give it a minute.',
  'Stand up. The next hour does not need you seated to begin.',
  'A two-minute walk is the smallest break that changes the day.',
  'Sitting still is comfortable. Moving is what keeps you comfortable.',
  'Move before your body has to ask twice.',
  'The walk is not time away from the work. It is what keeps the work possible.',
  'Your shoulders have been carrying the desk all morning. Set them down.',
  'One lap around the room is enough to reset the next hour.',
  'The chair will wait. Your back is asking now.',
  'Stand up and let your spine remember its own shape.',
  'A short walk clears more than a long scroll.',
  'You do not need a gym. You need two minutes and a corridor.',
  'The best posture is the next one. Change it.',
  'Your eyes have been at one distance all day. Give them a horizon.',
  'Walk to the window. Look further than the screen.',
  'The body remembers every hour you spend still. Give it a better memory.',
  'Sitting is not rest. Standing up is.',
  'A stiff back is a message, not a personality.',
  'Move now, while it is still easy.',
  'The next idea often arrives while you are walking.',
  'A minute on your feet beats an hour of shifting in the chair.',
  'Your concentration has a physical floor. Walk on it.',
  'Stand up before the ache becomes the background.',
  'The desk can hold the work. It cannot hold you.',
  'Walking is thinking with your whole body.',
  'Two minutes of movement, then the work again. That is the whole habit.',
  'Your body is not a chair accessory.',
  'Let the blood move before the next task does.',
  'A walk is a reset button you can press with your feet.',
  'The screen will still be there when you come back. Your back will thank you.',
  'Stand tall for a moment and notice how much lighter the work feels.',
  'You are allowed to leave the desk without leaving the work.',
  'The best break is the one that moves you.',
  'A short walk now saves a long ache later.',
  'Your spine has been patient. Be kind to it.',
  'Move like the next hour depends on it. It does.',
  'The chair is a tool. Do not become part of it.',
  'Stand up, breathe, walk. The order matters less than the movement.',
  'A tired body makes careful work feel heavy.',
  'Every step away from the desk is a step back toward focus.',
  'You do not have to earn a stretch break.',
  'The floor is the cheapest gym you will ever own.',
  'Let your legs remind you that you are not a desk.',
  'A minute of walking can undo an hour of stiffness.',
  'Change the view. Change the posture. Change the afternoon.',
  'Your back does not care about the deadline. It cares about the last hour.',
  'Stand up while you are still deciding. The decision gets easier.',
  'Walk first. The clarity follows.',
  'A body in motion is a mind with more room.',
  'The desk is where the work happens. The walk is where it settles.',
  'Give your eyes something farther away than the monitor.',
  'Two minutes of fresh air is not a luxury. It is maintenance.',
  'Your focus is not a battery. It is a circulation.',
  'Sitting longer does not make the work better. A short walk usually does.',
  'Get up before the next notification. Beat it to the punch.',
  'A short walk is a small act of respect for the body doing the work.',
  'The work will wait two minutes. Your back has waited long enough.',
  'Stand up. The chair has had enough of you.',
  'Move your body, and the afternoon moves with you.',
  'One walk now is worth an hour of feeling stiff later.',
  'Stand up for the next idea. It is easier to meet on your feet.',
];
