import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { form, FormField, submit, required, validate } from '@angular/forms/signals';
import { DbService } from '../../core/services/db.service';
import { FormFieldWrapperComponent } from '../../shared/components/form-field/form-field-wrapper.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { HabitFormModel, createHabitFormDefaults } from '../../shared/models/form.models';
import { noXss, trimmedRequired } from '../../shared/validators/form-validators';
import { buildHabitStats, dayOfIso, localDay } from '../../core/utils/insights.util';

interface Habit {
  id: string;
  name: string;
  icon: string;
  targetFrequency: string;
  createdAt: string;
}

interface HabitEntry {
  id: string;
  habitId: string;
  completedAt: string;
}

const WINDOW_DAYS = 30;

/**
 * Habits with the numbers that actually move behaviour: a 30-day consistency
 * rate, the current streak, the personal best, and the check-in strip that
 * shows exactly which days were missed.
 */
@Component({
  selector: 'app-habits',
  imports: [FormField, FormFieldWrapperComponent, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header animate-fade-in">
      <div>
        <h1 class="gradient-text page-title">Habits</h1>
        <p class="page-subtitle">Build consistency, one day at a time</p>
      </div>
      @if (summary().tracked) {
        <div class="header-stats">
          <div
            class="stat-pill"
            appTooltip="Average of every habit's completion rate over the last 30 days"
          >
            <span class="stat-value">{{ summary().average }}%</span>
            <span class="stat-label">30-day consistency</span>
          </div>
          <div class="stat-pill" appTooltip="Your longest running check-in streak right now">
            <span class="stat-value">{{ summary().bestStreak }}d</span>
            <span class="stat-label">best active streak</span>
          </div>
          <div
            class="stat-pill"
            appTooltip="Check-ins recorded in the last 30 days across all habits"
          >
            <span class="stat-value">{{ summary().checkIns }}</span>
            <span class="stat-label">check-ins · 30d</span>
          </div>
        </div>
      }
    </div>

    <!-- Add Habit Form -->
    <div class="add-form animate-fade-in-delay-1">
      <app-form-field [fieldState]="habitForm.name()">
        <input
          type="text"
          [formField]="habitForm.name"
          placeholder="New habit name..."
          class="habit-input"
        />
      </app-form-field>
      <app-form-field [fieldState]="habitForm.icon()">
        <input type="text" [formField]="habitForm.icon" placeholder="✓" class="icon-input" />
      </app-form-field>
      <button
        class="btn btn-primary btn-sm"
        (click)="addHabit()"
        [disabled]="habitForm().invalid()"
      >
        Add
      </button>
    </div>

    @if (summary().tracked) {
      <p class="reading animate-fade-in-delay-1">{{ summary().reading }}</p>
    }

    <!-- Habits Grid -->
    @if (cards().length > 0) {
      <div class="habits-grid animate-fade-in-delay-1">
        @for (habit of cards(); track habit.id) {
          <div
            class="habit-card"
            [class.done-today]="habit.doneToday"
            [class.slipping]="habit.stat.completionPercent < 40"
          >
            <div class="habit-header">
              <span class="habit-icon">{{ habit.icon }}</span>
              <span
                class="consistency-badge"
                [class.good]="habit.stat.completionPercent >= 70"
                [class.mid]="
                  habit.stat.completionPercent >= 40 && habit.stat.completionPercent < 70
                "
              >
                {{ habit.stat.completionPercent }}%
              </span>
              <button class="delete-btn" (click)="deleteHabit(habit.id)" aria-label="Delete habit">
                ×
              </button>
            </div>
            <div class="habit-name" [appTooltip]="habit.name">{{ habit.name }}</div>

            <div class="streak-row">
              <span class="streak-fire">🔥</span>
              <span class="streak-count">{{ habit.stat.currentStreak }}</span>
              <span class="streak-label">day streak</span>
              <span class="best-streak" appTooltip="Your longest run for this habit"
                >best {{ habit.stat.bestStreak }}d</span
              >
            </div>

            <button
              class="check-btn"
              [class.checked]="habit.doneToday"
              (click)="toggleToday(habit)"
            >
              {{ habit.doneToday ? '✓ Done today' : 'Check in' }}
            </button>

            <div
              class="strip"
              [appTooltip]="
                'Last ' +
                windowDays +
                ' days · ' +
                habit.stat.days.filter(truthy).length +
                ' completed'
              "
            >
              @for (done of habit.stat.days; track $index) {
                <span
                  class="strip-dot"
                  [class.done]="done"
                  [class.today]="$index === habit.stat.days.length - 1"
                ></span>
              }
            </div>
            <div class="strip-labels"><span>30 days ago</span><span>today</span></div>
            <div class="habit-total">{{ habit.stat.totalCompletions }} check-ins all-time</div>
          </div>
        }
      </div>
    } @else {
      <div class="empty-state animate-fade-in-delay-1">
        <h2 class="empty-title">No habits yet</h2>
        <p class="empty-desc">Add your first habit above to start tracking streaks.</p>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .page-header {
        margin-bottom: var(--space-lg);
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }
      .page-title {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.5px;
      }
      .page-subtitle {
        color: var(--color-text-muted);
        margin-top: 4px;
        font-size: 14px;
      }
      .header-stats {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .stat-pill {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 6px 14px;
        border-radius: 12px;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
      }
      .stat-value {
        font-size: 15px;
        font-weight: 800;
        color: var(--color-text-primary);
      }
      .stat-label {
        font-size: 10px;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .add-form {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        margin-bottom: var(--space-md);
        padding: var(--space-md);
        border-radius: 14px;
        background: var(--glass-bg);
        border: 1px solid rgba(139, 92, 246, 0.08);
      }
      .habit-input {
        flex: 1;
        min-width: 180px;
      }
      .icon-input {
        width: 64px;
        text-align: center;
      }
      input {
        background: var(--control-bg);
        border: 1px solid rgba(139, 92, 246, 0.12);
        border-radius: 10px;
        padding: 9px 12px;
        color: var(--color-text-primary);
        font-size: 14px;
        outline: none;
      }
      input:focus {
        border-color: rgba(139, 92, 246, 0.4);
      }
      .btn {
        padding: 9px 18px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: none;
      }
      .btn-primary {
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        color: white;
      }
      .btn-primary:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .reading {
        font-size: 12px;
        line-height: 1.55;
        color: var(--color-text-secondary);
        padding: 10px 14px;
        border-radius: 12px;
        margin-bottom: var(--space-md);
        background: rgba(139, 92, 246, 0.06);
        border: 1px solid rgba(139, 92, 246, 0.15);
      }

      .habits-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(268px, 1fr));
        gap: var(--space-md);
      }
      .habit-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: var(--space-md);
        border-radius: 16px;
        background: var(--glass-bg);
        border: 1px solid rgba(139, 92, 246, 0.1);
        transition: border-color 0.2s;
      }
      .habit-card.done-today {
        border-color: rgba(52, 211, 153, 0.35);
      }
      .habit-card.slipping {
        border-color: rgba(251, 191, 36, 0.25);
      }
      .habit-header {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .habit-icon {
        font-size: 20px;
      }
      .consistency-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(248, 113, 113, 0.14);
        color: #fca5a5;
      }
      .consistency-badge.mid {
        background: rgba(251, 191, 36, 0.14);
        color: #fbbf24;
      }
      .consistency-badge.good {
        background: rgba(52, 211, 153, 0.14);
        color: #34d399;
      }
      .delete-btn {
        margin-left: auto;
        background: none;
        border: none;
        color: var(--color-text-muted);
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        padding: 0 4px;
      }
      .delete-btn:hover {
        color: #fca5a5;
      }
      .habit-name {
        font-size: 14px;
        font-weight: 700;
        color: var(--color-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .streak-row {
        display: flex;
        align-items: baseline;
        gap: 5px;
      }
      .streak-fire {
        font-size: 14px;
      }
      .streak-count {
        font-size: 18px;
        font-weight: 800;
        color: var(--color-text-primary);
      }
      .streak-label {
        font-size: 10px;
        color: var(--color-text-muted);
      }
      .best-streak {
        margin-left: auto;
        font-size: 10px;
        color: var(--color-text-muted);
      }
      .check-btn {
        padding: 7px;
        border-radius: 10px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        background: rgba(139, 92, 246, 0.14);
        border: 1px solid rgba(139, 92, 246, 0.3);
        color: var(--color-text-primary);
        transition: all 0.2s;
      }
      .check-btn:hover {
        background: rgba(139, 92, 246, 0.24);
      }
      .check-btn.checked {
        background: rgba(52, 211, 153, 0.16);
        border-color: rgba(52, 211, 153, 0.4);
        color: #6ee7b7;
      }
      .strip {
        display: flex;
        gap: 2px;
        flex-wrap: wrap;
        margin-top: 2px;
      }
      .strip-dot {
        width: 7px;
        height: 7px;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.07);
      }
      .strip-dot.done {
        background: rgba(139, 92, 246, 0.85);
      }
      .strip-dot.today {
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35);
      }
      .strip-labels {
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: var(--color-text-muted);
      }
      .habit-total {
        font-size: 10px;
        color: var(--color-text-muted);
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 60px 0;
        text-align: center;
      }
      .empty-title {
        font-size: 18px;
        font-weight: 700;
        color: var(--color-text-secondary);
      }
      .empty-desc {
        font-size: 14px;
        color: var(--color-text-muted);
      }

      /* Phone layout.

         Everything below answers one of two questions: does anything here
         insist on more width than a phone's column actually has, and can a
         thumb hit what is left. No rule above the breakpoint moves — each one
         here either releases a desktop minimum that no longer fits or adds
         height that a mouse pointer never needed. */

      @media (max-width: 640px) {
        /* The add row is a single line on the desktop, held open by the name
           input's own min-width of 180px. A 320px phone hands the whole form
           less width than that floor, and a min-width on a flex child is a
           promise the row cannot break: the input would rather push the icon
           field and the Add button off the card than shrink. Letting the row
           wrap gives the name a line of its own and puts the other two
           underneath it. */
        .add-form {
          flex-wrap: wrap;
        }
        .add-form app-form-field {
          min-width: 0;
        }
        .add-form app-form-field:first-child {
          flex: 1 1 100%;
        }
        .add-form .btn {
          flex: 1;
        }
        /* The same 180px floor again, released so the input can use the whole
           line the wrap above just gave it. */
        .habit-input {
          min-width: 0;
          width: 100%;
        }

        /* A month of 7px dots needs 268px at the desktop 2px gap, and a 320px
           phone leaves the card 256px for them. The strip already wraps, but a
           second row of dots would land under a label that still reads
           "today", so the gap tightens instead and the whole month stays on one
           line. */
        .strip {
          gap: 1px;
        }

        /* The desktop grid's 268px column floor is wider than the column a
           phone gives it, and a track cannot shrink below its own floor. The CSS
           min() function lets that floor fall to the container's width, while
           every container at or above 268px still resolves to exactly the
           auto-fill grid it resolves to today. */
        .habits-grid {
          grid-template-columns: repeat(auto-fill, minmax(min(268px, 100%), 1fr));
        }
        /* A grid item is min-width: auto by default, which is what would
           otherwise let a long habit name hold the card wider than its track. */
        .habit-card {
          min-width: 0;
        }
        /* The reading paragraph quotes habit names back, and a name typed as one
           unbroken word is exactly as wide as that word. */
        .reading {
          overflow-wrap: anywhere;
        }

        /* Touch targets. Delete is a bare 18px glyph, Check in is 28px tall and
           the two fields are 36px — all under the 44px a fingertip covers — so
           each gets that minimum here. Sizes only ever grow: nothing that was
           already big enough is made smaller. The fields are named through
           their parent because the global input rule sets the same 36px at the
           same specificity, which leaves the two rules to be decided by
           stylesheet order alone. */
        .add-form input {
          min-height: 44px;
        }
        .btn {
          min-height: 44px;
        }
        .delete-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          padding: 0;
        }
        .check-btn {
          min-height: 44px;
        }
      }

      /* Large screens.

         The third size of this page. The phone rules above release two floors
         that no longer fit; these put a ceiling on two things that have grown
         past what they were for. The grid's auto-fill was written for a laptop
         window and has no upper bound: handed 1960px of column it answers with
         seven 268px cards and two hundred pixels of nothing, and handed a 3840px
         television it answers with seven tracks stretched to 277px, which is a
         card that has stopped being a card and started being a letterbox.

         Counting the tracks is what fixes that at both ends, and the counts are
         chosen so every card stays between 265px and 320px — the range the
         desktop grid already draws the card at, and the width the 30-dot strip
         needs at its 2px gap.

         The header and the grid are held to one width and centred together, so
         the title and its three stat pills stop being pushed to opposite ends
         of a two-metre row. */

      @media (min-width: 1920px) {
        .page-header,
        .habits-grid {
          max-width: 1700px;
          margin-inline: auto;
        }
        /* Six tracks of 310px across a 1700px band, bound by the card's own
           280px floor rather than by whatever width the window happens to be.
           The whole number of tracks rarely divides the band exactly, so a row
           finishes short of its right edge by part of a card; centring the
           tracks turns that remainder into an even margin on both sides instead
           of leaving it all at the end of the row. */
        .habits-grid {
          grid-template-columns: repeat(6, minmax(280px, 1fr));
          justify-content: center;
        }
      }

      @media (min-width: 2560px) {
        /* The same band, read from further away: this is the breakpoint the
           shell raises the type ladder at, and every size on this page is a
           literal that the ladder cannot reach. */
        .page-title {
          font-size: 34px;
        }
        .page-subtitle {
          font-size: 16px;
        }
        .stat-value {
          font-size: 18px;
        }
        .stat-label {
          font-size: 11px;
        }
        .stat-pill {
          padding: 8px 18px;
        }
        input {
          font-size: 16px;
        }
        .btn {
          font-size: 15px;
        }
        .reading {
          font-size: 14px;
        }
        .habit-name {
          font-size: 16px;
        }
        .consistency-badge {
          font-size: 11px;
        }

        /* Six tracks at 24px of gap: the same 306px card, with the air between
           the cards growing instead of the cards themselves. */
        .habits-grid {
          grid-template-columns: repeat(6, minmax(320px, 1fr));
          gap: 24px;
        }
      }

      @media (min-width: 3440px) {
        .page-title {
          font-size: 36px;
        }
        /* Seven tracks, and no eighth: a track narrower than about 268px cannot
           hold the 30-dot month strip on one line at the 2px gap it is drawn
           with, and at 283px the card is already wider than the 268px the
           desktop grid draws it at. The extra width goes to the gaps and then
           to the margins rather than to a card the strip would have to wrap
           inside. */
        .habits-grid {
          grid-template-columns: repeat(7, minmax(283px, 1fr));
          gap: 28px;
        }
        .habit-card {
          padding: var(--space-lg);
        }
      }
    `,
  ],
})
export class HabitsComponent implements OnInit {
  private readonly db = inject(DbService);

  readonly habits = signal<Habit[]>([]);
  readonly entries = signal<HabitEntry[]>([]);
  protected readonly windowDays = WINDOW_DAYS;

  readonly habitFormModel = signal<HabitFormModel>(createHabitFormDefaults());
  /**
   * The name is what the habit is: an empty one would land in the list as a
   * blank card with nothing to check in on. The Add button is bound to the
   * form's validity, so this is also what keeps it disabled until the name is
   * worth saving.
   */
  readonly habitForm = form(this.habitFormModel, (s) => {
    required(s.name, { message: 'A habit needs a name' });
    validate(s.name, trimmedRequired);
    validate(s.name, noXss);
  });

  /** Shared engine, so these numbers match the Analytics page exactly. */
  private readonly stats = computed(() =>
    buildHabitStats(this.habits(), this.entries(), new Date(), WINDOW_DAYS),
  );

  readonly cards = computed(() => {
    const byId = new Map(this.stats().map((stat) => [stat.id, stat]));
    const todayKey = localDay(new Date());
    const doneToday = new Set(
      this.entries()
        .filter((entry) => dayOfIso(entry.completedAt) === todayKey)
        .map((entry) => entry.habitId),
    );
    return this.habits().map((habit) => ({
      ...habit,
      doneToday: doneToday.has(habit.id),
      stat: byId.get(habit.id) ?? {
        id: habit.id,
        name: habit.name,
        icon: habit.icon,
        completionPercent: 0,
        currentStreak: 0,
        bestStreak: 0,
        totalCompletions: 0,
        days: new Array(WINDOW_DAYS).fill(false) as boolean[],
      },
    }));
  });

  readonly summary = computed(() => {
    const stats = this.stats();
    if (!stats.length) {
      return { tracked: 0, average: 0, bestStreak: 0, checkIns: 0, reading: '' };
    }
    const average = Math.round(
      stats.reduce((sum, stat) => sum + stat.completionPercent, 0) / stats.length,
    );
    const checkIns = stats.reduce((sum, stat) => sum + stat.days.filter(Boolean).length, 0);
    const bestStreak = Math.max(...stats.map((stat) => stat.currentStreak));
    const strongest = stats[0];
    const weakest = stats[stats.length - 1];

    const parts = [
      `You are keeping ${stats.length} habit${stats.length === 1 ? '' : 's'} at ${average}% over the last ${WINDOW_DAYS} days (${checkIns} check-ins).`,
    ];
    if (strongest.completionPercent > 0) {
      parts.push(`${strongest.name} is your anchor habit at ${strongest.completionPercent}%.`);
    }
    if (weakest !== strongest && weakest.completionPercent < 50) {
      parts.push(
        `${weakest.name} sits at ${weakest.completionPercent}% — shrink the target before you lose the streak.`,
      );
    }
    if (bestStreak >= 3) {
      parts.push(`Longest active streak: ${bestStreak} days.`);
    }
    return { tracked: stats.length, average, bestStreak, checkIns, reading: parts.join(' ') };
  });

  /** Used by the template to count completed days in the strip tooltip. */
  protected readonly truthy = (value: boolean): boolean => value;

  async ngOnInit(): Promise<void> {
    await this.db.init();
    await this.loadData();
  }

  private async loadData(): Promise<void> {
    const [habits, entries] = await Promise.all([
      this.db.getHabits(),
      this.db.getAllHabitEntries(),
    ]);
    this.habits.set(habits);
    this.entries.set(entries);
  }

  addHabit(): void {
    submit(this.habitForm, async () => {
      const { name, icon } = this.habitFormModel();
      const habit: Habit = {
        id: crypto.randomUUID(),
        name: name.trim(),
        icon: icon || '✓',
        targetFrequency: 'daily',
        createdAt: new Date().toISOString(),
      };
      await this.db.createHabit(habit);
      this.habitFormModel.set(createHabitFormDefaults());
      await this.loadData();
    });
  }

  async deleteHabit(id: string): Promise<void> {
    await this.db.deleteHabit(id);
    await this.loadData();
  }

  /** Check-in is keyed on the local day, matching the 30-day strip. */
  async toggleToday(habit: { id: string; doneToday: boolean }): Promise<void> {
    const todayKey = localDay(new Date());
    const existing = this.entries().find(
      (entry) => entry.habitId === habit.id && dayOfIso(entry.completedAt) === todayKey,
    );

    if (existing) {
      await this.db.removeHabitEntry(existing.id);
    } else {
      await this.db.addHabitEntry({
        id: crypto.randomUUID(),
        habitId: habit.id,
        completedAt: new Date().toISOString(),
      });
    }
    await this.loadData();
  }
}
