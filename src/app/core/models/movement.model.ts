/**
 * The stand-and-walk reminder's preferences, as stored in `settings`.
 *
 * Kept together rather than spread through `AppSettings` so the four values that
 * only ever change together can be read, passed and tested as one thing — the
 * same shape the water reminder uses.
 */
export interface MovementPrefs {
  enabled: boolean;
  /** `HH:MM`, local time — the start of the window reminders may fire in. */
  start: string;
  /** `HH:MM`, local time — the end of that window. */
  end: string;
  /** Minutes between reminders; one of `MOVEMENT_INTERVAL_OPTIONS`. */
  intervalMinutes: number;
}

/**
 * The reminder as it is being asked, for as long as it stays unanswered.
 *
 * A reminder that waits for an answer is a question, not a message. It carries
 * everything the card needs to ask it: what to say, the line that makes leaving
 * the chair worth it, and whether the full window should be brought forward to
 * show it. One plain object held in one signal — no timer, no queue — so there
 * is never more than one question on screen at a time.
 */
export interface MovementNudge {
  /** Bumped for every nudge, so a new one re-animates instead of being reused. */
  id: number;
  title: string;
  body: string;
  /** One motivational line, chosen from `MOVEMENT_QUOTES`. */
  quote: string;
  /** How long the walk is meant to last, in minutes. */
  walkMinutes: number;
  /**
   * Whether the full window should be brought forward to show the card.
   *
   * True for every ordinary reminder, because a question has to be somewhere the
   * user can answer it. False for the one case where it is already somewhere:
   * while the window is the mini widget and the system notification can carry
   * the two answers, the question lives on the sticky toast and the widget is
   * left exactly where it is. See `MovementReminderService.remind`.
   */
  surfaceWindow: boolean;
}
