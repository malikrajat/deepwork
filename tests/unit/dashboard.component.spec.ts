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
