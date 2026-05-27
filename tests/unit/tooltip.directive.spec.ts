import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Component } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TooltipDirective } from '../../src/app/shared/directives/tooltip.directive';

@Component({
  standalone: true,
  imports: [TooltipDirective],
  template: `<button appTooltip="placeholder">Hover me</button>`,
})
class TestHostComponent {}

function trigger(el: Element, event: string): void {
  el.dispatchEvent(new MouseEvent(event, { bubbles: true, cancelable: true }));
}

function getDir(fixture: ComponentFixture<TestHostComponent>): TooltipDirective {
  return fixture.debugElement.query(By.directive(TooltipDirective)).injector.get(TooltipDirective);
}

function withText(dir: TooltipDirective, text: string): void {
  Object.defineProperty(dir, 'appTooltip', { value: () => text, configurable: true, writable: true });
}

describe('TooltipDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestHostComponent] });
    fixture = TestBed.createComponent(TestHostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    document.querySelectorAll('.app-tooltip').forEach(el => el.remove());
  });

  afterEach(() => {
    document.querySelectorAll('.app-tooltip').forEach(el => el.remove());
    fixture.nativeElement.parentNode?.removeChild(fixture.nativeElement);
    TestBed.resetTestingModule();
  });

  it('renders the host element without errors', () => { expect(fixture.nativeElement.querySelector('button')).not.toBeNull(); });
  it('no tooltip in DOM before any hover', () => { expect(document.querySelector('.app-tooltip')).toBeNull(); });

  it('creates .app-tooltip on mouseenter', () => {
    const btn = fixture.nativeElement.querySelector('button')!;
    withText(getDir(fixture), 'Helpful hint');
    trigger(btn, 'mouseenter');
    expect(document.querySelector('.app-tooltip')).not.toBeNull();
  });

  it('tooltip text matches appTooltip value', () => {
    const btn = fixture.nativeElement.querySelector('button')!;
    withText(getDir(fixture), 'Helpful hint');
    trigger(btn, 'mouseenter');
    expect(document.querySelector('.app-tooltip')?.textContent).toBe('Helpful hint');
  });

  it('removes tooltip on mouseleave', () => {
    const btn = fixture.nativeElement.querySelector('button')!;
    withText(getDir(fixture), 'Helpful hint');
    trigger(btn, 'mouseenter');
    trigger(btn, 'mouseleave');
    expect(document.querySelector('.app-tooltip')).toBeNull();
  });

  it('only one tooltip at a time (no duplicates on re-enter)', () => {
    const btn = fixture.nativeElement.querySelector('button')!;
    withText(getDir(fixture), 'Helpful hint');
    trigger(btn, 'mouseenter');
    trigger(btn, 'mouseleave');
    trigger(btn, 'mouseenter');
    expect(document.querySelectorAll('.app-tooltip').length).toBe(1);
  });

  it('does not create tooltip when text is empty', () => {
    const btn = fixture.nativeElement.querySelector('button')!;
    withText(getDir(fixture), '');
    trigger(btn, 'mouseenter');
    expect(document.querySelector('.app-tooltip')).toBeNull();
  });
});
