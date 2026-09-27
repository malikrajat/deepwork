import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WaterReminderService } from '../../../core/services/water-reminder.service';
import { WaterService } from '../../../core/services/water.service';
import { formatClockTime, formatMillilitres } from '../../../core/utils/water.util';

/**
 * Today's water, on the dashboard.
 *
 * The card is a view and nothing else: the tally comes from {@link WaterService}
 * and the reminder's state from {@link WaterReminderService}, both of which are
 * shared with the notification itself, so the number on screen and the number in
 * the reminder can never drift apart. It owns no timer and no subscription —
 * the only thing it does on its own is read today's drinks once when it appears.
 */
@Component({
  selector: 'app-water-card',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="water-card" aria-label="Water intake">
      <div class="water-main">
        <div class="water-header">
          <div>
            <span class="eyebrow">Water intake</span>
            <h2>{{ totalLabel() }} of {{ goalLabel() }} today</h2>
          </div>
          <span class="water-percent">{{ water.percent() }}%</span>
        </div>

        <div
          class="water-track"
          role="progressbar"
          [attr.aria-valuenow]="water.percent()"
          aria-valuemin="0"
          aria-valuemax="100"
          [attr.aria-label]="'Water intake: ' + totalLabel() + ' of ' + goalLabel()"
        >
          <span class="water-fill" [style.width.%]="water.percent()"></span>
        </div>

        <div class="water-stats">
          <span
            ><strong>{{ water.drinkCount() }}</strong> {{ drinkWord() }}</span
          >
          <span
            ><strong>{{ lastDrinkLabel() }}</strong> last drink</span
          >
          <span>{{ reminder.status() }}</span>
        </div>
      </div>

      <div class="water-actions">
        <button type="button" class="water-btn primary" (click)="addGlass()">
          + {{ glassLabel() }}
        </button>
        <button
          type="button"
          class="water-btn"
          (click)="water.undoLast()"
          [disabled]="water.drinkCount() === 0"
        >
          Undo
        </button>
        <a class="water-link" routerLink="/settings">Reminder settings</a>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .water-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-lg);
        flex-wrap: wrap;
        margin-top: var(--space-md);
        padding: var(--space-md) var(--space-lg);
        border-radius: var(--glass-radius-sm);
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        backdrop-filter: blur(var(--glass-blur));
        box-shadow: var(--glass-shadow);
      }

      .water-main {
        flex: 1;
        min-width: 260px;
      }

      .water-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-md);
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

      .water-percent {
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        color: var(--color-accent-secondary);
        background: rgba(6, 182, 212, 0.12);
        border: 1px solid rgba(6, 182, 212, 0.28);
      }

      .water-track {
        height: 6px;
        margin-top: var(--space-sm);
        border-radius: 999px;
        background: var(--clock-track);
        overflow: hidden;
      }

      .water-fill {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: var(--color-accent-gradient);
        transition: width 0.3s ease;
      }

      .water-stats {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-md);
        margin-top: var(--space-sm);
        font-size: 12px;
        color: var(--color-text-muted);
      }

      .water-stats strong {
        color: var(--color-text-secondary);
        font-weight: 600;
      }

      .water-actions {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        flex-wrap: wrap;
      }

      .water-btn {
        padding: 8px 16px;
        border-radius: 8px;
        border: 1px solid var(--glass-border);
        background: var(--glass-bg);
        color: var(--color-text-secondary);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .water-btn:hover:not(:disabled) {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary);
      }

      .water-btn.primary {
        border-color: rgba(6, 182, 212, 0.4);
        background: rgba(6, 182, 212, 0.16);
        color: var(--color-text-primary);
      }

      .water-btn.primary:hover:not(:disabled) {
        background: rgba(6, 182, 212, 0.26);
      }

      .water-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .water-link {
        font-size: 12px;
        color: var(--color-text-muted);
        text-decoration: none;
      }

      .water-link:hover {
        color: var(--color-accent-secondary);
        text-decoration: underline;
      }

      @media (max-width: 720px) {
        .water-card {
          align-items: flex-start;
          flex-direction: column;
          gap: var(--space-md);
        }
      }
    `,
  ],
})
export class WaterCardComponent implements OnInit {
  protected readonly water = inject(WaterService);
  protected readonly reminder = inject(WaterReminderService);

  /** Today's total, ready to read. */
  readonly totalLabel = computed(() => formatMillilitres(this.water.totalMl()));

  /** The target, ready to read. */
  readonly goalLabel = computed(() => formatMillilitres(this.water.goalMl()));

  /** One glass, as the button shows it. */
  readonly glassLabel = computed(() => formatMillilitres(this.water.glassMl()));

  /** "1 drink" reads as poorly as "1 drinks". */
  readonly drinkWord = computed(() => (this.water.drinkCount() === 1 ? 'drink' : 'drinks'));

  /** When the last drink was, or a nudge to start. */
  readonly lastDrinkLabel = computed(() => {
    const at = this.water.lastAt();
    return at ? formatClockTime(new Date(at)) : '—';
  });

  ngOnInit(): void {
    // Reading today's drinks is the one thing this card does for itself; the
    // reminder loop keeps the tally fresh from here.
    void this.water.load();
  }

  /** One more glass, at the size the user chose. */
  addGlass(): void {
    void this.water.log();
  }
}
