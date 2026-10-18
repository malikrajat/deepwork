import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { LaunchPromptService } from '../../../core/services/launch-prompt.service';
import { LAUNCH_DIALOG_COPY } from '../../../core/constants/nudge.constants';

/**
 * The first-run question: would you like DeepWork to start with the computer?
 *
 * A full dialog, once, and only ever on an install where the answer is not
 * already yes. It is deliberately not a toast: this is the one moment the app can
 * explain what starting with the computer is *for* before asking for it, and a
 * card in the corner would be read as an advertisement rather than as a setting.
 *
 * The wording follows the rule the rest of the reminders follow: one line of
 * benefit, then the switch. Everything longer than that lives in the footnote or
 * in Settings, where someone has chosen to read it.
 */
@Component({
  selector: 'app-launch-prompt-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'decline()',
  },
  template: `
    @if (launch.visible()) {
      <div class="dialog-backdrop" (click)="decline()">
        <div
          class="dialog-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="launch-prompt-title"
          aria-describedby="launch-prompt-subtitle"
          (click)="$event.stopPropagation()"
        >
          <div class="dialog-icon" aria-hidden="true">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <path d="M12 3v9" />
              <path d="M6.6 6.6a8 8 0 1 0 10.8 0" />
            </svg>
          </div>

          <h2 id="launch-prompt-title" class="dialog-title gradient-text">{{ copy.heading }}</h2>
          <p id="launch-prompt-subtitle" class="dialog-subtitle">{{ copy.subtitle }}</p>

          <ul class="benefits">
            @for (benefit of copy.benefits; track benefit) {
              <li>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  aria-hidden="true"
                >
                  <polyline points="20,6 9,17 4,12" />
                </svg>
                <span>{{ benefit }}</span>
              </li>
            }
          </ul>

          @if (launch.error(); as message) {
            <p class="dialog-error" role="alert">{{ message }}</p>
          }

          <div class="dialog-actions">
            <button type="button" class="btn-ghost" [disabled]="busy()" (click)="decline()">
              {{ copy.decline }}
            </button>
            <button type="button" class="btn-primary" [disabled]="busy()" (click)="accept()">
              {{ copy.accept }}
            </button>
          </div>

          <div class="dialog-foot">
            <p class="dialog-footnote">{{ copy.footnote }}</p>
            <button type="button" class="link-button" [disabled]="busy()" (click)="neverRemind()">
              {{ copy.never }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .dialog-backdrop {
        position: fixed;
        inset: 0;
        z-index: 210;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(8, 6, 16, 0.68);
        backdrop-filter: blur(6px);
        animation: dialog-fade 0.2s ease-out;
      }
      .dialog-card {
        width: 100%;
        max-width: 440px;
        padding: 26px 26px 20px;
        border-radius: 20px;
        /* The same floating surface every dialog uses: '--glass-bg' is a film
           meant to sit on a card, and a dialog has nothing behind it to sit on. */
        background: var(--surface-float, rgba(15, 11, 31, 0.96));
        backdrop-filter: blur(22px);
        border: 1px solid rgba(139, 92, 246, 0.3);
        box-shadow: 0 26px 60px rgba(0, 0, 0, 0.5);
        animation: dialog-rise 0.24s ease-out;
      }
      .dialog-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        margin-bottom: 12px;
        border-radius: 12px;
        color: var(--color-accent-primary, #a78bfa);
        background: rgba(139, 92, 246, 0.14);
        border: 1px solid rgba(139, 92, 246, 0.28);
      }
      .dialog-title {
        font-size: 20px;
        font-weight: 800;
        letter-spacing: -0.3px;
        margin: 0;
      }
      .dialog-subtitle {
        margin: 6px 0 0;
        font-size: 13px;
        line-height: 1.5;
        color: var(--color-text-muted, #a1a1aa);
      }

      .benefits {
        list-style: none;
        margin: 16px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .benefits li {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        font-size: 13px;
        line-height: 1.45;
        color: var(--color-text-secondary, #d4d4d8);
      }
      .benefits svg {
        flex: 0 0 auto;
        margin-top: 2px;
        color: #34d399;
      }

      .dialog-error {
        margin: 12px 0 0;
        padding: 8px 10px;
        border-radius: 8px;
        font-size: 12px;
        line-height: 1.4;
        color: #fca5a5;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.25);
      }

      .dialog-actions {
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
          border-color 0.2s,
          opacity 0.2s;
      }
      .btn-ghost {
        background: transparent;
        color: var(--color-text-secondary, #d4d4d8);
        border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.12));
      }
      .btn-ghost:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.06);
      }
      .btn-primary {
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        border: 1px solid rgba(139, 92, 246, 0.6);
        color: #fff;
      }
      .btn-primary:hover:not(:disabled) {
        background: linear-gradient(135deg, #9d72f8, #8b5cf6);
      }
      .btn-ghost:disabled,
      .btn-primary:disabled,
      .link-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .dialog-foot {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid rgba(139, 92, 246, 0.14);
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: flex-start;
      }
      .dialog-footnote {
        margin: 0;
        font-size: 11px;
        line-height: 1.5;
        color: var(--color-text-muted, #a1a1aa);
      }
      .link-button {
        padding: 0;
        border: none;
        background: none;
        font: inherit;
        font-size: 11px;
        font-weight: 600;
        color: var(--color-accent-primary, #a78bfa);
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      @keyframes dialog-fade {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes dialog-rise {
        from {
          opacity: 0;
          transform: translateY(10px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      /* ===== Narrow layout =====

         The window can be dragged to a phone's width, and this dialog has to fit
         the window it is in rather than the one it was designed against: card
         capped to the viewport, content scrolling from there so both answers stay
         reachable, and the safe-area insets taken the same way the shell does. */
      @media (max-width: 640px) {
        .dialog-backdrop {
          padding: 12px;
          padding-top: calc(12px + var(--safe-top));
          padding-right: calc(12px + var(--safe-right));
          padding-bottom: calc(12px + var(--safe-bottom));
          padding-left: calc(12px + var(--safe-left));
          align-items: flex-start;
        }
        .dialog-card {
          padding: 20px 16px 16px;
          max-height: calc(100vh - 24px - var(--safe-top) - var(--safe-bottom));
          max-height: calc(100dvh - 24px - var(--safe-top) - var(--safe-bottom));
          overflow-y: auto;
          overscroll-behavior-y: contain;
          -webkit-overflow-scrolling: touch;
        }
        /* A thumb, not a mouse: both answers become full-width buttons and the
           smaller "don't remind me again" keeps a 44px row of its own. */
        .dialog-actions {
          flex-direction: column-reverse;
        }
        .btn-ghost,
        .btn-primary {
          min-height: 44px;
          width: 100%;
        }
        .link-button {
          min-height: 44px;
        }
      }
    `,
  ],
})
export class LaunchPromptDialogComponent {
  protected readonly launch = inject(LaunchPromptService);
  protected readonly copy = LAUNCH_DIALOG_COPY;

  /** True while the answer is being written to the OS. */
  protected readonly busy = signal(false);

  async accept(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.launch.acceptStartWithSystem();
    } finally {
      this.busy.set(false);
    }
  }

  async decline(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.launch.decline();
    } finally {
      this.busy.set(false);
    }
  }

  async neverRemind(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.launch.neverRemind();
    } finally {
      this.busy.set(false);
    }
  }
}
