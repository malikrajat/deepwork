import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MovementReminderService } from '../../../core/services/movement-reminder.service';
import { SettingsService } from '../../../core/services/settings.service';
import { WaterReminderService } from '../../../core/services/water-reminder.service';
import { movementWhyFor } from '../../../core/utils/movement.util';

/**
 * The two health reminders, one click from the dashboard.
 *
 * The water card answers "how much have I drunk"; this card answers "are the
 * reminders that make me drink and move actually on?" — the question a user asks
 * when one of them interrupts them, and the one that used to require a walk to
 * Settings. Both switches write through `SettingsService` and re-tick the owning
 * scheduler, so the card cannot drift from the Settings page: it is the same two
 * booleans, seen from a shorter path.
 *
 * The line above the switches is not decoration. It is the reason the feature
 * exists, chosen by the local day so the card does not repeat itself, and it is
 * deliberately not drawn from the notification quote deck — showing a quote here
 * would consume the line the next reminder was meant to carry.
 */
@Component({
  selector: 'app-desk-health-card',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="desk-card" aria-label="Desk health reminders">
      <div class="desk-head">
        <div>
          <span class="eyebrow">Desk health</span>
          <h2>Stand, walk and hydrate — one click each</h2>
        </div>
        <a class="desk-link" routerLink="/settings">Reminder settings</a>
      </div>

      <p class="desk-why">{{ why }}</p>

      <div class="desk-rows">
        <div class="desk-row">
          <div class="desk-copy">
            <span class="desk-label">Water</span>
            <span class="desk-status">{{ water.status() }}</span>
          </div>
          <button
            type="button"
            class="switch"
            role="switch"
            [attr.aria-checked]="water.enabled()"
            [class.on]="water.enabled()"
            [attr.aria-label]="
              water.enabled() ? 'Turn water reminders off' : 'Turn water reminders on'
            "
            (click)="toggleWater()"
          >
            <span class="knob"></span>
          </button>
        </div>

        <div class="desk-row">
          <div class="desk-copy">
            <span class="desk-label">Stand &amp; walk</span>
            <span class="desk-status">{{ movement.status() }}</span>
          </div>
          <button
            type="button"
            class="switch"
            role="switch"
            [attr.aria-checked]="movement.enabled()"
            [class.on]="movement.enabled()"
            [attr.aria-label]="
              movement.enabled()
                ? 'Turn stand and walk reminders off'
                : 'Turn stand and walk reminders on'
            "
            (click)="toggleMovement()"
          >
            <span class="knob"></span>
          </button>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .desk-card {
        margin-top: var(--space-md);
        padding: var(--space-md) var(--space-lg);
        border-radius: var(--glass-radius-sm);
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        backdrop-filter: blur(var(--glass-blur));
        box-shadow: var(--glass-shadow);
      }

      .desk-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-md);
        flex-wrap: wrap;
      }

      .eyebrow {
        display: block;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }

      h2 {
        margin: 4px 0 0;
        font-size: 14px;
        font-weight: 700;
        color: var(--color-text-primary);
      }

      .desk-link {
        font-size: 12px;
        color: var(--color-text-muted);
        text-decoration: none;
      }

      .desk-link:hover {
        color: var(--color-accent-secondary);
        text-decoration: underline;
      }

      /* The why-line is the feature's argument, not a caption: it sits above the
         switches with a rule of its own, so it is read before the controls are. */
      .desk-why {
        margin: var(--space-sm) 0 var(--space-md);
        padding: 10px 12px;
        border-left: 2px solid rgba(251, 191, 36, 0.5);
        border-radius: 0 8px 8px 0;
        background: rgba(251, 191, 36, 0.07);
        font-size: 12px;
        font-style: italic;
        line-height: 1.5;
        color: var(--color-text-secondary);
      }

      .desk-rows {
        display: flex;
        flex-direction: column;
      }

      .desk-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-md);
        padding: 10px 0;
        border-top: 1px solid var(--glass-border);
      }

      .desk-copy {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .desk-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text-primary);
      }

      .desk-status {
        font-size: 11px;
        color: var(--color-text-muted);
      }

      .switch {
        flex-shrink: 0;
        width: 42px;
        height: 22px;
        border-radius: 999px;
        cursor: pointer;
        padding: 0;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid var(--glass-border);
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
        background: var(--color-text-muted);
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

      .switch:focus-visible {
        outline: 2px solid rgba(139, 92, 246, 0.8);
        outline-offset: 2px;
      }

      @media (max-width: 720px) {
        .desk-card {
          padding: var(--space-md);
        }
      }

      /* A switch is drawn 42x22 and keeps that size, because a track blown up to
         thumb size stops reading as a switch. What grows is the invisible box
         around it, so a tap a few pixels wide of the knob still lands on it. */
      @media (max-width: 640px) {
        .switch::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 44px;
          height: 44px;
          transform: translate(-50%, -50%);
        }
        .desk-link {
          display: inline-flex;
          align-items: center;
          min-height: 44px;
        }
      }
    `,
  ],
})
export class DeskHealthCardComponent {
  protected readonly water = inject(WaterReminderService);
  protected readonly movement = inject(MovementReminderService);
  private readonly settingsService = inject(SettingsService);

  /** One line of why, fixed for the day rather than re-drawn on every render. */
  readonly why = movementWhyFor(new Date());

  async toggleWater(): Promise<void> {
    await this.settingsService.updateField('waterReminders', !this.water.enabled());
    await this.water.tick();
  }

  async toggleMovement(): Promise<void> {
    await this.settingsService.updateField('movementReminders', !this.movement.enabled());
    await this.movement.tick();
  }
}
