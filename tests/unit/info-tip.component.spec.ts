import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { InfoTipComponent } from '../../src/app/shared/components/info-tip/info-tip.component';

const SOURCE = resolve(
  __dirname,
  '../../src/app/shared/components/info-tip/info-tip.component.ts'
);

/**
 * The education affordance for "always on top", "start with system" and the mini
 * widget. Users who do not understand a setting will not turn it on, so the
 * popover has to open, explain, and then get out of the way.
 *
 * Built with an explicit `ElementRef` rather than `TestBed.createComponent`,
 * because this project mandates signal inputs and Angular's JIT compiler (the
 * only option under Vitest) cannot resolve them — the same limitation documented
 * in `timeline-bar.component.spec.ts`.
 */
describe('InfoTipComponent', () => {
  let tip: InfoTipComponent;
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('span');
    TestBed.configureTestingModule({
      providers: [{ provide: ElementRef, useValue: new ElementRef(host) }],
    });
    tip = TestBed.runInInjectionContext(() => new InfoTipComponent());
  });

  afterEach(() => TestBed.resetTestingModule());

  const clickOn = (target: Node) =>
    tip.onDocumentClick({ target } as unknown as MouseEvent);

  it('starts collapsed', () => {
    expect(tip.open()).toBe(false);
  });

  it('opens when toggled', () => {
    tip.toggle();
    expect(tip.open()).toBe(true);
  });

  it('closes again on a second toggle', () => {
    tip.toggle();
    tip.toggle();
    expect(tip.open()).toBe(false);
  });

  it('closes on request', () => {
    tip.toggle();
    tip.close();
    expect(tip.open()).toBe(false);
  });

  it('tolerates a close request while already closed', () => {
    expect(() => tip.close()).not.toThrow();
    expect(tip.open()).toBe(false);
  });

  it('closes when the click lands outside', () => {
    tip.toggle();
    const outside = document.createElement('div');

    clickOn(outside);

    expect(tip.open()).toBe(false);
  });

  it('stays open when the click lands on itself', () => {
    tip.toggle();

    clickOn(host);

    expect(tip.open()).toBe(true);
  });

  it('stays open when the click lands inside the popover', () => {
    tip.toggle();
    const child = document.createElement('div');
    host.appendChild(child);

    clickOn(child);

    expect(tip.open()).toBe(true);
  });

  it('ignores outside clicks while it is already closed', () => {
    expect(() => clickOn(document.createElement('div'))).not.toThrow();
    expect(tip.open()).toBe(false);
  });

  // ── Template contract ─────────────────────────────────────────────────────

  it('exposes the trigger state to assistive technology', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('[attr.aria-expanded]="open()"');
    expect(src).toContain('aria-label');
    expect(src).toContain('type="button"');
  });

  it('renders the explanation and an optional hint as a labelled dialog', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('role="dialog"');
    expect(src).toContain('info-popover-title');
    expect(src).toContain('info-popover-body');
    expect(src).toContain('info-popover-hint');
  });

  it('closes on Escape and on an outside click', () => {
    const src = readFileSync(SOURCE, 'utf8');
    expect(src).toContain('document:keydown.escape');
    expect(src).toContain('document:click');
  });
});
