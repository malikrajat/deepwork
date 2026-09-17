import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

/**
 * A small "i" button that explains a feature in plain language.
 *
 * Built for the desktop preferences, where the concepts are genuinely unclear to
 * most people: what "always on top" does, what a startup entry means, and what
 * happens when the app turns into a mini widget.
 *
 * Accessible by mouse and keyboard: the trigger is a real button with
 * `aria-expanded`, the popover is labelled, and it closes on Escape or on a click
 * anywhere outside.
 */
@Component({
  selector: 'app-info-tip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <span class="info-tip">
      <button
        type="button"
        class="info-btn"
        [attr.aria-label]="'What is ' + heading() + '?'"
        [attr.aria-expanded]="open()"
        (click)="toggle()"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="11" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>

      @if (open()) {
        <div class="info-popover" role="dialog" [attr.aria-label]="heading()">
          <div class="info-popover-title">{{ heading() }}</div>
          <p class="info-popover-body">{{ body() }}</p>
          @if (hint()) {
            <p class="info-popover-hint">{{ hint() }}</p>
          }
        </div>
      }
    </span>
  `,
  styles: [`
    :host { display: inline-flex; }
    .info-tip { position: relative; display: inline-flex; }
    .info-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 18px; height: 18px; padding: 0; border-radius: 50%;
      border: 1px solid rgba(139, 92, 246, 0.35);
      background: rgba(139, 92, 246, 0.10);
      color: var(--color-text-muted, #a1a1aa);
      cursor: pointer; transition: background 0.2s, color 0.2s, border-color 0.2s;
    }
    .info-btn:hover, .info-btn[aria-expanded='true'] {
      background: rgba(139, 92, 246, 0.25);
      border-color: rgba(139, 92, 246, 0.7);
      color: var(--color-text-primary, #f4f4f5);
    }
    .info-btn:focus-visible { outline: 2px solid rgba(139, 92, 246, 0.8); outline-offset: 2px; }
    .info-popover {
      position: absolute; top: calc(100% + 8px); right: 0; z-index: 60;
      width: 272px; padding: 12px 14px;
      border-radius: 12px;
      background: rgba(24, 20, 38, 0.97);
      backdrop-filter: blur(18px);
      border: 1px solid rgba(139, 92, 246, 0.35);
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45);
      text-align: left;
      cursor: default;
    }
    .info-popover-title {
      font-size: 0.78rem; font-weight: 700; letter-spacing: 0.01em;
      color: var(--color-text-primary, #f4f4f5); margin-bottom: 6px;
    }
    .info-popover-body {
      margin: 0; font-size: 0.75rem; line-height: 1.5;
      color: var(--color-text-secondary, #d4d4d8);
    }
    .info-popover-hint {
      margin: 8px 0 0; font-size: 0.7rem; line-height: 1.45;
      color: var(--color-accent-primary, #a78bfa);
    }
  `],
})
export class InfoTipComponent {
  /** Short title of the concept being explained. */
  readonly heading = input.required<string>();
  /** One or two sentences of plain-language explanation. */
  readonly body = input.required<string>();
  /** Optional actionable follow-up line. */
  readonly hint = input<string>('');

  readonly open = signal(false);

  private readonly host = inject(ElementRef<HTMLElement>);

  toggle(): void {
    this.open.update(value => !value);
  }

  close(): void {
    if (this.open()) this.open.set(false);
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const target = event.target as Node | null;
    if (target && !this.host.nativeElement.contains(target)) {
      this.close();
    }
  }
}
