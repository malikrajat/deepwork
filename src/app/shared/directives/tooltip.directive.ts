import { Directive, ElementRef, inject, input, OnDestroy } from '@angular/core';

@Directive({
  selector: '[appTooltip]',
  host: {
    '(mouseenter)': 'onMouseEnter()',
    '(mouseleave)': 'onMouseLeave()'
  }
})
export class TooltipDirective implements OnDestroy {
  appTooltip = input<string>('');

  private static activeTooltip: HTMLElement | null = null;
  private tooltipEl: HTMLElement | null = null;
  private readonly el = inject(ElementRef<HTMLElement>);

  onMouseEnter(): void {
    const text = this.appTooltip();
    if (!text) return;
    this.create(text);
  }

  onMouseLeave(): void {
    this.destroy();
  }

  ngOnDestroy(): void {
    this.destroy();
  }

  private create(text: string): void {
    this.destroy();
    // Remove the single active tooltip (only one should exist at a time)
    TooltipDirective.activeTooltip?.remove();

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'app-tooltip';
    this.tooltipEl.textContent = text;
    document.body.appendChild(this.tooltipEl);
    TooltipDirective.activeTooltip = this.tooltipEl;

    const hostRect = this.el.nativeElement.getBoundingClientRect();
    const tipRect = this.tooltipEl.getBoundingClientRect();

    let top = hostRect.top - tipRect.height - 8;
    let left = hostRect.left + (hostRect.width - tipRect.width) / 2;

    // Flip below if no room above
    if (top < 4) {
      top = hostRect.bottom + 8;
    }
    // Keep within viewport
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));

    this.tooltipEl.style.top = `${top}px`;
    this.tooltipEl.style.left = `${left}px`;
    this.tooltipEl.classList.add('visible');
  }

  private destroy(): void {
    if (this.tooltipEl) {
      if (TooltipDirective.activeTooltip === this.tooltipEl) {
        TooltipDirective.activeTooltip = null;
      }
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }
  }
}
