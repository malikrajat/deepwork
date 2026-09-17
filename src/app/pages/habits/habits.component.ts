import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { form, FormField, submit } from '@angular/forms/signals';
import { DbService } from '../../core/services/db.service';
import { FormFieldWrapperComponent } from '../../shared/components/form-field/form-field-wrapper.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { HabitFormModel, createHabitFormDefaults } from '../../shared/models/form.models';
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
          <div class="stat-pill" appTooltip="Average of every habit's completion rate over the last 30 days">
            <span class="stat-value">{{ summary().average }}%</span>
            <span class="stat-label">30-day consistency</span>
          </div>
          <div class="stat-pill" appTooltip="Your longest running check-in streak right now">
            <span class="stat-value">{{ summary().bestStreak }}d</span>
            <span class="stat-label">best active streak</span>
          </div>
          <div class="stat-pill" appTooltip="Check-ins recorded in the last 30 days across all habits">
            <span class="stat-value">{{ summary().checkIns }}</span>
            <span class="stat-label">check-ins · 30d</span>
          </div>
        </div>
      }
    </div>

    <!-- Add Habit Form -->
    <div class="add-form animate-fade-in-delay-1">
      <app-form-field [fieldState]="habitForm.name()">
        <input type="text" [formField]="habitForm.name" placeholder="New habit name..." class="habit-input" />
      </app-form-field>
      <app-form-field [fieldState]="habitForm.icon()">
        <input type="text" [formField]="habitForm.icon" placeholder="✓" class="icon-input" />
      </app-form-field>
      <button class="btn btn-primary btn-sm" (click)="addHabit()" [disabled]="habitForm().invalid()">Add</button>
    </div>

    @if (summary().tracked) {
      <p class="reading animate-fade-in-delay-1">{{ summary().reading }}</p>
    }

    <!-- Habits Grid -->
    @if (cards().length > 0) {
      <div class="habits-grid animate-fade-in-delay-1">
        @for (habit of cards(); track habit.id) {
          <div class="habit-card" [class.done-today]="habit.doneToday" [class.slipping]="habit.stat.completionPercent < 40">
            <div class="habit-header">
              <span class="habit-icon">{{ habit.icon }}</span>
              <span class="consistency-badge" [class.good]="habit.stat.completionPercent >= 70" [class.mid]="habit.stat.completionPercent >= 40 && habit.stat.completionPercent < 70">
                {{ habit.stat.completionPercent }}%
              </span>
              <button class="delete-btn" (click)="deleteHabit(habit.id)" aria-label="Delete habit">×</button>
            </div>
            <div class="habit-name" [appTooltip]="habit.name">{{ habit.name }}</div>

            <div class="streak-row">
              <span class="streak-fire">🔥</span>
              <span class="streak-count">{{ habit.stat.currentStreak }}</span>
              <span class="streak-label">day streak</span>
              <span class="best-streak" appTooltip="Your longest run for this habit">best {{ habit.stat.bestStreak }}d</span>
            </div>

            <button class="check-btn" [class.checked]="habit.doneToday" (click)="toggleToday(habit)">
              {{ habit.doneToday ? '✓ Done today' : 'Check in' }}
            </button>

            <div class="strip" [appTooltip]="'Last ' + windowDays + ' days · ' + habit.stat.days.filter(truthy).length + ' completed'">
              @for (done of habit.stat.days; track $index) {
                <span class="strip-dot" [class.done]="done" [class.today]="$index === habit.stat.days.length - 1"></span>
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
  styles: [`
    :host { display: block; }
    .page-header {
      margin-bottom: var(--space-lg); display: flex; align-items: flex-start;
      justify-content: space-between; gap: 16px; flex-wrap: wrap;
    }
    .page-title { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
    .page-subtitle { color: var(--color-text-muted); margin-top: 4px; font-size: 0.85rem; }
    .header-stats { display: flex; gap: 8px; flex-wrap: wrap; }
    .stat-pill {
      display: flex; flex-direction: column; align-items: center; padding: 6px 14px;
      border-radius: 12px; background: var(--glass-bg); border: 1px solid var(--glass-border);
    }
    .stat-value { font-size: 0.95rem; font-weight: 800; color: var(--color-text-primary); }
    .stat-label { font-size: 0.56rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }

    .add-form {
      display: flex; align-items: flex-start; gap: 10px; margin-bottom: var(--space-md);
      padding: var(--space-md); border-radius: 14px;
      background: var(--glass-bg); border: 1px solid rgba(139,92,246,0.08);
    }
    .habit-input { flex: 1; min-width: 180px; }
    .icon-input { width: 64px; text-align: center; }
    input {
      background: var(--control-bg); border: 1px solid rgba(139,92,246,0.12);
      border-radius: 10px; padding: 9px 12px; color: var(--color-text-primary); font-size: 0.85rem; outline: none;
    }
    input:focus { border-color: rgba(139,92,246,0.4); }
    .btn { padding: 9px 18px; border-radius: 10px; font-size: 0.8rem; font-weight: 600; cursor: pointer; border: none; }
    .btn-primary { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; }
    .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

    .reading {
      font-size: 0.74rem; line-height: 1.55; color: var(--color-text-secondary);
      padding: 10px 14px; border-radius: 12px; margin-bottom: var(--space-md);
      background: rgba(139,92,246,0.06); border: 1px solid rgba(139,92,246,0.15);
    }

    .habits-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); gap: var(--space-md); }
    .habit-card {
      display: flex; flex-direction: column; gap: 8px; padding: var(--space-md);
      border-radius: 16px; background: var(--glass-bg);
      border: 1px solid rgba(139,92,246,0.1); transition: border-color 0.2s;
    }
    .habit-card.done-today { border-color: rgba(52,211,153,0.35); }
    .habit-card.slipping { border-color: rgba(251,191,36,0.25); }
    .habit-header { display: flex; align-items: center; gap: 8px; }
    .habit-icon { font-size: 1.25rem; }
    .consistency-badge {
      font-size: 0.6rem; font-weight: 700; padding: 2px 8px; border-radius: 999px;
      background: rgba(248,113,113,0.14); color: #fca5a5;
    }
    .consistency-badge.mid { background: rgba(251,191,36,0.14); color: #fbbf24; }
    .consistency-badge.good { background: rgba(52,211,153,0.14); color: #34d399; }
    .delete-btn {
      margin-left: auto; background: none; border: none; color: var(--color-text-muted);
      font-size: 1.1rem; line-height: 1; cursor: pointer; padding: 0 4px;
    }
    .delete-btn:hover { color: #fca5a5; }
    .habit-name {
      font-size: 0.9rem; font-weight: 700; color: var(--color-text-primary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .streak-row { display: flex; align-items: baseline; gap: 5px; }
    .streak-fire { font-size: 0.85rem; }
    .streak-count { font-size: 1.15rem; font-weight: 800; color: var(--color-text-primary); }
    .streak-label { font-size: 0.6rem; color: var(--color-text-muted); }
    .best-streak { margin-left: auto; font-size: 0.6rem; color: var(--color-text-muted); }
    .check-btn {
      padding: 7px; border-radius: 10px; cursor: pointer; font-size: 0.75rem; font-weight: 600;
      background: rgba(139,92,246,0.14); border: 1px solid rgba(139,92,246,0.3); color: var(--color-text-primary);
      transition: all 0.2s;
    }
    .check-btn:hover { background: rgba(139,92,246,0.24); }
    .check-btn.checked { background: rgba(52,211,153,0.16); border-color: rgba(52,211,153,0.4); color: #6ee7b7; }
    .strip { display: flex; gap: 2px; flex-wrap: wrap; margin-top: 2px; }
    .strip-dot { width: 7px; height: 7px; border-radius: 2px; background: rgba(255,255,255,0.07); }
    .strip-dot.done { background: rgba(139,92,246,0.85); }
    .strip-dot.today { box-shadow: 0 0 0 1px rgba(255,255,255,0.35); }
    .strip-labels { display: flex; justify-content: space-between; font-size: 0.54rem; color: var(--color-text-muted); }
    .habit-total { font-size: 0.6rem; color: var(--color-text-muted); }

    .empty-state {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; padding: 60px 0; text-align: center;
    }
    .empty-title { font-size: 1.1rem; font-weight: 700; color: var(--color-text-secondary); }
    .empty-desc { font-size: 0.85rem; color: var(--color-text-muted); }
  `],
})
export class HabitsComponent implements OnInit {
  private readonly db = inject(DbService);

  readonly habits = signal<Habit[]>([]);
  readonly entries = signal<HabitEntry[]>([]);
  protected readonly windowDays = WINDOW_DAYS;

  readonly habitFormModel = signal<HabitFormModel>(createHabitFormDefaults());
  readonly habitForm = form(this.habitFormModel);

  /** Shared engine, so these numbers match the Analytics page exactly. */
  private readonly stats = computed(() =>
    buildHabitStats(this.habits(), this.entries(), new Date(), WINDOW_DAYS)
  );

  readonly cards = computed(() => {
    const byId = new Map(this.stats().map(stat => [stat.id, stat]));
    const todayKey = localDay(new Date());
    const doneToday = new Set(
      this.entries()
        .filter(entry => dayOfIso(entry.completedAt) === todayKey)
        .map(entry => entry.habitId)
    );
    return this.habits().map(habit => ({
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
      stats.reduce((sum, stat) => sum + stat.completionPercent, 0) / stats.length
    );
    const checkIns = stats.reduce(
      (sum, stat) => sum + stat.days.filter(Boolean).length,
      0
    );
    const bestStreak = Math.max(...stats.map(stat => stat.currentStreak));
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
        `${weakest.name} sits at ${weakest.completionPercent}% — shrink the target before you lose the streak.`
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
      entry => entry.habitId === habit.id && dayOfIso(entry.completedAt) === todayKey
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
