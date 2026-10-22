import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { UiService } from '../../../core/services/ui.service';
import { WaterReminderService } from '../../../core/services/water-reminder.service';

/**
 * The water reminder as the user meets it: one card, one quote, two answers.
 *
 * This is not the Pomodoro toast. That one announces something and leaves; this
 * one *asks* — so it never fades out on a timer, and the only ways past it are
 * the two buttons. **Yes, I drank …** logs a glass at the size the settings
 * chose; **Not now** closes the card without logging anything. Until one of them
 * is pressed it stays on screen, which is also what holds the cadence: the
 * reminder will not raise a second question on top of an unanswered one.
 *
 * The sound is not the card's business: the reminder rings the alert tone the
 * user chose as it raises this card, so the two always arrive together.
 *
 * The one thing the card does on its own is ask the window to be visible. A
 * question that has to be answered is worthless if it is delivered behind a
 * maximized browser or inside the 136x76 mini widget, so the window is restored
 * and raised while the card is up — see {@link UiService.surfaceForNudge} — and
 * handed back to the user's own always-on-top preference once it is answered.
 */
@Component({
  selector: 'app-water-nudge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!ui.isMiniMode()) {
      @if (reminder.nudge(); as nudge) {
        <div class="nudge-layer">
          <section
            class="nudge-card"
            role="alertdialog"
            aria-modal="false"
            aria-labelledby="water-nudge-title"
            aria-describedby="water-nudge-body"
            [attr.data-id]="nudge.id"
          >
            <div class="nudge-head">
              <div class="nudge-icon">
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
                  <path d="M12 2.7 6.9 8.4a7 7 0 1 0 10.2 0z" />
                </svg>
              </div>
              <div class="nudge-text">
                <span class="nudge-eyebrow">Water reminder</span>
                <h2 class="nudge-title" id="water-nudge-title">{{ nudge.title }}</h2>
                <p class="nudge-body" id="water-nudge-body">{{ nudge.body }}</p>
              </div>
            </div>

            <p class="nudge-quote">{{ nudge.quote }}</p>

            <div class="nudge-actions">
              <button type="button" class="nudge-btn primary" (click)="answer('yes')">
                Yes, I drank {{ nudge.glassLabel }}
              </button>
              <button type="button" class="nudge-btn" (click)="answer('no')">Not now</button>
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
        /* Above every other floating surface — the update prompt sits at 10000,
           and an unanswered question has to be the topmost thing on screen. */
        z-index: 10001;
        pointer-events: none;
      }

      .nudge-layer {
        pointer-events: none;
      }

      .nudge-card {
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
        background: linear-gradient(135deg, rgba(6, 182, 212, 0.16) 0%, var(--toast-bg) 100%);
        border: 1px solid rgba(6, 182, 212, 0.34);
        backdrop-filter: blur(var(--glass-blur));
        box-shadow: var(--glass-shadow);
        animation: nudge-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .nudge-head {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }

      .nudge-icon {
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border-radius: 10px;
        background: rgba(6, 182, 212, 0.18);
        color: var(--color-accent-secondary);
        animation: nudge-pulse 2.4s ease-in-out infinite;
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
        color: var(--color-accent-secondary);
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
        border-left: 2px solid rgba(6, 182, 212, 0.5);
        border-radius: 0 8px 8px 0;
        background: rgba(6, 182, 212, 0.08);
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
        transition: background 0.2s, color 0.2s;
      }

      .nudge-btn:hover {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary);
      }

      .nudge-btn.primary {
        border-color: rgba(6, 182, 212, 0.45);
        background: rgba(6, 182, 212, 0.2);
        color: var(--color-text-primary);
      }

      .nudge-btn.primary:hover {
        background: rgba(6, 182, 212, 0.3);
      }

      @keyframes nudge-in {
        0% {
          opacity: 0;
          transform: translateY(-12px) scale(0.96);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes nudge-pulse {
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

      /* ===== Compact and phone layout =====

         The card is anchored 24px from the top-right corner, which on a phone is
         inside the band the shell keeps for navigation: below 900px the mobile
         top bar is the only way to the drawer, and while a browser is offering to
         install the app the install banner is up there too. A question that
         covers the way out of the page is worse than one asked a little lower, so
         the card starts below both bands — the install banner's height is counted
         whether or not it is showing, because a question that jumps when a banner
         appears is its own kind of surprise, and on a 640px-tall phone the card
         still ends well above the fold.

         It also spans the window rather than sitting 380px wide against the right
         edge: the width was the desktop one, and at 320px that left the card
         hanging off the left of the screen. */
      @media (max-width: 900px) {
        :host {
          top: calc(var(--install-banner-height) + var(--mobile-topbar-height) + var(--safe-top) + 12px);
          right: calc(var(--space-md) + var(--safe-right));
          left: calc(var(--space-md) + var(--safe-left));
        }
        .nudge-card {
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
        .nudge-card,
        .nudge-icon {
          animation: none;
        }
      }
    `,
  ],
})
export class WaterNudgeComponent {
  protected readonly reminder = inject(WaterReminderService);
  protected readonly ui = inject(UiService);

  /**
   * True only when this component actually asked the window forward.
   *
   * A nudge answered on the desktop (`surfaceWindow: false`) never moved the
   * window, so closing it must not hand the window back either: releasing a
   * surface that was never taken would reapply the always-on-top preference in
   * the middle of the mini widget, which keeps itself on top for its own reasons.
   */
  private surfaced = false;

  constructor() {
    effect(() => {
      const nudge = this.reminder.nudge();
      // Read on every nudge, not only when one appears: a question that was
      // meant for the notification can turn out to be unanswerable there (see
      // `WaterReminderService.remind`), and flipping `surfaceWindow` is how the
      // card takes over.
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

  /** The only way out of the card: **Yes** logs the glass, **Not now** does not. */
  answer(answer: 'yes' | 'no'): void {
    void this.reminder.answerNudge(answer);
  }
}
