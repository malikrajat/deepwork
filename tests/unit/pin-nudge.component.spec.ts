import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { signal } from '@angular/core';
import { PinNudgeComponent } from '../../src/app/shared/components/pin-nudge/pin-nudge.component';
import { TaskbarPinService } from '../../src/app/core/services/taskbar-pin.service';
import { PIN_ACKNOWLEDGE } from '../../src/app/core/constants/pin.constants';

const SOURCE = resolve(
  __dirname,
  '../../src/app/shared/components/pin-nudge/pin-nudge.component.ts',
);
const src = () => readFileSync(SOURCE, 'utf8');

const makeMockPin = () => ({
  visible: signal(true),
  settled: signal(false),
  busy: signal(false),
  awaitingAnswer: signal(false),
  help: signal<string | null>(null),
  eyebrow: signal('Taskbar'),
  title: signal('Keep DeepWork one click away'),
  body: signal('Pin DeepWork to the taskbar and it is one click away.'),
  target: signal('taskbar'),
  confirmLabel: signal('Pin to taskbar'),
  dismissLabel: 'Not now',
  pin: vi.fn().mockResolvedValue(undefined),
  dismiss: vi.fn().mockResolvedValue(undefined),
});

/**
 * The card that asks, and the card that instructs.
 *
 * Asserted against the template's source rather than rendered: this project
 * mandates signal inputs, which Angular's JIT compiler — the only one available
 * under Vitest — cannot resolve. See `welcome-prefs-dialog.component.spec.ts` for
 * the same documented constraint.
 */
describe('PinNudgeComponent', () => {
  let pin: ReturnType<typeof makeMockPin>;
  let component: PinNudgeComponent;

  beforeEach(() => {
    pin = makeMockPin();
    TestBed.configureTestingModule({
      providers: [{ provide: TaskbarPinService, useValue: pin }],
    });
    component = TestBed.runInInjectionContext(() => new PinNudgeComponent());
  });

  afterEach(() => TestBed.resetTestingModule());

  it('reads everything it says from the service', () => {
    expect(component.pin).toBe(pin);
  });

  // ── The question ──────────────────────────────────────────────────────────

  it('asks with the yes and the no, and nothing else', () => {
    const source = src();
    expect(source).toContain('pin.confirmLabel()');
    expect(source).toContain('pin.dismissLabel');
    expect(source).toContain('(click)="pin.pin()"');
    expect(source).toContain('(click)="pin.dismiss()"');
  });

  it('says which button is in flight while the desktop is being asked', () => {
    const source = src();
    expect(source).toContain("pin.busy() ? 'Asking '");
  });

  it('is announced as a question rather than as a toast', () => {
    const source = src();
    expect(source).toContain('role="alertdialog"');
    expect(source).toContain('aria-labelledby');
    expect(source).toContain('aria-describedby');
  });

  // ── Every face has a way out ──────────────────────────────────────────────
  //
  // Not decoration. An earlier version of this card could be dismissed only by
  // its own buttons, and when a bug left those unresponsive the user had no way
  // past it at all. These are the routes that make that impossible to repeat.

  it('carries a close button of its own, on every face that has a question', () => {
    const source = src();
    expect(source).toContain('class="pin-close"');
    expect(source).toContain('(click)="pin.dismiss()"');
    // ...and it is not offered while there is nothing to close.
    expect(source).toContain('@if (!pin.settled())');
  });

  it('answers to Escape from anywhere in the window', () => {
    const source = src();
    // Bound on the document, so it works whether or not focus ever reached the
    // card — the exit that matters when the app itself is misbehaving.
    expect(source).toContain("'(document:keydown.escape)': 'pin.dismiss()'");
  });

  it('takes focus when it appears, so Tab and Enter can reach its controls', () => {
    const source = src();
    expect(source).toContain('tabindex="-1"');
    expect(source).toContain('viewChild');
    expect(source).toContain('element?.focus?.()');
  });

  // ── It does not take the app over ─────────────────────────────────────────

  it('draws no backdrop and covers no part of the window it is not using', () => {
    const source = src();
    // The host is a corner, not a sheet of glass over the app: a card that asks a
    // question must leave everything outside it working exactly as it was.
    expect(source).not.toContain('inset: 0');
    expect(source).not.toContain('backdrop-filter: blur(6px)');
    expect(source).not.toContain('aria-modal="true"');
    expect(source).toContain('aria-modal="false"');
  });

  // ── Waiting on the desktop ────────────────────────────────────────────────

  it('says what is happening while the desktop has its own prompt up', () => {
    const source = src();
    expect(source).toContain('pin.awaitingAnswer()');
    // The "Not now" button stays usable while waiting: an answer the user cannot
    // give is the bug this state exists to fix.
    expect(source).toContain('{{ pin.dismissLabel }}');
  });

  // ── The instruction ───────────────────────────────────────────────────────

  it('shows the desktop\u2019s own words when it would not do the pinning', () => {
    const source = src();
    expect(source).toContain('pin.help()');
    expect(source).toContain('pin-help');
  });

  it('leaves the instruction up until it is acknowledged', () => {
    const source = src();
    // The acknowledge branch replaces *both* buttons: an instruction with a
    // "Pin to taskbar" still next to it would be asking again.
    expect(source).toContain('pin.help()');
    expect(source).toContain('{{ acknowledge }}');
    // ...and the word itself comes from the constants, not from the template.
    expect(component.acknowledge).toBe(PIN_ACKNOWLEDGE);
  });

  // ── The confirmation ──────────────────────────────────────────────────────

  it('confirms with one line and offers nothing to click', () => {
    const source = src();
    expect(source).toContain("pin.settled() ? 'Pinned'");
    // Nothing to answer on this face: no action button, and the close button is
    // hidden too — the good-news card has no controls at all and takes itself
    // away on the service's own timer.
    expect(source).toContain('@if (pin.settled()) {');
    expect(source).toContain('@if (!pin.settled())');
  });

  // ── Presentation ──────────────────────────────────────────────────────────

  it('names the place in the shell\u2019s own terms', () => {
    const source = src();
    expect(source).toContain('pin.eyebrow()');
    expect(source).toContain('{{ pin.target() }}');
  });

  it('respects a system that has asked for less motion', () => {
    expect(src()).toContain('prefers-reduced-motion');
  });

  it('fits a narrow window rather than hanging off the corner', () => {
    const source = src();
    expect(source).toContain('@media (max-width: 640px)');
    expect(source).toContain('max-width: 100%');
  });
});
