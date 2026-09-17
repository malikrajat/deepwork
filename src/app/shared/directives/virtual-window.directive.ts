import { Directive, ElementRef, OnDestroy, afterNextRender, inject, input, signal } from '@angular/core';
import { windowBounds } from '../../core/utils/virtual-list.util';

@Directive({
  selector: '[appWindow]',
  exportAs: 'appWindow',
  host: {
    '(scroll)': 'onScroll($event)',
  },
})
export class VirtualWindowDirective implements OnDestroy {
  /** Height of one row in pixels — rows must all be the same height. */
  readonly rowHeight = input<number>(56);
  /** Number of rows in the list. */
  readonly appWindow = input<number>(0);
  /** Extra rows rendered above and below the viewport. */
  readonly overscan = input<number>(4);

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly scrollTop = signal(0);
  private readonly viewportHeight = signal(0);
  private readonly first = signal(0);
  private readonly last = signal(0);
  private observer: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      const element = this.host.nativeElement;
      this.measure(element);
      if (typeof ResizeObserver !== 'undefined') {
        this.observer = new ResizeObserver(() => this.measure(element));
        this.observer.observe(element);
      }
      this.recompute();
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  /** Index of the first rendered row. */
  start(): number {
    return this.first();
  }

  top(index: number): number {
    return index * this.rowHeight();
  }

  /** Total scrollable height for the canvas element. */
  canvasHeight(itemCount: number): number {
    return Math.max(0, itemCount) * this.rowHeight();
  }

  /**
   * The slice of items that can be seen right now, with their absolute index
   * and pixel offset. Everything outside it is never created.
   */
  visible<T>(items: T[]): { item: T; index: number; top: number }[] {
    const from = this.first();
    const to = Math.min(items.length, this.last());
    const rows: { item: T; index: number; top: number }[] = [];
    for (let index = from; index < to; index++) {
      rows.push({ item: items[index], index, top: this.top(index) });
    }
    return rows;
  }

  onScroll(event: Event): void {
    this.scrollTop.set((event.target as HTMLElement).scrollTop);
    this.recompute();
  }

  private measure(element: HTMLElement): void {
    const height = element.clientHeight;
    if (height) this.viewportHeight.set(height);
  }

  private recompute(): void {
    const { first, last } = windowBounds(
      Math.max(0, this.appWindow()),
      this.rowHeight(),
      this.scrollTop(),
      this.viewportHeight(),
      this.overscan()
    );
    this.first.set(first);
    this.last.set(last);
  }
}
