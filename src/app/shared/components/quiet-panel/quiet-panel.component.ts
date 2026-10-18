import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { QuietService } from '../../../core/services/quiet.service';
import { AttentionService } from '../../../core/services/attention.service';

/**
 * Pause, mute and focus — the same three controls everywhere.
 *
 * This is the panel itself, without a frame around it. It is drawn twice: inside
 * the dialog the sidebar and the mobile top bar open, and as a card on the
 * Settings page. One component means the wording, the options and the state can
 * never drift between the quick control and the page someone reads when they
 * want to understand it.
 *
 * The rules it follows are the same ones the tray's menu follows, because it is
 * the same service behind both: a pause covers the timer, the cards and the
 * system notifications; a mute covers the sound and always has an end; focus
 * mode changes the view and leaves the reminders running.
 */
@Component({
  selector: 'app-quiet-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="quiet-state" [class.on]="quiet.active()" role="status">{{ quiet.statusLabel() }}</p>

    <section class="quiet-block">
      <div class="quiet-copy">
        <span class="quiet-title">Focus mode</span>
        <small class="quiet-note">
          Hides the navigation and puts the timer on its own. Timer alerts still arrive.
        </small>
      </div>
      <button
        type="button"
        class="quiet-action"
        [class.on]="quiet.focusMode()"
        [attr.aria-pressed]="quiet.focusMode()"
        (click)="quiet.toggleFocus()"
      >
        {{ quiet.focusMode() ? 'Exit focus' : 'Enter focus' }}
      </button>
    </section>

    <section class="quiet-block">
      <div class="quiet-copy">
        <span class="quiet-title">Pause reminders</span>
        <small class="quiet-note">
          @if (quiet.paused()) {
            Paused {{ attention.pauseLabel() }}. The timer and every reminder are waiting.
          } @else {
            Stops the timer, the cards and the system notifications together.
          }
        </small>
      </div>
      @if (quiet.paused()) {
        <button type="button" class="quiet-action primary" (click)="quiet.resume()">Resume</button>
      } @else {
        <div class="quiet-options" role="group" aria-label="Pause for how long">
          <button type="button" class="quiet-chip" (click)="quiet.pause(30)">30 min</button>
          <button type="button" class="quiet-chip" (click)="quiet.pause(60)">1 hour</button>
          <button type="button" class="quiet-chip" (click)="quiet.pause(240)">4 hours</button>
          <button type="button" class="quiet-chip" (click)="quiet.pause(null)">Until I resume</button>
        </div>
      }
    </section>

    <section class="quiet-block">
      <div class="quiet-copy">
        <span class="quiet-title">Reminder sound</span>
        <small class="quiet-note">
          @if (quiet.muted()) {
            Muted until {{ attention.muteLabel() }}. Cards still arrive; only the tone is off.
          } @else {
            The tone only. A mute always ends by itself — nothing is left switched off.
          }
        </small>
      </div>
      @if (quiet.muted()) {
        <button type="button" class="quiet-action primary" (click)="quiet.unmute()">
          Sound on
        </button>
      } @else {
        <div class="quiet-options" role="group" aria-label="Mute the sound for how long">
          <button type="button" class="quiet-chip" (click)="quiet.mute(30)">30 min</button>
          <button type="button" class="quiet-chip" (click)="quiet.mute(60)">1 hour</button>
          <button type="button" class="quiet-chip" (click)="quiet.mute('today')">Rest of today</button>
        </div>
      }
    </section>

    <p class="quiet-footnote">
      These controls are the same on Windows, macOS, Linux, the installed web app and this browser.
      A reminder the app could not deliver is counted, not lost — the page says how many are waiting.
    </p>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .quiet-state {
        margin: 0 0 14px;
        padding: 6px 10px;
        border-radius: var(--radius-md, 10px);
        background: var(--glass-bg, rgba(255, 255, 255, 0.05));
        border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.09));
        font-size: var(--text-sm, 12px);
        color: var(--color-text-muted, #8b87ab);
      }
      .quiet-state.on {
        border-color: rgba(139, 92, 246, 0.45);
        background: rgba(139, 92, 246, 0.12);
        color: var(--color-text-secondary, #b6b2d0);
      }

      .quiet-block {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px 16px;
        padding: 12px 0;
        border-bottom: 1px solid var(--glass-border, rgba(255, 255, 255, 0.09));
      }
      .quiet-block:last-of-type {
        border-bottom: none;
      }
      .quiet-copy {
        flex: 1 1 220px;
        min-width: 0;
      }
      .quiet-title {
        display: block;
        font-size: var(--text-md, 14px);
        font-weight: 600;
        color: var(--color-text-primary, #f2f0ff);
      }
      .quiet-note {
        display: block;
        margin-top: 3px;
        font-size: var(--text-sm, 12px);
        line-height: 1.45;
        color: var(--color-text-muted, #8b87ab);
      }

      .quiet-action {
        flex: 0 0 auto;
        min-height: 36px;
        padding: 7px 16px;
        border-radius: var(--radius-md, 10px);
        border: 1px solid rgba(139, 92, 246, 0.35);
        background: rgba(139, 92, 246, 0.08);
        color: var(--color-text-primary, #f2f0ff);
        font: inherit;
        font-size: var(--text-sm, 12px);
        font-weight: 600;
        cursor: pointer;
        transition:
          background 0.2s,
          border-color 0.2s;
      }
      .quiet-action:hover {
        background: rgba(139, 92, 246, 0.18);
        border-color: rgba(139, 92, 246, 0.6);
      }
      .quiet-action.on {
        background: rgba(139, 92, 246, 0.22);
        border-color: rgba(139, 92, 246, 0.65);
      }
      .quiet-action.primary {
        background: var(--color-accent-gradient, linear-gradient(135deg, #8b5cf6, #06b6d4));
        border-color: transparent;
        color: #fff;
      }

      .quiet-options {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        flex: 1 1 100%;
      }
      .quiet-chip {
        flex: 1 1 auto;
        min-height: 34px;
        padding: 6px 12px;
        border-radius: var(--radius-sm, 8px);
        border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.09));
        background: var(--glass-bg, rgba(255, 255, 255, 0.05));
        color: var(--color-text-secondary, #b6b2d0);
        font: inherit;
        font-size: var(--text-sm, 12px);
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        transition:
          background 0.2s,
          border-color 0.2s,
          color 0.2s;
      }
      .quiet-chip:hover {
        background: var(--glass-bg-hover, rgba(255, 255, 255, 0.075));
        border-color: rgba(139, 92, 246, 0.45);
        color: var(--color-text-primary, #f2f0ff);
      }

      .quiet-footnote {
        margin: 14px 0 0;
        font-size: var(--text-xs, 11px);
        line-height: 1.5;
        color: var(--color-text-muted, #8b87ab);
      }

      /* ===== Phone layout =====
         A thumb is not a mouse: every answer here is a full-width 44px row, and
         the options form a 2x2 block rather than a line of four that would each
         be narrower than a fingertip. */
      @media (max-width: 640px) {
        .quiet-block {
          align-items: stretch;
        }
        .quiet-action {
          flex: 1 1 100%;
          min-height: 44px;
        }
        .quiet-options {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .quiet-chip {
          min-height: 44px;
          white-space: normal;
        }
      }
    `,
  ],
})
export class QuietPanelComponent {
  protected readonly quiet = inject(QuietService);
  /** Read for the two countdown labels, which belong to the attention state. */
  protected readonly attention = inject(AttentionService);
}
