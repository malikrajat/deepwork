/** One drink, as it was logged. */
export interface WaterEntry {
  id: string;
  /** How much was drunk, in millilitres. */
  amountMl: number;
  /** When it was drunk, ISO 8601 UTC — the same shape every other instant uses. */
  loggedAt: string;
}

/**
 * The water reminder preferences, as stored in `settings`.
 *
 * Kept together rather than spread through `AppSettings` so the six values that
 * only ever change together can be read, passed and tested as one thing.
 */
export interface WaterPrefs {
  enabled: boolean;
  /** `HH:MM`, local time — the start of the window reminders may fire in. */
  start: string;
  /** `HH:MM`, local time — the end of that window. */
  end: string;
  /** Minutes between reminders; one of `WATER_INTERVAL_OPTIONS`. */
  intervalMinutes: number;
  /** Millilitres one drink counts as; one of `WATER_AMOUNT_OPTIONS`. */
  amountMl: number;
  /** The day's target; one of `WATER_GOAL_OPTIONS`. */
  goalMl: number;
  /**
   * While the window is minimised, count the glass instead of asking for it.
   *
   * See `AppSettings.waterAutoLogWhenMinimized` for why this exists at all.
   */
  autoLogWhenMinimized: boolean;
}

/**
 * The reminder as it is being asked, for as long as it stays unanswered.
 *
 * A reminder that waits for an answer is a question, not a message, so it has
 * everything the card needs to ask it: the glass the **Yes** answer would log,
 * the day so far, and the line that makes the glass worth taking. It is a plain
 * object held in one signal — no timer, no queue and nothing that accumulates —
 * so there is never more than one question on screen at a time.
 */
export interface WaterNudge {
  /** Bumped for every nudge, so a new one re-animates instead of being reused. */
  id: number;
  /** What **Yes** logs, in millilitres. */
  amountMl: number;
  /** The same glass, ready to read (`500 ml`). */
  glassLabel: string;
  title: string;
  body: string;
  /** One motivational line, chosen from `WATER_QUOTES`. */
  quote: string;
}
