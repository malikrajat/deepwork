import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SettingsService } from '../../../core/services/settings.service';

/**
 * The two body reminders, offered once during the first-run setup.
 *
 * The same two booleans the Dashboard's desk-health card and Settings already
 * own, seen from the one moment a new install can explain them before they
 * interrupt anything. Both write through `SettingsService`, and the schedulers
 * read those settings on every pass, so "off" here means off on the Dashboard, in
 * Settings, on the desktop and in the notification centre — not a second
 * preference that could drift from the real one.
 *
 * The schedulers are deliberately not injected here: the stand-and-walk service
 * is lazy-loaded, and a dialog in the first paint must not pull it back into the
 * initial bundle just to flip a switch.
 */
@Component({
  selector: 'app-reminder-prefs-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="reminders">
      <p class="why">
        Reminders look after the body doing the work. Off means off everywhere — no card, no tone
        and no notification. You can change either one from the Dashboard at any time.
      </p>

      <div class="row">
        <div class="copy">
          <span class="label">Water reminders</span>
          <span class="detail">A short nudge to drink a glass during your working hours.</span>
        </div>
        <button
          type="button"
          class="switch"
          role="switch"
          [class.on]="waterOn()"
          [attr.aria-checked]="waterOn()"
          [attr.aria-label]="waterOn() ? 'Turn water reminders off' : 'Turn water reminders on'"
          [disabled]="busy()"
          (click)="toggleWater()"
        >
          <span class="knob"></span>
        </button>
      </div>

      <div class="row">
        <div class="copy">
          <span class="label">Stand &amp; walk reminders</span>
          <span class="detail">A short nudge to leave the chair and move during your working hours.</span>
        </div>
        <button
          type="button"
          class="switch"
          role="switch"
          [class.on]="movementOn()"
          [attr.aria-checked]="movementOn()"
          [attr.aria-label]="
            movementOn()
              ? 'Turn stand and walk reminders off'
              : 'Turn stand and walk reminders on'
          "
          [disabled]="busy()"
          (click)="toggleMovement()"
        >
          <span class="knob"></span>
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .reminders {
        margin-top: 12px;
      }

      .why {
        margin: 0 0 2px;
        font-size: 11.5px;
        line-height: 1.45;
        color: var(--color-text-muted, #a1a1aa);
      }

      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 7px 0;
        border-bottom: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
      }

      .row:last-child {
        border-bottom: none;
      }

      .copy {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .label {
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text-secondary, #d4d4d8);
      }

      .detail {
        font-size: 11px;
        line-height: 1.45;
        color: var(--color-text-muted, #a1a1aa);
      }

      .switch {
        flex: 0 0 auto;
        width: 42px;
        height: 22px;
        border-radius: 999px;
        cursor: pointer;
        padding: 0;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
        position: relative;
        transition:
          background 0.2s,
          border-color 0.2s;
      }

      .switch .knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--color-text-muted, #a1a1aa);
        transition:
          transform 0.2s,
          background 0.2s;
      }

      .switch.on {
        background: rgba(139, 92, 246, 0.35);
        border-color: rgba(139, 92, 246, 0.6);
      }

      .switch.on .knob {
        transform: translateX(20px);
        background: #ede9fe;
      }

      .switch:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .switch:focus-visible {
        outline: 2px solid rgba(139, 92, 246, 0.8);
        outline-offset: 2px;
      }
    `,
  ],
})
export class ReminderPrefsPanelComponent {
  private readonly settings = inject(SettingsService);

  /** True while a switch is being written. */
  protected readonly busy = signal(false);

  readonly waterOn = computed(() => this.settings.settings().waterReminders);
  readonly movementOn = computed(() => this.settings.settings().movementReminders);

  async toggleWater(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.settings.updateField('waterReminders', !this.waterOn());
    } finally {
      this.busy.set(false);
    }
  }

  async toggleMovement(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.settings.updateField('movementReminders', !this.movementOn());
    } finally {
      this.busy.set(false);
    }
  }
}
