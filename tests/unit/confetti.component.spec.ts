import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ConfettiComponent } from '../../src/app/shared/components/confetti/confetti.component';

describe('ConfettiComponent (behavior)', () => {
  let c: ConfettiComponent;

  beforeEach(() => {
    c = TestBed.runInInjectionContext(() => new ConfettiComponent());
  });

  it('starts hidden and shows particles when fired', () => {
    expect(c.isVisible()).toBe(false);
    expect(c.particles.length).toBe(0);
    c.fire();
    expect(c.isVisible()).toBe(true);
    expect(c.particles.length).toBeGreaterThan(0);
    // dismiss clears
    c.dismiss();
    expect(c.isVisible()).toBe(false);
    expect(c.particles.length).toBe(0);
  });
});
