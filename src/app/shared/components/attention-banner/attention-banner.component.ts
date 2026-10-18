import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AttentionService } from '../../../core/services/attention.service';

/**
 * The one line that explains why nothing has interrupted the user.
 *
 * Two situations produce silence, and both are confusing without a sentence:
 * the user pressed **Pause** an hour ago and forgot, or their machine is in a
 * focus mode they left on. In the first case the app would otherwise look broken
 * and in the second it would look like it had stopped caring, so the banner says
 * which one it is, what is held, and â€” for a pause â€” offers the way out.
 *
 * It sits at the bottom-left, opposite the card, because it is an explanation
 * rather than an interruption and must never cover the message it explains.
 */
@Component({
  selector: 'app-attention-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shown()) {
      <div class="attention-banner" role="status" aria-live="polite">
        <span class="banner-icon" aria-hidden="true">
          @if (attention.paused()) {
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          } @else {
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
          }
        </span>
        <span class="banner-text">{{ notice()?.text }}</span>
        @if (notice()?.action === 'resume') {
          <button type="button" class="banner-button" (click)="resume()">Resume</button>
        }
        <button type="button" class="banner-close" aria-label="Dismiss" (click)="dismiss()">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    }
  `,
  styles: [
    `
      :host {
        position: fixed;
        left: 24px;
        bottom: 24px;
        z-index: 950;
        pointer-events: none;
        max-width: min(420px, calc(100vw - 48px));
      }
      .attention-banner {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 9px 10px 9px 12px;
        border-radius: 10px;
        background: var(--surface-float, rgba(15, 11, 31, 0.94));
        border: 1px solid rgba(139, 92, 246, 0.28);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(14px);
        pointer-events: auto;
        animation: banner-in 0.25s ease-out;
      }
      .banner-icon {
        display: inline-flex;
        color: var(--color-accent-primary, #a78bfa);
        flex: 0 0 auto;
      }
      .banner-text {
        font-size: 12px;
        line-height: 1.45;
        color: var(--color-text-secondary, #d4d4d8);
      }
      .banner-button {
        flex: 0 0 auto;
        padding: 4px 10px;
        border-radius: 7px;
        font: inherit;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        color: var(--color-text-primary, #fff);
        background: rgba(139, 92, 246, 0.24);
        border: 1px solid rgba(139, 92, 246, 0.5);
      }
      .banner-button:hover {
        background: rgba(139, 92, 246, 0.36);
      }
      .banner-close {
        flex: 0 0 auto;
        width: 22px;
        height: 22px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--color-text-muted, #a1a1aa);
        cursor: pointer;
      }
      .banner-close:hover {
        background: rgba(255, 255, 255, 0.08);
        color: var(--color-text-primary, #fff);
      }
      @keyframes banner-in {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      /* On a phone the banner takes the width it has and clears the home
         indicator; the toast above it is the one that owns the bottom-right
         corner, so this stays left and full-width rather than beside it. */
      @media (max-width: 640px) {
        :host {
          left: calc(12px + var(--safe-left));
          right: calc(12px + var(--safe-right));
          bottom: calc(12px + var(--safe-bottom));
          max-width: none;
        }
        .banner-close {
          width: 44px;
          height: 44px;
        }
      }
    `,
  ],
})
export class AttentionBannerComponent {
  protected readonly attention = inject(AttentionService);

  /**
   * What the banner says, or null when there is nothing to explain.
   *
   * Priority is deliberate: a pause is something the user did and can undo, so it
   * is what they most need to be reminded of; the desktop's quiet state is next;
   * and held reminders are the tail of either.
   */
  protected readonly notice = computed(() => {
    const attention = this.attention;

    if (attention.paused()) {
      const until = attention.pauseLabel();
      return {
        key: `paused:${until}`,
        text:
          until === 'until you resume'
            ? 'Reminders are paused until you resume. The timer is waiting too.'
            : `Reminders are paused until ${until}. Nothing will interrupt you.`,
        action: 'resume' as 'resume' | null,
      };
    }

    if (attention.quietNow()) {
      return {
        key: `quiet:${attention.quiet()}`,
        text: 'Focus mode is on: suggestion cards are held. Timer alerts still arrive, and Windows decides what to do with desktop notifications.',
        action: null as 'resume' | null,
      };
    }

    const held = attention.heldNudges();
    if (held > 0) {
      return {
        key: `held:${held}`,
        text: `${held} reminder${held === 1 ? '' : 's'} came round while reminders were paused. They will arrive again on the next one.`,
        action: null as 'resume' | null,
      };
    }

    return null;
  });

  /** A dismissal lasts until the banner has something different to say. */
  private readonly dismissedFor = signal<string | null>(null);

  protected readonly shown = computed(() => {
    const notice = this.notice();
    return notice !== null && this.dismissedFor() !== notice.key;
  });

  dismiss(): void {
    const notice = this.notice();
    if (!notice) return;
    this.dismissedFor.set(notice.key);
    // Dismissing the held count is the acknowledgement: the reminders it
    // mentions are not coming back as a burst, so keeping the tally would only
    // leave a number nobody can act on.
    if (notice.key.startsWith('held:')) this.attention.releaseHeld();
  }

  resume(): void {
    this.attention.resume();
  }
}
