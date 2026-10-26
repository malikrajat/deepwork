import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReminderAnswer, ReminderService } from '../../../core/services/reminder.service';
import { UiService } from '../../../core/services/ui.service';
import { StandingReminder } from '../../../core/models/reminder.model';
import {
  askLabel,
  dueLabel,
  quoteForRing,
  reminderBody,
  rhythmLabel,
} from '../../../core/utils/reminder.util';

/**
 * The standing reminder as the user meets it: one card that will not go away.
 *
 * This is the feature's whole contract in one surface. There is no close cross,
 * no timeout and no click-away: the only ways past it are **Done**, **Snooze 10
 * min** and **Stop reminding**, exactly the three answers the OS notification
 * carries. That is deliberate — a reminder for a presentation that can be lost
 * by clicking the wrong pixel is a reminder the user cannot rely on, and the
 * point of writing it down was to stop relying on memory.
 *
 * It sits at the bottom centre rather than the top right because the water
 * nudge and the completion alert already live up there, and because a card that
 * asks to be dealt with should not cover the notification area it is paired
 * with. It never brings the window forward: the moments this exists for are
 * exactly the ones where the user is somewhere else, and interrupting a
 * presentation to remind someone about it would be the opposite of help.
 */
@Component({
  selector: 'app-reminder-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!ui.isMiniMode()) {
      @if (reminders.active(); as reminder) {
        <div class="reminder-layer">
          <section
            class="reminder-card"
            role="alertdialog"
            aria-modal="false"
            aria-labelledby="standing-reminder-title"
            aria-describedby="standing-reminder-body"
            [attr.data-id]="reminder.id"
          >
            <div class="reminder-head">
              <span class="reminder-bell" aria-hidden="true">
                <svg
                  width="21"
                  height="21"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 01-3.4 0" />
                </svg>
                <span class="reminder-ping" aria-hidden="true"></span>
              </span>

              <div class="reminder-text">
                <span class="reminder-eyebrow"> Standing reminder · {{ askLabel(reminder) }} </span>
                <h2 class="reminder-title" id="standing-reminder-title">{{ reminder.title }}</h2>
                <p class="reminder-body" id="standing-reminder-body">
                  {{ body(reminder) }}
                </p>
                <p class="reminder-meta">
                  {{ due(reminder) }} · {{ rhythm(reminder) }}
                  @if (reminders.waiting() > 0) {
                    <span class="reminder-queue">· {{ reminders.waiting() }} more waiting</span>
                  }
                </p>
              </div>
            </div>

            <p class="reminder-quote">{{ quote(reminder) }}</p>

            <div class="reminder-actions">
              <button type="button" class="reminder-btn primary" (click)="answer('done')">
                Done
              </button>
              <button type="button" class="reminder-btn" (click)="answer('snooze')">
                Snooze 10 min
              </button>
              <button type="button" class="reminder-btn quiet" (click)="answer('stop')">
                Stop
              </button>
            </div>

            <p class="reminder-foot">
              It keeps asking until you answer — no need to rush, no chance to forget.
            </p>
          </section>
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        /* Above every other floating surface, including the water nudge: an
           unanswered promise outranks a suggestion. */
        z-index: 10002;
        pointer-events: none;
        width: min(440px, calc(100vw - 32px));
        width: min(440px, calc(100dvw - 32px));
      }

      .reminder-layer {
        pointer-events: none;
      }

      .reminder-card {
        pointer-events: all;
        display: flex;
        flex-direction: column;
        gap: 13px;
        padding: 17px 18px 14px;
        border-radius: var(--glass-radius, 14px);
        background: linear-gradient(135deg, rgba(251, 191, 36, 0.13) 0%, var(--toast-bg) 100%);
        border: 1px solid rgba(251, 191, 36, 0.34);
        backdrop-filter: blur(var(--glass-blur));
        box-shadow:
          var(--glass-shadow),
          0 0 0 1px rgba(251, 191, 36, 0.06);
        animation: reminder-in 0.42s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .reminder-head {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }

      .reminder-bell {
        position: relative;
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border-radius: 10px;
        background: rgba(251, 191, 36, 0.15);
        color: #fbbf24;
        animation: reminder-pulse 2.2s ease-in-out infinite;
      }

      .reminder-ping {
        position: absolute;
        top: -3px;
        right: -3px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #fbbf24;
        box-shadow: 0 0 0 2px var(--toast-bg);
        animation: reminder-ping 1.8s ease-out infinite;
      }

      .reminder-text {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }

      .reminder-eyebrow {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #fbbf24;
      }

      .reminder-title {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        line-height: 1.3;
        color: var(--color-text-primary);
        overflow-wrap: anywhere;
      }

      .reminder-body {
        margin: 0;
        font-size: 12px;
        line-height: 1.45;
        color: var(--color-text-secondary);
        overflow-wrap: anywhere;
      }

      .reminder-meta {
        margin: 2px 0 0;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: var(--color-text-muted);
      }

      .reminder-queue {
        color: #fbbf24;
      }

      .reminder-quote {
        margin: 0;
        padding: 9px 12px;
        border-left: 2px solid rgba(251, 191, 36, 0.5);
        border-radius: 0 8px 8px 0;
        background: rgba(251, 191, 36, 0.07);
        font-size: 12px;
        font-style: italic;
        line-height: 1.5;
        color: var(--color-text-primary);
      }

      .reminder-actions {
        display: flex;
        align-items: center;
        gap: 7px;
        flex-wrap: wrap;
      }

      .reminder-btn {
        flex: 1 1 auto;
        min-width: 88px;
        padding: 9px 12px;
        border-radius: 8px;
        border: 1px solid var(--glass-border);
        background: var(--glass-bg);
        color: var(--color-text-secondary);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition:
          background 0.2s,
          border-color 0.2s,
          color 0.2s;
      }

      .reminder-btn:hover {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary);
      }

      .reminder-btn.primary {
        border-color: rgba(251, 191, 36, 0.45);
        background: rgba(251, 191, 36, 0.18);
        color: var(--color-text-primary);
      }

      .reminder-btn.primary:hover {
        background: rgba(251, 191, 36, 0.28);
      }

      .reminder-btn.quiet {
        flex: 0 0 auto;
        min-width: 0;
        color: var(--color-text-muted);
      }

      .reminder-foot {
        margin: 0;
        font-size: 10px;
        line-height: 1.4;
        color: var(--color-text-muted);
      }

      @keyframes reminder-in {
        0% {
          opacity: 0;
          transform: translateY(14px) scale(0.97);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes reminder-pulse {
        0%,
        100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.75;
          transform: scale(1.06);
        }
      }

      @keyframes reminder-ping {
        0% {
          opacity: 0.9;
          transform: scale(1);
        }
        70%,
        100% {
          opacity: 0;
          transform: scale(2.4);
        }
      }

      /* The card is anchored to the bottom, where a phone's home indicator and
         the browser's own bar live. It lifts clear of both, and spans the window
         rather than sitting 440px wide against a 320px screen. */
      @media (max-width: 640px) {
        :host {
          bottom: calc(16px + var(--safe-bottom));
          left: calc(12px + var(--safe-left));
          right: calc(12px + var(--safe-right));
          transform: none;
          width: auto;
        }
        .reminder-btn {
          min-height: 44px;
        }
        .reminder-actions {
          gap: 8px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .reminder-card,
        .reminder-bell,
        .reminder-ping {
          animation: none;
        }
      }
    `,
  ],
})
export class ReminderCardComponent {
  protected readonly reminders = inject(ReminderService);
  protected readonly ui = inject(UiService);

  protected askLabel(reminder: StandingReminder): string {
    return askLabel(reminder.fireCount);
  }

  protected body(reminder: StandingReminder): string {
    return reminderBody(reminder, this.reminders.now());
  }

  protected due(reminder: StandingReminder): string {
    return dueLabel(reminder.dueAt, this.reminders.now());
  }

  protected rhythm(reminder: StandingReminder): string {
    return rhythmLabel(reminder.rhythm);
  }

  protected quote(reminder: StandingReminder): string {
    // The notification was posted with the line the service drew, so the card
    // reads that one rather than computing a second answer from the ring count.
    // The list remains the fallback for a card painted before the first post.
    return this.reminders.activeQuote() ?? quoteForRing(reminder.fireCount);
  }

  protected answer(action: ReminderAnswer): void {
    void this.reminders.answer(action);
  }
}
