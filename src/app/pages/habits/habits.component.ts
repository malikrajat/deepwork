import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { form, FormField, required, validate, maxLength, submit } from '@angular/forms/signals';
import { DbService } from '../../core/services/db.service';
import { FormFieldWrapperComponent } from '../../shared/components/form-field/form-field-wrapper.component';
import { HabitFormModel, createHabitFormDefaults } from '../../shared/models/form.models';
import { noXss, trimmedRequired } from '../../shared/validators/form-validators';

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

@Component({
  selector: 'app-habits',
  imports: [FormField, FormFieldWrapperComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header animate-fade-in">
      <h1 class="gradient-text page-title">Habits</h1>
      <p class="page-subtitle">Build consistency, one day at a time</p>
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

    <!-- Habits Grid -->
    @if (habits().length > 0) {
      <div class="habits-grid animate-fade-in-delay-1">
        @for (habit of habitsWithStats(); track habit.id) {
          <div class="habit-card" [class.done-today]="habit.doneToday">
            <div class="habit-header">
              <span class="habit-icon">{{ habit.icon }}</span>
              <button class="delete-btn" (click)="deleteHabit(habit.id)">×</button>
            </div>
            <div class="habit-name">{{ habit.name }}</div>
            <div class="habit-streak">
              <span class="streak-fire">🔥</span>
              <span class="streak-count">{{ habit.streak }}</span>
            </div>
            <button class="check-btn" [class.checked]="habit.doneToday" (click)="toggleToday(habit)">
              {{ habit.doneToday ? '✓' : 'Check in' }}
            </button>
            <!-- Mini calendar (last 7 days) -->
            <div class="mini-cal">
              @for (d of habit.lastWeek; track d.date) {
                <span class="cal-dot" [class.filled]="d.done"></span>
              }
            </div>
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
    .page-header { margin-bottom: var(--space-xl); }
    .page-title { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
    .page-subtitle { color: var(--color-text-muted); margin-top: 4px; font-size: 0.85rem; }

    .add-form { display: flex; gap: 8px; margin-bottom: var(--space-xl); }
    .habit-input {
      flex: 1; padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(52,211,153,0.2);
      background: rgba(255,255,255,0.03); color: var(--color-text-primary); font-size: 0.85rem;
    }
    .habit-input:focus { outline: none; border-color: rgba(52,211,153,0.5); }
    .icon-input { width: 44px; text-align: center; padding: 10px; border-radius: 10px; border: 1px solid rgba(52,211,153,0.2); background: rgba(255,255,255,0.03); color: var(--color-text-primary); font-size: 1rem; }
    .btn { cursor: pointer; border: none; border-radius: 10px; font-weight: 600; font-size: 0.8rem; transition: all 0.2s; }
    .btn-primary { padding: 10px 18px; background: linear-gradient(135deg, rgba(52,211,153,0.2), rgba(6,182,212,0.2)); border: 1px solid rgba(52,211,153,0.3); color: var(--color-text-primary); }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(52,211,153,0.2); }
    .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
    .btn-sm { padding: 10px 16px; }

    .habits-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
    .habit-card {
      padding: 16px; border-radius: 16px; text-align: center;
      background: rgba(255,255,255,0.02); backdrop-filter: blur(12px);
      border: 1px solid rgba(52,211,153,0.1); transition: all 0.2s;
    }
    .habit-card.done-today { border-color: rgba(52,211,153,0.35); background: rgba(52,211,153,0.03); }
    .habit-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .habit-icon { font-size: 1.5rem; }
    .delete-btn { background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 1.2rem; opacity: 0.4; transition: opacity 0.2s; }
    .delete-btn:hover { opacity: 1; color: rgb(248,113,113); }
    .habit-name { font-size: 0.85rem; font-weight: 600; margin-bottom: 8px; }
    .habit-streak { display: flex; align-items: center; justify-content: center; gap: 4px; margin-bottom: 12px; }
    .streak-fire { font-size: 0.9rem; }
    .streak-count { font-size: 1.1rem; font-weight: 800; background: linear-gradient(135deg, #fbbf24, #f59e0b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .check-btn {
      width: 100%; padding: 8px; border-radius: 10px; border: 1px solid rgba(52,211,153,0.2);
      background: rgba(52,211,153,0.05); color: var(--color-text-muted); cursor: pointer;
      font-size: 0.75rem; font-weight: 500; transition: all 0.2s;
    }
    .check-btn:hover { border-color: rgba(52,211,153,0.4); background: rgba(52,211,153,0.1); }
    .check-btn.checked { background: rgba(52,211,153,0.2); border-color: rgba(52,211,153,0.5); color: rgb(52,211,153); font-weight: 700; }
    .mini-cal { display: flex; gap: 4px; justify-content: center; margin-top: 10px; }
    .cal-dot { width: 10px; height: 10px; border-radius: 3px; background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.1); }
    .cal-dot.filled { background: rgba(52,211,153,0.5); border-color: rgba(52,211,153,0.6); }

    .empty-state { text-align: center; padding: var(--space-3xl); color: var(--color-text-muted); }
    .empty-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 8px; color: var(--color-text-secondary); }
    .empty-desc { font-size: 0.85rem; }
  `]
})
export class HabitsComponent implements OnInit {
  private db = inject(DbService);

  habits = signal<Habit[]>([]);
  entries = signal<HabitEntry[]>([]);

  readonly habitFormModel = signal<HabitFormModel>(createHabitFormDefaults());
  readonly habitForm = form(this.habitFormModel, (s) => {
    required(s.name, { message: 'Habit name is required' });
    validate(s.name, trimmedRequired);
    validate(s.name, noXss);
    maxLength(s.name, 100, { message: 'Name must be 100 characters or fewer' });
    maxLength(s.icon, 2, { message: 'Icon must be 1-2 characters' });
  });

  habitsWithStats = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    const allEntries = this.entries();
    return this.habits().map(h => {
      const hEntries = allEntries.filter(e => e.habitId === h.id);
      const doneToday = hEntries.some(e => e.completedAt.startsWith(today));
      const streak = this.calcStreak(hEntries);
      const lastWeek = this.getLastWeek(hEntries);
      return { ...h, doneToday, streak, lastWeek, todayEntryId: hEntries.find(e => e.completedAt.startsWith(today))?.id ?? null };
    });
  });

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

  async toggleToday(habit: any): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    if (habit.doneToday && habit.todayEntryId) {
      await this.db.removeHabitEntry(habit.todayEntryId);
    } else {
      await this.db.addHabitEntry({
        id: crypto.randomUUID(),
        habitId: habit.id,
        completedAt: new Date().toISOString(),
      });
    }
    await this.loadData();
  }

  private calcStreak(entries: HabitEntry[]): number {
    const days = new Set(entries.map(e => e.completedAt.slice(0, 10)));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (days.has(key)) { streak++; } else if (i > 0) { break; }
    }
    return streak;
  }

  private getLastWeek(entries: HabitEntry[]): { date: string; done: boolean }[] {
    const days = new Set(entries.map(e => e.completedAt.slice(0, 10)));
    const result: { date: string; done: boolean }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      result.push({ date: key, done: days.has(key) });
    }
    return result;
  }
}
