import { describe, it, expect } from 'vitest';
import {
  ALERT_COLOURS,
  ALERT_SHAKE_OPTIONS,
  BREAK_QUOTES,
  DEFAULT_ALERT_SHAKE_MS,
  FOCUS_QUOTES,
  TASK_QUOTES,
  alertTheme,
  formatShakeDuration,
  quoteAt,
} from '../../src/app/core/constants/alert.constants';

/**
 * The alert's colour sequence, pinned down.
 *
 * The palette is doing a job rather than decorating one: it is how an unanswered
 * alert says *again* to someone who is not looking at it directly. That only
 * works while three things stay true — the entries are different enough to be
 * told apart, each one is legible where it is painted, and the sequence moves
 * exactly one entry per tone — so those are what this checks.
 */

/** The channels of a `#rrggbb` colour. */
function channels(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two opaque colours. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('the alert palette', () => {
  it('is a sequence: 10 to 12 colours, so a repeat always has somewhere to go', () => {
    // Ten is the floor the user asked for; past twelve a cycle stops reading as
    // a sequence and starts reading as a different colour every time.
    expect(ALERT_COLOURS.length).toBeGreaterThanOrEqual(10);
    expect(ALERT_COLOURS.length).toBeLessThanOrEqual(12);
  });

  it('never repeats an accent or a surface', () => {
    expect(new Set(ALERT_COLOURS.map((colour) => colour.accent)).size).toBe(ALERT_COLOURS.length);
    expect(new Set(ALERT_COLOURS.map((colour) => colour.surface)).size).toBe(ALERT_COLOURS.length);
  });

  it('keeps every accent legible on its own surface', () => {
    // The accent is painted on the surface as text and as icons — the bell, the
    // buttons — so "easy to look at" must not have been bought with contrast.
    for (const { surface, accent } of ALERT_COLOURS) {
      expect(contrast(surface, accent), `${accent} on ${surface}`).toBeGreaterThan(4.5);
    }
  });
});

describe('the colour an alert wears', () => {
  it('opens on the blue the alert has always worn', () => {
    // Pulse 0 is "nothing is ringing"; pulse 1 is the raise, which is the first
    // tone, so both are the first entry — an alert never appears on a colour it
    // has not sounded for.
    expect(alertTheme(0).accent).toBe('#7dd3fc');
    expect(alertTheme(1).accent).toBe('#7dd3fc');
    expect(alertTheme(1).surface).toBe('#0d1b2a');
  });

  it('moves exactly one entry per tone, and wraps round the palette', () => {
    for (let repeat = 1; repeat < ALERT_COLOURS.length * 2; repeat += 1) {
      const entry = ALERT_COLOURS[repeat % ALERT_COLOURS.length];
      expect(alertTheme(repeat + 1).accent).toBe(entry.accent);
    }
  });

  it('derives every alpha from the entry it is showing', () => {
    // The hairlines, fills and focus ring are the accent at lower alphas rather
    // than six hand-written colours per entry: a near-match of a colour is what
    // goes stale the next time the palette is edited.
    const theme = alertTheme(1);
    const [r, g, b] = channels(theme.accent);
    expect(theme.cssVars['--alert-surface']).toBe(theme.surface);
    expect(theme.cssVars['--alert-accent']).toBe(theme.accent);
    expect(theme.cssVars['--alert-edge']).toBe(`rgba(${r}, ${g}, ${b}, 0.24)`);
    expect(theme.cssVars['--alert-border']).toBe(`rgba(${r}, ${g}, ${b}, 0.34)`);
    expect(theme.cssVars['--alert-border-strong']).toBe(`rgba(${r}, ${g}, ${b}, 0.6)`);
    expect(theme.cssVars['--alert-fill']).toBe(`rgba(${r}, ${g}, ${b}, 0.14)`);
    expect(theme.cssVars['--alert-fill-strong']).toBe(`rgba(${r}, ${g}, ${b}, 0.3)`);
    expect(theme.cssVars['--alert-focus']).toBe(`rgba(${r}, ${g}, ${b}, 0.85)`);
  });
});

describe('how long the alert shakes for', () => {
  it('offers a length for every tone, and starts on the one it used to be fixed at', () => {
    // The shake is the repeat made visible, so it has to outlast the tone it is
    // beating along with: the chosen tones run from 0.6s (ding) to 1.5s (bell),
    // and the default is the 2.2s the widget wore while the length was hard-coded.
    expect(ALERT_SHAKE_OPTIONS).toContain(DEFAULT_ALERT_SHAKE_MS);
    expect(DEFAULT_ALERT_SHAKE_MS).toBeGreaterThanOrEqual(1500);
    expect(Math.min(...ALERT_SHAKE_OPTIONS)).toBeLessThan(DEFAULT_ALERT_SHAKE_MS);
    expect(Math.max(...ALERT_SHAKE_OPTIONS)).toBeGreaterThan(DEFAULT_ALERT_SHAKE_MS);
    // Smallest first, so the list in Settings reads as a scale.
    expect([...ALERT_SHAKE_OPTIONS].sort((a, b) => a - b)).toEqual([...ALERT_SHAKE_OPTIONS]);
  });

  it('labels the lengths the way the switch shows them', () => {
    expect(formatShakeDuration(700)).toBe('0.7 s');
    expect(formatShakeDuration(2200)).toBe('2.2 s');
    expect(formatShakeDuration(3000)).toBe('3 s');
  });
});

describe('the alert quotes', () => {
  it('is a long list for each half of the cycle, with no line repeated', () => {
    // A focus session and a break are opposite instructions — step away, come
    // back — so they are two lists rather than one, and long enough that a day
    // of sessions does not repeat itself.
    expect(FOCUS_QUOTES.length).toBeGreaterThanOrEqual(20);
    expect(BREAK_QUOTES.length).toBeGreaterThanOrEqual(20);
    // The card raised when a *task* is finished draws from a third list, so a
    // busy list of tasks cannot quietly become a list of session lines.
    expect(TASK_QUOTES.length).toBeGreaterThanOrEqual(20);
    expect(new Set([...FOCUS_QUOTES, ...BREAK_QUOTES, ...TASK_QUOTES]).size).toBe(
      FOCUS_QUOTES.length + BREAK_QUOTES.length + TASK_QUOTES.length,
    );
    for (const line of [...FOCUS_QUOTES, ...BREAK_QUOTES, ...TASK_QUOTES]) {
      expect(line.trim()).toBe(line);
      expect(line.length).toBeGreaterThan(10);
    }
  });

  it('walks a list in order and wraps round it', () => {
    expect(quoteAt(FOCUS_QUOTES, 0)).toBe(FOCUS_QUOTES[0]);
    expect(quoteAt(FOCUS_QUOTES, FOCUS_QUOTES.length)).toBe(FOCUS_QUOTES[0]);
    expect(quoteAt(FOCUS_QUOTES, FOCUS_QUOTES.length + 3)).toBe(FOCUS_QUOTES[3]);
    expect(quoteAt(BREAK_QUOTES, -1)).toBe(BREAK_QUOTES[BREAK_QUOTES.length - 1]);
    expect(quoteAt(TASK_QUOTES, 0)).toBe(TASK_QUOTES[0]);
    expect(quoteAt(TASK_QUOTES, TASK_QUOTES.length + 2)).toBe(TASK_QUOTES[2]);
    // A list with nothing in it is a missing quote, not a crash.
    expect(quoteAt([], 4)).toBe('');
  });
});
