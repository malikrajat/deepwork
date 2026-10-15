import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { TaskbarPinService } from '../../../core/services/taskbar-pin.service';
import { PIN_ACKNOWLEDGE } from '../../../core/constants/pin.constants';

/**
 * The one-time offer to pin DeepWork where the user can reach it in one click.
 *
 * This is the water reminder's shape rather than the Pomodoro toast's: it *asks*,
 * so it never fades out on a timer and the only ways past it are its own controls.
 * Two answers, one card — and the wording is the desktop's, read from the service
 * (see `PIN_BODY`), because a Mac user being told about a taskbar is how an app
 * looks like a port.
 *
 * The card has four faces, and which one it wears is the backend's answer rather
 * than a guess made here:
 *
 * 1. **The question** — "Pin to taskbar" and "Not now". Shown when this desktop
 *    can do the pinning itself, which is Windows.
 * 2. **Waiting** — the request is in and the *desktop* is asking now. The card
 *    says where to look rather than offering to ask again, because asking again
 *    would only be a second prompt on top of the first.
 * 3. **The instruction** — what to do instead, when the desktop refused or never
 *    had a way to be asked. macOS and Linux land here by design: neither lets an
 *    app add itself to the Dock or the panel, and a button that silently did
 *    nothing is worse than a sentence that says where the menu is. The card stays
 *    up until it is acknowledged, because an instruction that disappears while it
 *    is being read is not an instruction.
 * 4. **The confirmation** — one line, no buttons, gone by itself.
 *
 * ## Every face has a way out, and this is not decoration
 *
 * An earlier version of this card could be dismissed only by its own buttons, and
 * when a bug left those unresponsive the user had no way past it at all. So the
 * card now carries **three** independent exits, and only one of them depends on
 * anything working:
 *
 * - the **Not now** button, and **Got it** on the instruction face;
 * - a **close** button in the corner, which is the same "Not now" and is present
 *   on every face that has anything to answer;
 * - **Escape**, bound on the window, so it works whether or not focus ever
 *   reached this component — the one that matters when the app itself is the
 *   thing misbehaving.
 *
 * The card is also deliberately *not* modal: there is no backdrop, nothing is
 * `inert`, and clicks anywhere outside it do exactly what they always did. It
 * occupies the corner it is drawn in and nothing else.
 */
@Component({
  selector: 'app-pin-nudge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'pin.dismiss()',
  },
  template: `
    @if (pin.visible()) {
      <section
        #card
        class="pin-card"
        [class.settled]="pin.settled()"
        role="alertdialog"
        aria-modal="false"
        aria-labelledby="pin-nudge-title"
        aria-describedby="pin-nudge-body"
        tabindex="-1"
      >
        <div class="pin-head">
          <div class="pin-icon">
            @if (pin.settled()) {
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            } @else {
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 17v5" />
                <path
                  d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"
                />
              </svg>
            }
          </div>
          <div class="pin-text">
            <span class="pin-eyebrow">{{ pin.eyebrow() }}</span>
            <h2 class="pin-title" id="pin-nudge-title">
              {{ pin.settled() ? 'Pinned' : pin.title() }}
            </h2>
            <p class="pin-body" id="pin-nudge-body">
              @if (pin.settled()) {
                DeepWork is on the {{ pin.target() }}. One click from now on.
              } @else {
                {{ pin.body() }}
              }
            </p>
          </div>

          <!-- The escape hatch that does not depend on any of the answers below.
               Same meaning as "Not now", on every face that has a question. -->
          @if (!pin.settled()) {
            <button
              type="button"
              class="pin-close"
              (click)="pin.dismiss()"
              [attr.aria-label]="'Close — ' + pin.dismissLabel"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          }
        </div>

        @if (pin.help(); as help) {
          <p class="pin-help">{{ help }}</p>
        }

        <div class="pin-actions">
          @if (pin.settled()) {
            <!-- Nothing to answer: the app is where the user asked for it, and the
                 card takes itself away. -->
          } @else if (pin.help()) {
            <button type="button" class="pin-btn primary" (click)="pin.dismiss()">
              {{ acknowledge }}
            </button>
          } @else if (pin.awaitingAnswer()) {
            <!-- The desktop is asking. There is nothing for this button to do but
                 get out of the way, and it must stay usable while it waits. -->
            <button type="button" class="pin-btn" (click)="pin.dismiss()">
              {{ pin.dismissLabel }}
            </button>
          } @else {
            <button
              type="button"
              class="pin-btn primary"
              [disabled]="pin.busy()"
              (click)="pin.pin()"
            >
              {{ pin.busy() ? 'Asking ' + pin.target() + '…' : pin.confirmLabel() }}
            </button>
            <button type="button" class="pin-btn" (click)="pin.dismiss()">
              {{ pin.dismissLabel }}
            </button>
          }
        </div>
      </section>
    }
  `,
  styles: [
    `
      /* The host is a fixed corner and nothing more. It is deliberately *not*
         stretched over the window and carries no backdrop: this card asks a
         question, it does not take the app over, and everything outside it has to
         keep working exactly as it did. */
      :host {
        position: fixed;
        top: 24px;
        right: 24px;
        /* The water reminder's layer, less one: a question that needs an answer
           outranks a reminder. Above the update prompt (10000) either way. */
        z-index: 10001;
        pointer-events: none;
      }

      .pin-card {
        pointer-events: all;
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 380px;
        /* 'vw' is the scrollbar's width too wide on a phone showing one, so the
           cap is measured against the dynamic viewport with the 'vw' line kept
           above it for browsers that do not know 'dvw'. */
        max-width: calc(100vw - 48px);
        max-width: calc(100dvw - 48px);
        padding: 18px;
        border-radius: var(--glass-radius, 14px);
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.16) 0%, var(--toast-bg) 100%);
        border: 1px solid var(--glass-border-accent, rgba(139, 92, 246, 0.36));
        backdrop-filter: blur(var(--glass-blur));
        box-shadow: var(--glass-shadow);
        animation: pin-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        outline: none;
      }

      /* The confirmation is quieter than the question: the same card, so it is
         unmistakably the same thing reporting back, without the accent edge that
         asks for an answer. */
      .pin-card.settled {
        background: var(--toast-bg);
        border-color: var(--glass-border);
      }
      .pin-card.settled .pin-icon {
        background: rgba(6, 182, 212, 0.16);
        color: var(--timer-break-color, #06b6d4);
      }

      .pin-head {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }

      .pin-icon {
        width: 38px;
        height: 38px;
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
        background: rgba(139, 92, 246, 0.16);
        color: var(--color-accent-primary, #a78bfa);
      }

      .pin-text {
        min-width: 0;
        flex: 1;
      }

      /* The corner exit. Sized like the toast's dismiss button so the two read as
         the same control, and never smaller than a comfortable click target. */
      .pin-close {
        flex: 0 0 auto;
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        border: 1px solid var(--glass-border);
        background: var(--glass-bg);
        color: var(--color-text-muted, #888);
        cursor: pointer;
        transition:
          background 0.2s,
          color 0.2s,
          transform 0.15s;
      }
      .pin-close:hover {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary, #f4f4f5);
        transform: scale(1.08);
      }

      .pin-eyebrow {
        display: block;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--color-accent-primary, #a78bfa);
      }

      .pin-title {
        margin: 3px 0 0;
        font-size: 15px;
        font-weight: 800;
        letter-spacing: -0.2px;
        color: var(--color-text-primary, #f4f4f5);
      }

      .pin-body {
        margin: 5px 0 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--color-text-secondary, #d4d4d8);
      }

      /* The manual route, set apart from the question it replaces: an indented
         rule and a tint of its own, because read as another sentence of the same
         paragraph it reads as more explaining rather than as the answer. The
         Pomodoro toast draws its quote the same way — see ToastComponent. */
      .pin-help {
        margin: 0;
        padding: 9px 11px;
        border-left: 2px solid rgba(139, 92, 246, 0.5);
        border-radius: 0 8px 8px 0;
        background: rgba(139, 92, 246, 0.08);
        font-size: 12px;
        line-height: 1.55;
        color: var(--color-text-primary, #f4f4f5);
        animation: pin-fade 0.3s ease both;
      }

      .pin-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .pin-btn {
        flex: 1 1 auto;
        padding: 9px 14px;
        border-radius: 9px;
        border: 1px solid var(--glass-border);
        background: var(--glass-bg);
        color: var(--color-text-secondary, #d4d4d8);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition:
          background 0.2s,
          border-color 0.2s,
          transform 0.15s;
      }
      .pin-btn:hover {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary, #f4f4f5);
      }
      .pin-btn:active {
        transform: scale(0.98);
      }
      .pin-btn.primary {
        background: rgba(139, 92, 246, 0.24);
        border-color: rgba(139, 92, 246, 0.55);
        color: var(--color-text-primary, #f4f4f5);
      }
      .pin-btn.primary:hover {
        background: rgba(139, 92, 246, 0.36);
      }
      .pin-btn:disabled {
        opacity: 0.7;
        cursor: progress;
      }

      @keyframes pin-in {
        from {
          opacity: 0;
          transform: translateY(-10px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      @keyframes pin-fade {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      /* Anyone who asked their system for less motion keeps the card whole and
         loses the movement. */
      @media (prefers-reduced-motion: reduce) {
        .pin-card,
        .pin-help {
          animation: none;
        }
      }

      /* ===== Narrow layout =====
         The card is 380px anchored 24px from the top-right corner, which a phone
         does not have to give it. Down here it is given both edges instead of the
         corner, capped to the window, and its buttons grow to thumbs. */
      @media (max-width: 640px) {
        :host {
          left: calc(var(--space-sm, 12px) + var(--safe-left));
          right: calc(var(--space-sm, 12px) + var(--safe-right));
          top: calc(var(--space-sm, 12px) + var(--safe-top));
        }
        .pin-card {
          width: auto;
          max-width: 100%;
        }
        .pin-btn {
          flex: 1 1 100%;
          min-height: 44px;
        }
        .pin-close {
          width: 44px;
          height: 44px;
        }
      }
    `,
  ],
})
export class PinNudgeComponent {
  readonly pin = inject(TaskbarPinService);

  /** The one way out of the instruction face. */
  readonly acknowledge = PIN_ACKNOWLEDGE;

  private readonly card = viewChild<ElementRef<HTMLElement>>('card');

  constructor() {
    /**
     * Puts focus on the card when it appears.
     *
     * Not for looks: focus is what makes Escape, Tab and Enter reach the card's
     * own controls, and it means a keyboard user can answer without hunting for
     * it. The card is `tabindex="-1"` and `outline: none`, so nothing is visibly
     * ringed until a control inside it is reached.
     */
    effect(() => {
      if (!this.pin.visible()) return;
      const element = this.card()?.nativeElement;
      // Focus can be refused (a hidden or disabled document), and that must never
      // be the thing that breaks the card.
      element?.focus?.();
    });
  }
}
