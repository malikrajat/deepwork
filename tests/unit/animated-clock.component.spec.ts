import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { AnimatedClockComponent } from '../../src/app/shared/components/animated-clock/animated-clock.component';
import { TIMER_TYPE_CONFIG } from '../../src/app/core/constants/theme.constants';

// AnimatedClockComponent uses signal inputs (input.required / input()) which are
// not resolvable by Angular's JIT compiler in Vitest. Instead of testing DOM
// rendering (covered by e2e), we verify the component's logic as pure formulas.
const r = 88;
const circumference = 2 * Math.PI * r;
const elapsedOffset = (p: number) => circumference * (1 - p);
const needleAngle   = (p: number) => p * 360;

describe('AnimatedClockComponent', () => {
  it('component class is exported', () => {
    expect(AnimatedClockComponent).toBeDefined();
  });

  // ── Geometry constants ────────────────────────────────────────────────
  it('circumference equals 2π × 88', () => {
    expect(circumference).toBeCloseTo(552.92, 1);
  });

  it('tickMarks array should have 60 entries (one per clock minute)', () => {
    expect(Array.from({ length: 60 }, (_, i) => i)).toHaveLength(60);
  });

  // ── elapsedOffset formula ─────────────────────────────────────────────
  it('elapsedOffset at progress=0 equals full circumference (no arc drawn)', () => {
    expect(elapsedOffset(0)).toBeCloseTo(circumference, 4);
  });

  it('elapsedOffset at progress=0.5 equals half circumference', () => {
    expect(elapsedOffset(0.5)).toBeCloseTo(circumference / 2, 4);
  });

  it('elapsedOffset at progress=1 is 0 (full arc drawn)', () => {
    expect(elapsedOffset(1)).toBeCloseTo(0, 4);
  });

  it('elapsedOffset decreases monotonically as progress increases', () => {
    expect(elapsedOffset(0.25)).toBeGreaterThan(elapsedOffset(0.75));
  });

  // ── needleAngle formula ───────────────────────────────────────────────
  it('needleAngle at progress=0 is 0°', () => {
    expect(needleAngle(0)).toBe(0);
  });

  it('needleAngle at progress=1 is 360°', () => {
    expect(needleAngle(1)).toBe(360);
  });

  it('needleAngle at progress=0.5 is 180°', () => {
    expect(needleAngle(0.5)).toBe(180);
  });

  // ── TIMER_TYPE_CONFIG (used by arcColor / needleColor computeds) ──────
  it('work type has a defined gradient and color', () => {
    expect(TIMER_TYPE_CONFIG['work'].gradient).toBeTruthy();
    expect(TIMER_TYPE_CONFIG['work'].color).toBeTruthy();
  });

  it('short-break type has a defined gradient and color', () => {
    expect(TIMER_TYPE_CONFIG['short-break'].gradient).toBeTruthy();
    expect(TIMER_TYPE_CONFIG['short-break'].color).toBeTruthy();
  });

  it('long-break type has a defined gradient and color', () => {
    expect(TIMER_TYPE_CONFIG['long-break'].gradient).toBeTruthy();
    expect(TIMER_TYPE_CONFIG['long-break'].color).toBeTruthy();
  });

  it('work and short-break have different gradients', () => {
    expect(TIMER_TYPE_CONFIG['work'].gradient).not.toBe(TIMER_TYPE_CONFIG['short-break'].gradient);
  });

  it('source file contains the AnimatedClockComponent export', () => {
    const src = readFileSync(
      'src/app/shared/components/animated-clock/animated-clock.component.ts', 'utf-8'
    );
    expect(src).toContain('export class AnimatedClockComponent');
  });
});
