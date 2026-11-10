import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';

/**
 * The app's own confirmation card, replacing the browser's native `confirm`.
 *
 * It is mounted once in the shell rather than by each page, because the question
 * can be asked from anywhere and a page that navigated away mid-question must
 * not take the dialog with it. The card matches the rest of DeepWork's dialogs:
 * the floating surface, the violet accent, the same two answers, and Escape and
 * a click beside the card both mean **no**.
 *
 * The safe answer is focused when it opens. A confirmation asks whether work in
 * progress should be interrupted; making **keep going** the default is what
 * stops a stray Enter from ending a session.
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'answer(false)',
  },
  template: `
    @if (dialog.request(); as question) {
      <div class="confirm-backdrop" (click)="answer(false)">
        <div
          class="confirm-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-message"
          (click)="$event.stopPropagation()"
        >
          <div class="confirm-icon" [class.danger]="question.tone === 'danger'" aria-hidden="true">
            @switch (question.icon) {
              @case ('focus') {
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="13" r="8" />
                  <path d="M12 9v4l2.5 1.5" />
                  <path d="M9 2h6" />
                </svg>
              }
              @case ('warning') {
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
                  />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              }
              @default {
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4" />
                  <line x1="12" y1="17.5" x2="12.01" y2="17.5" />
                </svg>
              }
            }
          </div>

          <h2 id="confirm-dialog-title" class="confirm-title">{{ question.title }}</h2>
          <p id="confirm-dialog-message" class="confirm-message">{{ question.message }}</p>

          <div class="confirm-actions">
            <button #cancelButton type="button" class="btn-ghost" (click)="answer(false)">
              {{ question.cancelLabel }}
            </button>
            <button
              type="button"
              class="btn-primary"
              [class.danger]="question.tone === 'danger'"
              (click)="answer(true)"
            >
              {{ question.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .confirm-backdrop {
        position: fixed;
        inset: 0;
        z-index: 230;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(8, 6, 16, 0.68);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        animation: confirm-fade 0.18s ease-out;
      }
      .confirm-card {
        width: 100%;
        max-width: 430px;
        padding: 24px 24px 20px;
        border-radius: 20px;
        background: var(--surface-float, rgba(15, 11, 31, 0.96));
        border: 1px solid rgba(139, 92, 246, 0.3);
        box-shadow: 0 26px 60px rgba(0, 0, 0, 0.5);
        animation: confirm-rise 0.22s ease-out;
      }
      .confirm-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        margin-bottom: 14px;
        border-radius: 13px;
        color: var(--color-accent-primary, #a78bfa);
        background: rgba(139, 92, 246, 0.14);
        border: 1px solid rgba(139, 92, 246, 0.28);
      }
      .confirm-icon.danger {
        color: #fca5a5;
        background: rgba(239, 68, 68, 0.12);
        border-color: rgba(239, 68, 68, 0.28);
      }
      .confirm-title {
        margin: 0;
        font-size: 19px;
        font-weight: 800;
        letter-spacing: -0.3px;
        color: var(--color-text-primary, #f2f0ff);
      }
      .confirm-message {
        margin: 8px 0 0;
        font-size: 13px;
        line-height: 1.55;
        color: var(--color-text-secondary, #d4d4d8);
      }
      .confirm-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 22px;
      }
      .btn-ghost,
      .btn-primary {
        padding: 9px 18px;
        border-radius: 9px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition:
          background 0.2s,
          border-color 0.2s;
      }
      .btn-ghost {
        background: transparent;
        color: var(--color-text-secondary, #d4d4d8);
        border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.12));
      }
      .btn-ghost:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .btn-primary {
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        border: 1px solid rgba(139, 92, 246, 0.6);
        color: #fff;
      }
      .btn-primary:hover {
        background: linear-gradient(135deg, #9d72f8, #8b5cf6);
      }
      .btn-primary.danger {
        background: linear-gradient(135deg, #ef4444, #dc2626);
        border-color: rgba(239, 68, 68, 0.6);
      }
      .btn-primary.danger:hover {
        background: linear-gradient(135deg, #f05252, #ef4444);
      }
      .btn-ghost:focus-visible,
      .btn-primary:focus-visible {
        outline: 2px solid var(--color-accent-primary, #a78bfa);
        outline-offset: 2px;
      }

      @keyframes confirm-fade {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes confirm-rise {
        from {
          opacity: 0;
          transform: translateY(10px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      @media (max-width: 640px) {
        .confirm-backdrop {
          align-items: flex-end;
          padding: 12px;
          padding-bottom: calc(12px + var(--safe-bottom));
        }
        .confirm-card {
          padding: 20px 16px 16px;
        }
        .confirm-actions {
          flex-direction: column-reverse;
        }
        .btn-ghost,
        .btn-primary {
          width: 100%;
          min-height: 44px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .confirm-backdrop,
        .confirm-card {
          animation: none;
        }
      }
    `,
  ],
})
export class ConfirmDialogComponent {
  protected readonly dialog = inject(ConfirmDialogService);

  /** The **no** answer: the one Enter lands on when the question opens. */
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');

  constructor() {
    effect(() => {
      if (!this.dialog.request()) return;
      this.cancelButton()?.nativeElement.focus();
    });
  }

  answer(confirmed: boolean): void {
    this.dialog.answer(confirmed);
  }
}
