import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { NotificationService } from '../../../core/services/notification.service';
import type { ToastAction } from '../../../core/services/notification.service';
import { alertTheme } from '../../../core/constants/alert.constants';

/**
 * The full window's half of the completion alert.
 *
 * The card is not only a message about the alert: while the alert is unanswered
 * the card *is* the alert, on this side of the window — it wears the same
 * `ALERT_COLOURS` entry the mini widget is wearing and shakes on the same beat,
 * so a user who is looking at the app and a user who is looking at the widget see
 * the same thing happening at the same moment.
 *
 * The repeat itself comes from the service, which takes the card down and raises
 * it again on every tone (`NotificationService.showToast`). Because the card is a
 * new element each time, one entry animation is all it takes for the repeat to be
 * visible: it animates in — and, while the alert is ringing, shakes off that
 * entry — every time the tone plays, without the two classes-by-name the widget
 * needs to restart an animation on an element that stays where it is.
 */
@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notifications.toast(); as t) {
      <div
        class="toast-container"
        [class.work]="t.type === 'work'"
        [class.break]="t.type !== 'work'"
        [class.alerting]="notifications.ringing()"
        [style]="alertVars()"
        [attr.data-id]="t.id"
      >
        <div class="toast-icon">
          @if (t.type === 'work') {
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22,4 12,14.01 9,11.01" />
            </svg>
          } @else {
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12,6 12,12 16,14" />
            </svg>
          }
        </div>
        <div class="toast-content">
          <span class="toast-title">{{ t.title }}</span>
          <span class="toast-body">{{ t.body }}</span>
          @if (t.quote) {
            <span class="toast-quote">{{ t.quote }}</span>
          }
          @if (t.actions?.length) {
            <div class="toast-actions">
              @for (action of t.actions; track action.label) {
                <button
                  type="button"
                  class="toast-action"
                  [class.primary]="action.primary"
                  (click)="runAction(action)"
                >
                  {{ action.label }}
                </button>
              }
            </div>
          }
        </div>
        <button class="toast-dismiss" (click)="dismiss()">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <div class="toast-pulse-ring"></div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        pointer-events: none;
      }
      .toast-container {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 18px;
        border-radius: 14px;
        backdrop-filter: blur(20px);
        pointer-events: all;
        animation: toast-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        overflow: hidden;
        min-width: 280px;
        max-width: 360px;
        box-shadow:
          var(--glass-shadow),
          0 0 0 1px var(--glass-border);
      }
      .toast-container.work {
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, var(--toast-bg) 100%);
        border: 1px solid rgba(139, 92, 246, 0.3);
      }
      .toast-container.break {
        background: linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, var(--toast-bg) 100%);
        border: 1px solid rgba(6, 182, 212, 0.3);
      }

      /* An unanswered alert takes the card over completely. It has to be declared
       after the work/break gradients — those selectors are the same weight, so
       the last one written is the one that wins. */
      .toast-container.alerting {
        background: var(--alert-surface);
        border: 1px solid var(--alert-border);
        /* Entry first, then the shake: the card is raised from scratch on every
         tone, so the pair replays on every repeat. They never overlap in time,
         which is what lets two transform animations share one element. */
        animation:
          toast-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
          alert-shake 0.7s 0.5s ease-in-out;
      }
      .toast-container.alerting .toast-icon {
        background: var(--alert-fill);
        color: var(--alert-accent);
      }
      .toast-container.alerting .toast-dismiss {
        border-color: var(--alert-border);
        background: var(--alert-fill);
        color: var(--alert-accent);
      }
      .toast-container.alerting .toast-dismiss:hover {
        background: var(--alert-fill-strong);
        border-color: var(--alert-border-strong);
        color: #ffffff;
      }
      .toast-container.alerting .toast-pulse-ring {
        border: 2px solid var(--alert-border);
      }

      .toast-icon {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        animation: icon-bounce 0.6s ease 0.3s both;
      }
      .work .toast-icon {
        background: rgba(139, 92, 246, 0.2);
        color: var(--timer-work-color);
      }
      .break .toast-icon {
        background: rgba(6, 182, 212, 0.2);
        color: var(--timer-break-color);
      }

      .toast-content {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }
      .toast-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--color-text-primary, #fff);
        animation: text-fade 0.4s ease 0.2s both;
      }
      .toast-body {
        font-size: 11px;
        color: var(--color-text-secondary, #aaa);
        animation: text-fade 0.4s ease 0.35s both;
      }

      /* The motivational line, set apart from the message it arrived with: an
       indented rule and a tint of its own, because read as a sentence glued to
       the end of the message it reads as more of the message. The water card
       draws the same pair the same way — see WaterNudgeComponent. */
      .toast-quote {
        margin-top: 6px;
        padding: 6px 10px;
        border-left: 2px solid rgba(139, 92, 246, 0.5);
        border-radius: 0 8px 8px 0;
        background: rgba(139, 92, 246, 0.08);
        font-size: 11px;
        font-style: italic;
        line-height: 1.45;
        color: var(--color-text-primary, #fff);
        animation: text-fade 0.4s ease 0.5s both;
      }
      .break .toast-quote {
        border-left-color: rgba(6, 182, 212, 0.5);
        background: rgba(6, 182, 212, 0.08);
      }
      .toast-container.alerting .toast-quote {
        border-left-color: var(--alert-border-strong);
        background: var(--alert-fill);
      }

      /* The card's answers, when it is asking rather than telling.
       The row sits under the message instead of beside it because the question
       is the text above: a button to the right of a sentence is read as an
       afterthought, and a button under it is read as the answer. Wrapping is
       allowed so a longer label never pushes the card past its 360px ceiling. */
      .toast-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
        animation: text-fade 0.4s ease 0.45s both;
      }
      .toast-action {
        padding: 5px 11px;
        border-radius: 8px;
        font: inherit;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        color: var(--color-text-secondary, #d4d4d8);
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        transition:
          background 0.2s,
          border-color 0.2s,
          color 0.2s;
      }
      .toast-action:hover {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary, #fff);
      }
      .toast-action.primary {
        background: rgba(139, 92, 246, 0.26);
        border-color: rgba(139, 92, 246, 0.6);
        color: var(--color-text-primary, #fff);
      }
      .toast-action.primary:hover {
        background: rgba(139, 92, 246, 0.38);
      }
      .toast-action:focus-visible {
        outline: 2px solid rgba(139, 92, 246, 0.8);
        outline-offset: 1px;
      }

      .toast-dismiss {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        color: var(--color-text-muted, #888);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all 0.2s;
      }
      .toast-dismiss:hover {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary, #fff);
        transform: scale(1.1);
      }

      /* Pulsing ring for attention */
      .toast-pulse-ring {
        position: absolute;
        inset: -2px;
        border-radius: 16px;
        pointer-events: none;
        animation: pulse-ring 2s ease-in-out infinite;
      }
      .work .toast-pulse-ring {
        border: 2px solid rgba(139, 92, 246, 0.4);
      }
      .break .toast-pulse-ring {
        border: 2px solid rgba(6, 182, 212, 0.4);
      }

      @keyframes toast-in {
        0% {
          opacity: 0;
          transform: translateX(100%) scale(0.8);
        }
        100% {
          opacity: 1;
          transform: translateX(0) scale(1);
        }
      }
      @keyframes icon-bounce {
        0% {
          transform: scale(0);
        }
        60% {
          transform: scale(1.2);
        }
        100% {
          transform: scale(1);
        }
      }
      @keyframes text-fade {
        0% {
          opacity: 0;
          transform: translateY(6px);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @keyframes pulse-ring {
        0%,
        100% {
          opacity: 0;
          transform: scale(1);
        }
        50% {
          opacity: 1;
          transform: scale(1.02);
        }
      }

      /* The alert's nudge, once per tone — the widget's shake, on a card that is
       wider than it is tall, so the rotation is about half as far for the same
       amount of visible movement. See MiniWidgetComponent for why the motion is
       a translate plus a rotation and never a scale. */
      @keyframes alert-shake {
        0%,
        100% {
          transform: translateX(0) rotate(0deg);
        }
        12% {
          transform: translateX(-6px) rotate(-0.6deg);
        }
        30% {
          transform: translateX(6px) rotate(0.6deg);
        }
        48% {
          transform: translateX(-4px) rotate(-0.45deg);
        }
        66% {
          transform: translateX(3px) rotate(0.3deg);
        }
        84% {
          transform: translateX(-1.5px) rotate(-0.15deg);
        }
      }

      /* Anyone who asked their system for less motion keeps the colour change,
       which is the alert itself, and loses the shake, which is only the nudge. */
      @media (prefers-reduced-motion: reduce) {
        .toast-container.alerting {
          animation: toast-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      }

      /* ===== Phone layout =====

       The card is 280px at its narrowest and capped at 360px, anchored 24px from
       the bottom-right corner: on a 320px phone the corner it hangs from leaves
       296px, so a card at its widest is cut off by the right edge of the screen
       and one carrying a tooltip-length title spills past the left one. The host
       is given both edges instead of the corner down here, which is the whole fix
       — the card then measures itself against the window and the 280px floor has
       nothing left to push against — and the corners pick up the home indicator
       and the landscape cutout while they are at it.

       The dismiss button is the only control on the card and grows to a thumb. */
      @media (max-width: 640px) {
        :host {
          left: calc(var(--space-sm) + var(--safe-left));
          right: calc(var(--space-sm) + var(--safe-right));
          bottom: calc(var(--space-sm) + var(--safe-bottom));
        }
        .toast-container {
          min-width: 0;
          max-width: 100%;
        }
        .toast-dismiss {
          width: 44px;
          height: 44px;
        }
        /* The answers grow to a thumb too: this is a question, and the phone is
         where a 22px-tall button is hardest to hit. */
        .toast-action {
          min-height: 44px;
          padding: 8px 14px;
        }
      }
    `,
  ],
})
export class ToastComponent {
  readonly notifications = inject(NotificationService);

  /** The same palette entry the widget is on: both read one pulse. */
  readonly alertTheme = computed(() => alertTheme(this.notifications.alertPulse()));

  /**
   * The palette variables while the alert is unanswered, and nothing otherwise.
   *
   * The card is also the surface for one-off messages — task added, task
   * completed — and those are not alerts: leaving the variables off means the
   * ordinary card carries no alert colour for a later rule to paint from.
   */
  readonly alertVars = computed(() =>
    this.notifications.ringing() ? this.alertTheme().cssVars : null,
  );

  dismiss(): void {
    this.notifications.dismiss();
  }

  /**
   * Runs what a button promised.
   *
   * The action decides what happens to the card: "turn it on" answers the
   * question and closes it, while "remind me later" may simply close it. A
   * failure is logged rather than thrown at the template, which has no way to
   * show it and would leave the card stuck on screen.
   */
  async runAction(action: ToastAction): Promise<void> {
    try {
      await action.run();
    } catch (error) {
      console.warn('toast action failed', error);
    }
  }
}
