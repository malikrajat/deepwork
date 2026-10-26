import { BREAK_QUOTES, FOCUS_QUOTES, TASK_QUOTES } from './alert.constants';
import { MOVEMENT_QUOTES } from './movement.constants';
import { REMINDER_QUOTES } from './reminder.constants';
import { WATER_QUOTES } from './water.constants';

/**
 * Every kind of message the app can raise, as the quote list it draws from.
 *
 * A quote only does its job when it belongs to the news it arrived with: a
 * water reminder gets a line about water, a stand-and-walk reminder gets a line
 * about leaving the chair, a finished task gets a line about the list, and a
 * pause gets a line about stopping. One shared "motivational" list would be
 * cheaper and would read as noise the third time it appeared under the wrong
 * heading, so each notification kind has its own deck.
 */
export type NotificationQuoteKind =
  | 'focus'
  | 'break'
  | 'task'
  | 'water'
  | 'move'
  | 'reminder'
  | 'pause'
  | 'resume'
  | 'mute'
  | 'unmute'
  | 'taskAdded'
  | 'taskRecord'
  | 'desktop'
  | 'update';

/** What a pause says: stopping is part of the method, not an exit from it. */
export const PAUSE_QUOTES: readonly string[] = [
  'You are allowed to stop. That is part of the plan.',
  'A pause is not a failure. It is maintenance.',
  'Rest now, so the next block has something to work with.',
  'The timer can wait. So can the list.',
  'Step away. Nothing here needs you for a minute.',
  'Quiet is a tool. Use it.',
  'You did not quit. You paused.',
  'A good pause makes a better start.',
  'Let the noise settle before you pick the next thing.',
  'You can come back. That is what makes stopping safe.',
  'Rest is productive in ways you cannot measure.',
  'Give your attention a place to land softly.',
  'Pause the app, not your progress.',
  'The work will keep. Your energy needs the break.',
  'Nothing is lost by stopping on purpose.',
  'Choose rest before it chooses you.',
  'A minute of quiet can save an hour of scattered work.',
  'Let your shoulders drop. The pause is real.',
  'You are still on track. This is a lane, not an exit.',
  'Quiet the reminders and hear yourself think.',
  'Pausing is how you stay in it for the long run.',
  'You do not have to earn rest.',
  'The world keeps turning while you breathe.',
  'Stop cleanly. Start cleanly. That is the method.',
];

/** What a resume says: the way back in is one small step. */
export const RESUME_QUOTES: readonly string[] = [
  'Back in. Start with the smallest thing.',
  'The pause is over. The next step is still waiting.',
  'You rested. Now give the work your attention again.',
  'Return gently, then stay.',
  'One session is enough to find your rhythm.',
  'The work did not grow while you were away.',
  'Pick up where you left off, not where you think you should be.',
  'Welcome back. The timer is on your side.',
  'Begin again. That is all starting is.',
  'You have a fresh block. Use it well.',
  'Come back to the task before the noise.',
  'Momentum begins with one deliberate action.',
  'The break did its job. So can you.',
  'Start where you are, with what you have.',
  'The next twenty-five minutes are a clean page.',
  'You know the first move. Make it.',
  'Back to the desk, back to what matters.',
  'Resume without apology. You needed the pause.',
  'One small start and the rest follows.',
  'The work is still yours. Take it back.',
  'Settle in before you speed up.',
  'You are here. That is the hardest part.',
  'Return to the promise you made this morning.',
  'Fresh start, same purpose.',
];

/** What a mute says: the noise goes, the work stays. */
export const MUTE_QUOTES: readonly string[] = [
  'Silence is allowed. The work still counts.',
  'Quiet the bell, keep the focus.',
  'You can hear yourself think now.',
  'Sound off, attention on.',
  'A quieter app for a clearer head.',
  'The reminders are still there. Only the noise is gone.',
  'Mute the sound, not the progress.',
  'Some moments need silence more than a chime.',
  'The tone is off. The timer is still yours.',
  'Peace and quiet, on purpose.',
  'You turned the volume down. That is a choice for yourself.',
  'Silence now, sound when it suits you.',
  'No bell, no guilt.',
  'The work is quieter. The goal is the same.',
  'Quiet is a boundary. You just set it.',
  'A mute is a small act of control.',
  'The reminders can wait for your ears.',
  'Focus does not need a soundtrack.',
  'Turn it down and turn it inward.',
  'You will hear the next one when you are ready.',
];

/** What an unmute says: let the reminder reach you again. */
export const UNMUTE_QUOTES: readonly string[] = [
  'Sound is back. So is the rhythm.',
  'The bell can find you again.',
  'Let the reminders reach you.',
  'Back on, and ready to be nudged.',
  'A louder app for a day that needs it.',
  'You turned the sound back on. Good.',
  'The tone returns, and so does the cadence.',
  'Let the chime do its small job.',
  'Sound on. You are back in the loop.',
  'Reminders will ring again — let them help.',
  'A gentle bell can save a forgotten promise.',
  'Unmuted, and in control of it.',
  'The sound is yours to turn up.',
  'Ready for the next nudge.',
  'Turn it up. Let the app do its job.',
  'You asked to be reminded. Now you can hear it.',
  'Sound back on, no pressure attached.',
  'The next chime is a small favour.',
  'Let the reminder arrive at full strength.',
  'Back to audibility, back to the plan.',
];

/** What a captured task says: writing it down is the first completed step. */
export const TASK_ADDED_QUOTES: readonly string[] = [
  'Written down is half done.',
  'A task on the list is a promise with a place to live.',
  'You gave the thought somewhere to go.',
  'One more thing out of your head and onto the board.',
  'Captured. Now it cannot slip away.',
  'The list just got clearer about what matters.',
  'Good. Start small and let the list work for you.',
  'Writing it down is not delay. It is design.',
  'You turned a passing thought into a plan.',
  'A task added is a future action made visible.',
  'One line now, one win later.',
  'The board grows so your head does not have to.',
  'You chose to remember on purpose.',
  'Noted. The next step is simply to begin.',
  'The first act of finishing is writing it down.',
  'Out of the swirl, into the list.',
  'Your attention is free again, and the task is safe.',
  'A good list is a map. You just added a road.',
  'You made the invisible visible.',
  'One thing to do later, honestly recorded.',
  'The task has a home now.',
  'Capturing it is a kindness to tomorrow.',
  'A small entry with real weight.',
  'You are building the day one line at a time.',
  'The list is a tool. You just used it well.',
  'Now the thing you meant to do has a place to start.',
  'Written down, so it can be finished.',
  'You gave the future a clear instruction.',
  'One idea rescued from forgetting.',
  'The plan got one step more concrete.',
];

/** What a record of the work says: the list leaves the app, not your ownership. */
export const TASK_RECORD_QUOTES: readonly string[] = [
  'Your work is worth keeping a record of.',
  'A written history is a quiet kind of confidence.',
  'The list leaves the app, not your ownership of it.',
  'You keep the data. That is the point.',
  'A backup is a promise to your future self.',
  'Saved, so the effort is not lost.',
  'The record is yours to keep and yours to carry.',
  'A good export is a good beginning somewhere else.',
  'You documented the work. That is care.',
  'Files on your machine, decisions in your hands.',
  'Your tasks, portable and private.',
  'A list you can take anywhere is a list you can trust.',
  'The work is recorded and the record is yours.',
  'One file, one clear history, no lock-in.',
  'Keep the receipts. They tell the truth about the effort.',
  'What you did is worth being able to look back on.',
  'A template makes the next start easier.',
  'The blank page just got a head start.',
  'Good structure saves future attention.',
  'You set up tomorrow before it arrived.',
];

/** What a desktop setup step says: make the useful thing easy to reach. */
export const DESKTOP_QUOTES: readonly string[] = [
  'One click away is one excuse fewer.',
  'Keep the timer where you can see it.',
  'A tool that is ready is a tool you use.',
  'Set it up once. Benefit from it every day.',
  'The best habit is the one within reach.',
  'Make the good choice the easy one.',
  'Bring it closer and the day gets simpler.',
  'A quiet icon in the corner can keep a promise.',
  'You are setting future-you up to win.',
  'The fewer steps between you and the work, the better.',
  'A little setup now, a lot of focus later.',
  'Pin it, and stop hunting for it.',
  'Make DeepWork part of your desk.',
  'A timer you can find is a timer you will use.',
  'Keep the useful thing close.',
  'The desktop is where the work happens. Put the timer there.',
  'One small convenience, repeated daily, changes the day.',
  'Reduce the friction; keep the focus.',
  'Make it open when you sit down.',
  'A ready tool is a quiet advantage.',
  'Setup is not a distraction. It is preparation.',
  'Give your routine a better default.',
  'The fewer decisions, the more attention for the work.',
  'Keep your focus tools within arm’s reach.',
  'A one-click start is a real head start.',
  'The best time to set this up is before you need it.',
  'A small shortcut that pays every day.',
  'Let the tool wait for you, not the other way round.',
  'You are building an environment that supports you.',
  'Close at hand, out of the way.',
  'The faster it opens, the sooner you begin.',
  'A ready timer makes starting less of a decision.',
  'Set the default, then forget about it.',
  'Make focus the path of least resistance.',
  'One icon, one click, one session.',
  'Good tools disappear into the routine.',
  'Put the reminder where you will actually see it.',
  'A desk set up for focus is a desk that works.',
  'This is the unglamorous part of a good habit.',
  'Keep it close. Keep going.',
];

/** What an update says: small improvements are maintenance for the work. */
export const UPDATE_QUOTES: readonly string[] = [
  'A better version is a small win for tomorrow.',
  'Update now, thank yourself later.',
  'Progress includes the tools you use.',
  'A newer build, a smoother day.',
  'Keep the machine sharp.',
  'Small improvements compound.',
  'The work stays; the rough edges go.',
  'An update is maintenance, not interruption.',
  'Better tools make better focus.',
  'Take the improvement while it is offered.',
  'A new version is a quiet fresh start.',
  'The best time to update is before it costs you.',
  'Keep your workspace current.',
  'Every release is a promise kept.',
  'You do not have to do anything heroic. Just update.',
  'A newer version, the same purpose.',
  'Polish matters over a long week.',
  'Upgrade the tool, keep the habit.',
  'One click for a cleaner run.',
  'The work you care about deserves the better build.',
];

/**
 * The quote decks, by the kind of message they belong to.
 *
 * The session, task, water, movement and standing-reminder decks live beside the
 * features that own them — `alert.constants.ts`, `water.constants.ts`,
 * `movement.constants.ts` and `reminder.constants.ts` — and are gathered here so
 * that one rotation can walk all of them. The rest are here because they are about a control the app
 * offers rather than about a session: a pause, a resume, a mute, a captured
 * task, an export, a desktop setup step and an update.
 *
 * Every deck is long on purpose. The rotation walks a deck in order and does not
 * reset between launches, so a deep deck is what keeps the same sentence from
 * greeting the user every morning.
 *
 * Declared after the decks rather than above them: a `const` read before its
 * declaration is in the temporal dead zone, and building this map at the top of
 * the file would throw before any list existed.
 */
export const NOTIFICATION_QUOTES: Record<NotificationQuoteKind, readonly string[]> = {
  focus: FOCUS_QUOTES,
  break: BREAK_QUOTES,
  task: TASK_QUOTES,
  water: WATER_QUOTES,
  move: MOVEMENT_QUOTES,
  reminder: REMINDER_QUOTES,
  pause: PAUSE_QUOTES,
  resume: RESUME_QUOTES,
  mute: MUTE_QUOTES,
  unmute: UNMUTE_QUOTES,
  taskAdded: TASK_ADDED_QUOTES,
  taskRecord: TASK_RECORD_QUOTES,
  desktop: DESKTOP_QUOTES,
  update: UPDATE_QUOTES,
};
