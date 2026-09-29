import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('DashboardComponent (file presence)', () => {
  it('source file should exist and export class', () => {
    const p = resolve(__dirname, '../../src/app/pages/dashboard/dashboard.component.ts');
    const src = readFileSync(p, 'utf8');
    expect(src.includes('export class DashboardComponent')).toBe(true);
  });
});

describe('DashboardComponent (start button label logic)', () => {
  const src = readFileSync(
    resolve(__dirname, '../../src/app/pages/dashboard/dashboard.component.ts'),
    'utf8'
  );

  it('shows "Start Focus" when timer type is work and not paused mid-session', () => {
    // The template must use timerType() === 'work' to show 'Start Focus'
    expect(src).toContain("timer.timerType() === 'work' ? 'Start Focus' : 'Start Break'");
  });

  it('shows "Start Break" label branch for break timer types', () => {
    expect(src).toContain("'Start Break'");
  });

  it('shows "Resume" when remaining seconds is less than total duration', () => {
    expect(src).toContain("timer.remainingSeconds() < timer.totalDuration() ? 'Resume'");
  });

  it('the start button label expression appears in both main and fullscreen controls', () => {
    const matches = src.match(/timer\.timerType\(\) === 'work' \? 'Start Focus' : 'Start Break'/g);
    expect(matches?.length).toBe(2);
  });
});

/**
 * The clock card used to grow a scrollbar. Its contents were sized from the
 * window while the card itself is a fixed shape, so a linked task (which adds
 * the dropdown row), the stacked layout under 1024px, or the roomier padding on
 * a large monitor pushed the dial and the controls past the card's height — and
 * `overflow-y: auto` turned that into a scrollbar inside the timer face.
 *
 * The card is not a scroll region any more: it clips, and the dial takes the
 * height left over by the task row and the controls. These assertions hold that
 * down, because both halves are invisible in a screenshot of a tall window.
 */
describe('DashboardComponent (the clock card never scrolls)', () => {
  const src = readFileSync(
    resolve(__dirname, '../../src/app/pages/dashboard/dashboard.component.ts'),
    'utf8',
  );

  /** The declarations of a CSS rule, so prose in a comment cannot satisfy a check. */
  function ruleBody(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(src)?.[1] ?? '';
  }

  it('keeps the card out of the scrolling business', () => {
    const card = ruleBody('.timer-card-inner');

    expect(card).toContain('overflow: hidden');
    expect(card).not.toMatch(/overflow(-\w+)?:\s*(auto|scroll)/);
  });

  it('sizes the dial from the space the card has left, not from the window', () => {
    const dial = ruleBody('.timer-card-inner app-animated-clock');

    // It fills the box it is given — its own 180-360px clamp is overridden — and
    // keeps that box square, so a short card shrinks the dial instead of
    // overflowing it.
    expect(dial).toContain('--clock-size: 100%');
    expect(dial).toContain('aspect-ratio: 1');
    expect(dial).toContain('flex: 1 1 auto');
    expect(dial).toContain('max-height: min(340px, 35vmin)');
  });

  it('gives the row the height the dial, the task row and the controls need', () => {
    expect(ruleBody('.main-row')).toContain('flex: 1 0 560px');
    // The timeline stacks underneath below 1024px and takes a slice of the row
    // with it, so that layout needs a floor of its own.
    expect(src).toMatch(/@media \(max-width: 1024px\)[\s\S]*?\.main-row\s*\{[\s\S]*?flex-basis: 680px/);
  });
});
