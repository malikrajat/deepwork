import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { MOVEMENT_SNOOZE_MINUTES } from '../../../core/constants/movement.constants';
import { MovementReminderService } from '../../../core/services/movement-reminder.service';
import { UiService } from '../../../core/services/ui.service';

/**
 * The stand-and-walk reminder as the user meets it: one card, one quote, two
 * answers.
 *
 * This is a question, not an announcement — it never fades out on a timer, and
 * the only ways past it are **I'm up** and **Snooze 10 min**. Until one of them
 * is pressed the card stays, which is also what holds the cadence: the
 * reminder will not raise a second question on top of an unanswered one. The bell
 * that keeps ringing until an answer is the service's job, not the card's.
 *
 * The one thing the card does on its own is ask the window to be visible when the
 * question was meant for the desktop but could not be answered there. A movement
 * break cannot be counted for the user the way a glass of water can, so the
 * fallback is the full window, not a silent assumption. See
 * {@link UiService.surfaceForNudge}.
 */
@Component({
  selector: 'app-movement-nudge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!ui.isMiniMode()) {
      @if (reminder.nudge(); as nudge) {
        <div class="nudge-layer">
          <section
            class="move-card"
            role="alertdialog"
            aria-modal="false"
            aria-labelledby="movement-nudge-title"
            aria-describedby="movement-nudge-body"
            [attr.data-id]="nudge.id"
          >
            <div class="nudge-head">
              <div class="move-icon">
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
                  <circle cx="13" cy="4" r="2" />
                  <path d="M13 7 10 12l3 2 2 6" />
                  <path d="M10 12 6 14l-2 4" />
                  <path d="M15 14l3 2 1 4" />
                </svg>
              </div>
              <div class="nudge-text">
                <span class="nudge-eyebrow">Stand &amp; walk</span>
                <h2 class="nudge-title" id="movement-nudge-title">{{ nudge.title }}</h2>
                <p class="nudge-body" id="movement-nudge-body">{{ nudge.body }}</p>
              </div>
            </div>

            <p class="nudge-quote">{{ nudge.quote }}</p>

            <div class="nudge-actions">
              <button type="button" class="nudge-btn primary" (click)="answer('done')">
                I&apos;m up
              </button>
              <button type="button" class="nudge-btn" (click)="answer('snooze')">
                Snooze {{ snoozeMinutes }} min
              </button>
            </div>
          </section>
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        position: fixed;
        top: 24px;
        right: 24px;
        /* Above the water question and every other floating surface: an
           unanswered movement question has to be visible when it arrives. */
        z-index: 10003;
        pointer-events: none;
      }

      .nudge-layer {
        pointer-events: none;
      }

      .move-card {
        pointer-events: all;
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 380px;
        /* 'vw' is the scrollbar's width too wide on a phone that is showing one,
           so the cap is measured against the dynamic viewport with the 'vw' line
           kept above it for browsers that do not know 'dvw'. */
        max-width: calc(100vw - 48px);
        max-width: calc(100dvw - 48px);
        padding: 18px;
        border-radius: var(--glass-radius, 14px);
        background: linear-gradient(135deg, rgba(251, 191, 36, 0.16) 0%, var(--toast-bg) 100%);
        border: 1px solid rgba(251, 191, 36, 0.34);
        backdrop-filter: blur(var(--glass-blur));
        box-shadow: var(--glass-shadow);
        animation: move-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .nudge-head {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }

      .move-icon {
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border-radius: 10px;
        background: rgba(251, 191, 36, 0.16);
        color: #fbbf24;
        animation: move-pulse 2.4s ease-in-out infinite;
      }

      .nudge-text {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }

      .nudge-eyebrow {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #fbbf24;
      }

      .nudge-title {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        line-height: 1.3;
        color: var(--color-text-primary);
      }

      .nudge-body {
        margin: 0;
        font-size: 12px;
        line-height: 1.45;
        color: var(--color-text-secondary);
      }

      .nudge-quote {
        margin: 0;
        padding: 10px 12px;
        border-left: 2px solid rgba(251, 191, 36, 0.5);
        border-radius: 0 8px 8px 0;
        background: rgba(251, 191, 36, 0.08);
        font-size: 12px;
        font-style: italic;
        line-height: 1.5;
        color: var(--color-text-primary);
      }

      .nudge-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .nudge-btn {
        flex: 1;
        padding: 9px 14px;
        border-radius: 8px;
        border: 1px solid var(--glass-border);
        background: var(--glass-bg);
        color: var(--color-text-secondary);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition:
          background 0.2s,
          color 0.2s;
      }

      .nudge-btn:hover {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary);
      }

      .nudge-btn.primary {
        border-color: rgba(251, 191, 36, 0.45);
        background: rgba(251, 191, 36, 0.2);
        color: var(--color-text-primary);
      }

      .nudge-btn.primary:hover {
        background: rgba(251, 191, 36, 0.3);
      }

      @keyframes move-in {
        0% {
          opacity: 0;
          transform: translateY(-12px) scale(0.96);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes move-pulse {
        0%,
        100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.72;
          transform: scale(1.06);
        }
      }

      /* The card is anchored 24px from the top-right corner, which on a phone is
         inside the band the shell keeps for navigation: below 900px the mobile
         top bar is the only way to the drawer, and while a browser is offering to
         install the app the install banner is up there too. A question that
         covers the way out of the page is worse than one asked a little lower, so
         the card starts below both bands. */
      @media (max-width: 900px) {
        :host {
          top: calc(
            var(--install-banner-height) + var(--mobile-topbar-height) + var(--safe-top) + 12px
          );
          right: calc(var(--space-md) + var(--safe-right));
          left: calc(var(--space-md) + var(--safe-left));
        }
        .move-card {
          width: 100%;
          max-width: 100%;
        }
      }

      /* The two answers are the only way past this card, so on a phone they are
         thumb-sized rather than the 35px the pointer layout gives them. */
      @media (max-width: 640px) {
        .nudge-btn {
          min-height: 44px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .move-card,
        .move-icon {
          animation: none;
        }
      }
    `,
  ],
})
export class MovementNudgeComponent {
  protected readonly reminder = inject(MovementReminderService);
  protected readonly ui = inject(UiService);
  protected readonly snoozeMinutes = MOVEMENT_SNOOZE_MINUTES;

  /**
   * True only when this component actually asked the window forward.
   *
   * A question answered on the desktop (`surfaceWindow: false`) never moved the
   * window, so closing it must not hand the window back either.
   */
  private surfaced = false;

  constructor() {
    effect(() => {
      const nudge = this.reminder.nudge();
      const shouldSurface = nudge?.surfaceWindow === true;

      if (shouldSurface && !this.surfaced) {
        this.surfaced = true;
        void this.ui.surfaceForNudge();
      } else if (!shouldSurface && this.surfaced) {
        this.surfaced = false;
        void this.ui.releaseNudgeSurface();
      }
    });
  }

  /** The only ways out: walked, or a ten-minute deferral. */
  answer(action: 'done' | 'snooze'): void {
    void this.reminder.answerNudge(action);
  }
}
