/**
 * The colours an unanswered completion alert wears, one per repeat.
 *
 * A finished session has to be noticed from across the desk, and the two
 * surfaces that carry it — the mini widget and the full window's card — are
 * small, dark and still. Colour is the part of the alert that travels: it is
 * the one thing visible to someone who is not looking directly at either. But a
 * colour that is already on screen can never say *again*, so the alert does not
 * have one colour. It has this palette, and every repeat moves to the next
 * entry — see `ALERT_COLOURS` for why these twelve.
 *
 * The palette is one list for both surfaces on purpose: the widget and the card
 * are the same alert seen from two places, so a repeat that changed the widget's
 * colour and left the card's alone would read as two different things happening.
 */
export interface AlertColour {
  /** The surface the alert takes over while this colour is up. */
  surface: string;
  /** The accent: the ring, the bell, the hairline and the answer buttons. */
  accent: string;
}

/**
 * Twelve colours, in the order the repeats arrive in.
 *
 * Three properties of the list are deliberate:
 *
 * - **Twelve entries, spread around the wheel.** Enough that two consecutive
 *   repeats are never neighbouring shades — a shift the eye reads as the same
 *   state seen twice — and few enough that a full cycle still reads as a
 *   sequence rather than as random colours.
 * - **A pastel accent over a very dark surface of its own hue.** An unanswered
 *   alert can sit on screen for a quarter of an hour, so nothing here is a
 *   saturated primary, and no surface is a neutral black: the accent is the one
 *   bright thing, and the surface reads as the same colour as it.
 * - **Two values per entry.** Every hairline, fill and focus ring the alert
 *   paints is its accent at a lower alpha, derived in {@link alertThemeAt} —
 *   a hand-copied near-match of a colour is the thing that goes stale when the
 *   list is edited.
 *
 * The first entry is the cool blue the alert used to be fixed on (`#7dd3fc`
 * over `#0d1b2a`), so the alert still opens in the colour it always wore.
 */
export const ALERT_COLOURS: readonly AlertColour[] = [
  { surface: '#0d1b2a', accent: '#7dd3fc' }, // sky
  { surface: '#08201f', accent: '#5eead4' }, // aqua
  { surface: '#0a2118', accent: '#6ee7b7' }, // mint
  { surface: '#1a210b', accent: '#bef264' }, // lime
  { surface: '#241f0a', accent: '#fde68a' }, // butter
  { surface: '#241a09', accent: '#fcd34d' }, // amber
  { surface: '#24150b', accent: '#fdba74' }, // apricot
  { surface: '#240f10', accent: '#fca5a5' }, // coral
  { surface: '#240d16', accent: '#fda4af' }, // rose
  { surface: '#220f21', accent: '#f0abfc' }, // orchid
  { surface: '#180f27', accent: '#c4b5fd' }, // violet
  { surface: '#101530', accent: '#a5b4fc' }, // indigo
];

/** What one alert surface paints with, as the custom properties its CSS reads. */
export interface AlertTheme {
  /** The surface colour itself, for anything that needs it outside CSS. */
  surface: string;
  /**
   * The accent colour itself — what the mini widget's countdown ring is stroked
   * with, since an SVG stroke is set as an attribute rather than through the
   * stylesheet.
   */
  accent: string;
  /** The `--alert-…` custom properties the alert's stylesheets paint from. */
  cssVars: Record<string, string>;
}

/**
 * The colour an alert wears on the `pulse`-th tone, wrapping at the end of the
 * palette.
 *
 * `pulse` is `NotificationService.alertPulse`: 0 when nothing is ringing, 1 for
 * the raise that started the alert, and one more for every repeat after it. So
 * the alert opens on the first entry — the blue it has always been — and each
 * repeat moves exactly one entry along.
 *
 * That mapping lives here rather than in each surface because the widget and the
 * full window's card are showing the same alert: if they counted separately they
 * would eventually disagree, and the same alert would be two colours on screen
 * at once.
 *
 * Returns the two colours plus the alphas of the accent, so a surface only has
 * to put `cssVars` on its alerting element: every rule beneath it then paints
 * from `var(--alert-accent)` and its siblings, and neither stylesheet holds a
 * second copy of a colour.
 */
export function alertTheme(pulse: number): AlertTheme {
  const repeat = Math.max(0, pulse - 1);
  const colour = ALERT_COLOURS[repeat % ALERT_COLOURS.length] ?? ALERT_COLOURS[0];
  const { surface, accent } = colour;
  return {
    surface,
    accent,
    cssVars: {
      '--alert-surface': surface,
      '--alert-accent': accent,
      /** The 1px edge that keeps the surface from bleeding into the desktop. */
      '--alert-edge': withAlpha(accent, 0.24),
      /** An answer button's own edge, and its stronger hover edge. */
      '--alert-border': withAlpha(accent, 0.34),
      '--alert-border-strong': withAlpha(accent, 0.6),
      /** The fill behind an answer button, resting and hovered. */
      '--alert-fill': withAlpha(accent, 0.14),
      '--alert-fill-strong': withAlpha(accent, 0.3),
      /** The keyboard focus ring, which has to be visible on its own. */
      '--alert-focus': withAlpha(accent, 0.85),
    },
  };
}

/** `#rrggbb` → `rgba(r, g, b, alpha)`, the form the alert's alphas are written in. */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * How long the mini widget shakes for, in milliseconds, as a fixed list.
 *
 * The shake is the alert's repeat made visible, so its length is really a
 * question about *the tone*: it has to last at least as long as the sound the
 * user is still hearing, or the nudge is over before the thing it is nudging
 * about. The chosen tones run from six tenths of a second (ding) to one and a
 * half (bell), so the list starts at the old 0.7s — the shortest thing that
 * still reads as a shake rather than a twitch — and runs to 4s, which is longer
 * than any of them by a wide margin.
 *
 * 2.2s is the default because it clears the bell with room to spare, which is
 * what the fixed value used to be before it became a choice.
 */
export const ALERT_SHAKE_OPTIONS: readonly number[] = [700, 1200, 1600, 2200, 3000, 4000];

/** What the shake lasts unless the user picks another entry. */
export const DEFAULT_ALERT_SHAKE_MS = 2200;

/** `2200` → `2.2 s`, for the list that picks one. */
export function formatShakeDuration(ms: number): string {
  return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)} s`;
}

/**
 * What the completion alert says after a **focus session** has finished.
 *
 * The alert's own line ("Great work! Time for a short break.") is the news; this
 * is the part that makes the next session worth starting, and it is drawn apart
 * from the news on every surface — see `NotificationService.announce` and
 * `ToastComponent`. The list is walked one entry per alert rather than one per
 * repeat: the tone may come back every minute, but the sentence the user reads
 * should be theirs to finish reading.
 *
 * Written for this app rather than quoted from anywhere, which is also true of
 * `WATER_QUOTES`: a line about *this* timer, this block and this desk is more use
 * than a famous sentence about excellence, and nothing here can be misattributed.
 */
export const FOCUS_QUOTES: readonly string[] = [
  'That was a session, not a sprint. Step away while it settles.',
  'The work is done for now — let it be done.',
  'You stopped at a good place. That is what makes tomorrow easy.',
  'Nothing left to do in this one. Go be somewhere else for a few minutes.',
  'Twenty-five focused minutes beat an afternoon of half-attention.',
  'The hard part is behind you; the next block gets a fresh start.',
  'Finished. The list can wait the length of a break.',
  'Attention is a muscle, and it just did a set.',
  'Breaks are part of the work, not a reward for it.',
  'You gave it your attention — now give your eyes a different horizon.',
  'Done, and on time. The timer is the only thing that had to stop.',
  'One solid block down. That is how a day gets built.',
  'Close the tab you were not using, and walk away from the one you were.',
  'Your best thinking happens between the sessions too.',
  'The session ended; the project did not. Rest is what keeps it moving.',
  'Well worked. Let the idea breathe.',
  'Stop here, while it still feels good.',
  'Focus is a debt you pay down in blocks. That was one.',
  'Small, complete, done. Repeat that and the week is yours.',
  'Stand up. The chair is not part of the task.',
  'You showed up for the whole session — that is the whole trick.',
  'Let the last few minutes land before you start the next thing.',
  'A clean stop is what makes a clean start possible.',
  'One more block you will not have to find time for later.',
];

/**
 * What the completion alert says when a **break** has finished.
 *
 * The other half of the same idea: after a focus session the user is being sent
 * away from the desk, and after a break they are being brought back to it. The
 * lines are about starting, not about hurrying — the first minute is the only
 * one this list has to win.
 */
export const BREAK_QUOTES: readonly string[] = [
  'Break is over. Pick the smallest next thing and begin there.',
  'The easy half is starting. Do that first.',
  'You had your pause. Give the next block the same attention.',
  'Nothing to decide — just the next session.',
  'Back to it. The timer is already counting your side.',
  'Start with the part you already know how to do.',
  'The break did its job. Prove it.',
  'Momentum is cheaper to keep than to rebuild.',
  'One block, then you get another break.',
  'The thing you were avoiding has not grown while you rested.',
  'Begin before you feel ready; the session will catch up with you.',
  'Same chair, same timer, new block.',
  'You do not need a plan, just a first sentence.',
  'Attention is back on the clock. Give it the boring first step.',
  'Everything that is finished started exactly like this.',
  'The next twenty-five minutes are the whole task.',
  'Ease in: the hardest part is the first two minutes.',
  'You are one session closer than you were an hour ago.',
  'Back in. The desk is where you left it.',
  'Let the break go and the work take over.',
  'No catch-up needed. Start where the last block stopped.',
  'Quiet the notifications; the timer is the only one you need.',
  'Do it in the order you wrote it, not the order you dread it.',
  'One session at a time is not a slogan here — it is the schedule.',
];

/**
 * What the card says when the user has **finished a task**.
 *
 * The third list, and the quietest of the three: no tone, no repeat, no desktop
 * notification — a task gets ticked off dozens of times a day and an app that
 * rang the bell every time would be answered by turning the sound off. What it
 * borrows from the other two is only the shape: the news ("Task completed", the
 * task's title) is one thing, and this line is another, drawn apart where they
 * are read.
 *
 * Where `FOCUS_QUOTES` and `BREAK_QUOTES` are about the session and the desk,
 * these are about the *list* — one item, closed, and the feel of the list being
 * one item shorter. Written for this app like the other two: a line about this
 * board is more use than a famous sentence about excellence, and nothing here
 * can be misattributed.
 */
export const TASK_QUOTES: readonly string[] = [
  'Ticked off. That is one thing the week does not get back.',
  'Finished is a state, not a feeling — and you are in it.',
  'One fewer thing to carry into tomorrow.',
  'Done, and not by accident: you decided it was worth the time.',
  'That is the shape of progress — one task, then the next.',
  'The list is shorter because of something you did, not something you meant to do.',
  'Small and complete beats big and almost.',
  'Written down, worked through, closed. That is the whole trick.',
  'The next one will be easier for having watched you do this one.',
  'You did not wait for the right moment. This was it.',
  'Closed — and the part of your head that was holding it is free again.',
  'A finished task is a decision you no longer have to make.',
  'Not everything has to be big to be worth doing properly.',
  'Off the board, and off your mind.',
  'Momentum is built out of exactly this: one item, done.',
  'You chose the work over the worry about the work.',
  'Done quietly, without ceremony. That counts too.',
  'The fastest way to finish anything is to finish something.',
  'One line off the list is one line off the shoulders.',
  'Moved, not just recorded. That is the difference.',
  'It is finished because you started it. Worth remembering.',
  'The day just got more honest about what it can hold.',
  'A closed task tells the truth about the time you had.',
  'Nothing more to do here. Take the win, and take the next one.',
];

/**
 * The `index`-th line of `quotes`, wrapping at the end of the list.
 *
 * `index` is a count of alerts, not a clock: the caller keeps it, so the same
 * sentence does not come back two sessions in a row and the list is walked in
 * order rather than sampled at random. Negative or fractional counts wrap the
 * same way, which is what keeps a test able to ask for any of them.
 */
export function quoteAt(quotes: readonly string[], index: number): string {
  if (quotes.length === 0) return '';
  const at = Math.trunc(Number.isFinite(index) ? index : 0);
  return quotes[((at % quotes.length) + quotes.length) % quotes.length];
}
