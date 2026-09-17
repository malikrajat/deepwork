import { Injectable, computed, inject, signal } from '@angular/core';
import { DbService } from './db.service';
import { TaskService } from './task.service';
import { SettingsService } from './settings.service';
import { Task, TaskQuadrant } from '../models/task.model';
import { QUADRANT_CONFIG } from '../constants/theme.constants';
import { buildDaySchedule } from './schedule.engine';
import { MIN_POMODOROS, MAX_POMODOROS } from '../models/schedule.model';
import {
  DayPlan,
  DaySchedule,
  MinuteOfDay,
  PlacedTask,
  QueuedTask,
  SCHEDULE_DEFAULTS,
  SNAP_MINUTES,
  ScheduleEntry,
  ScheduleItem,
  SchedulePrefs,
} from '../models/schedule.model';
import { QUADRANT_ORDER, addDays, clampMinute, dayKey, weekStart } from './schedule.util';

export {
  QUADRANT_ORDER,
  addDays,
  clampMinute,
  dayKey,
  formatDuration,
  formatMinute,
  parseTimeInput,
  snapMinute,
  weekStart,
} from './schedule.util';

const DAYS_KEY = 'schedule_days';
const PREFS_KEY = 'schedule_prefs';

/**
 * Turns the Eisenhower matrix into a daily timeline.
 *
 * The quadrant board stays authoritative: tasks are queued by quadrant order
 * (Q1 Ã¢â€ â€™ Q4) and then by their position inside that quadrant, and that queue is
 * poured into pomodoro focus blocks with short/long breaks reserved between
 * them. Manual placements (`slotStart`) are honoured as fixed events and the
 * automatic flow is laid out around them, so drag-and-drop on the calendar and
 * reordering in the matrix always describe the same plan.
 *
 * The layout math itself lives in `buildDaySchedule` (pure, no Angular).
 */
@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private readonly db = inject(DbService);
  private readonly taskService = inject(TaskService);
  private readonly settingsService = inject(SettingsService);

  readonly selectedDate = signal<string>(dayKey());
  readonly prefs = signal<SchedulePrefs>({ ...SCHEDULE_DEFAULTS });

  private readonly plans = signal<Record<string, DayPlan>>({});
  private loaded = false;

  // Ã¢â€â‚¬Ã¢â€â‚¬ Pomodoro configuration (shared with the timer) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  readonly focusMinutes = computed(() =>
    Math.max(1, Math.round(this.settingsService.settings().workDuration / 60))
  );
  readonly shortBreakMinutes = computed(() =>
    Math.max(1, Math.round(this.settingsService.settings().shortBreak / 60))
  );
  readonly longBreakMinutes = computed(() =>
    Math.max(1, Math.round(this.settingsService.settings().longBreak / 60))
  );
  readonly pomodorosBeforeLongBreak = computed(() =>
    Math.max(1, this.settingsService.settings().sessionsBeforeLongBreak)
  );

  // Ã¢â€â‚¬Ã¢â€â‚¬ Plan state Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  readonly queue = computed(() => this.buildQueue(this.selectedDate(), this.plans()));

  /** Queue for the real today Ã¢â‚¬â€ what the Eisenhower matrix reorders. */
  readonly todayQueue = computed(() => this.buildQueue(dayKey(), this.plans()));

  readonly schedule = computed(() =>
    this.buildSchedule(this.buildScheduleItems(this.selectedDate()), this.prefs())
  );

  readonly unassigned = computed(() => {
    const date = this.selectedDate();
    const entries = this.entryIndex(this.plans()[date]);
    return this.dayTasks(date, entries)
      .filter(task => task.quadrant === null)
      .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
  });

  /** Task ids that currently sit on the timeline, in visual order. */
  readonly scheduledTaskIds = computed(() => {
    const placements = [...this.schedule().placements].sort((a, b) => a.startMin - b.startMin);
    return placements.map(p => p.taskId);
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ Loading Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const [days, prefs] = await Promise.all([
      this.db.getAppState<Record<string, DayPlan>>(DAYS_KEY, {}),
      this.db.getAppState<SchedulePrefs | null>(PREFS_KEY, null),
    ]);
    this.plans.set(days && typeof days === 'object' ? days : {});
    if (prefs) {
      this.prefs.set({
        dayStart: clampMinute(prefs.dayStart ?? SCHEDULE_DEFAULTS.dayStart),
        dayEnd: clampMinute(prefs.dayEnd ?? SCHEDULE_DEFAULTS.dayEnd),
      });
    }
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Queries used by the matrix page Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  /** Tasks of a quadrant in plan order (today's plan). */
  tasksInQuadrant(quadrant: TaskQuadrant, date: string = dayKey()): Task[] {
    return this.buildQueue(date, this.plans())
      .filter(item => item.quadrant === quadrant)
      .map(item => item.task);
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Mutations Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  /** Place (or move) a task on the timeline at a given minute. */
  async pinTask(taskId: string, startMin: MinuteOfDay, pomodoros?: number): Promise<void> {
    const date = this.selectedDate();
    const entries = this.entryIndex(this.plans()[date]);
    const existing = entries.get(taskId);
    entries.set(taskId, {
      taskId,
      order: existing?.order ?? this.appendOrder(taskId, date),
      slotStart: clampMinute(startMin),
      pomodoros: pomodoros ?? existing?.pomodoros ?? null,
    });
    await this.writePlan(date, [...entries.values()]);
  }

  /** Return a task to the automatic flow. */
  async unpinTask(taskId: string): Promise<void> {
    const date = this.selectedDate();
    const entries = this.entryIndex(this.plans()[date]);
    const existing = entries.get(taskId);
    if (!existing || existing.slotStart === null) return;
    entries.set(taskId, { ...existing, slotStart: null });
    await this.writePlan(date, [...entries.values()]);
  }

  async togglePin(taskId: string): Promise<void> {
    const placement = this.placementOf(taskId);
    if (placement?.pinned) {
      await this.unpinTask(taskId);
    } else {
      await this.pinTask(taskId, placement?.startMin ?? this.prefs().dayStart);
    }
  }

  /** Reserve a different number of pomodoro blocks for a task. */
  async setPomodoros(taskId: string, pomodoros: number): Promise<void> {
    const date = this.selectedDate();
    const entries = this.entryIndex(this.plans()[date]);
    const existing = entries.get(taskId);
    const next = Math.max(MIN_POMODOROS, Math.min(MAX_POMODOROS, Math.round(pomodoros)));
    entries.set(taskId, {
      taskId,
      order: existing?.order ?? this.appendOrder(taskId, date),
      slotStart: existing?.slotStart ?? null,
      pomodoros: next,
    });
    await this.writePlan(date, [...entries.values()]);
  }

  /** Take a task off the timeline without touching its quadrant. */
  async removeFromSlot(taskId: string): Promise<void> {
    const date = this.selectedDate();
    const entries = this.entryIndex(this.plans()[date]);
    const existing = entries.get(taskId);
    entries.set(taskId, {
      taskId,
      order: existing?.order ?? this.appendOrder(taskId, date),
      slotStart: null,
      pomodoros: existing?.pomodoros ?? null,
    });
    await this.writePlan(date, [...entries.values()]);
  }

  /** Move a placed task by a number of minutes (keyboard / button nudging). */
  async nudgeTask(taskId: string, deltaMinutes: number): Promise<void> {
    const placement = this.placementOf(taskId);
    const from = placement?.startMin ?? this.prefs().dayStart;
    await this.pinTask(taskId, from + deltaMinutes);
  }

  /** Drop every manual placement and fall back to the pure queue order. */
  async clearPins(): Promise<void> {
    const date = this.selectedDate();
    const entries = this.entryIndex(this.plans()[date]);
    if (![...entries.values()].some(entry => entry.slotStart !== null)) return;
    for (const [id, entry] of entries) {
      entries.set(id, { ...entry, slotStart: null });
    }
    await this.writePlan(date, [...entries.values()]);
  }

  /**
   * Mirror a visual timeline order back onto the quadrant sequence.
   *
   * Called after a drag on the calendar: tasks keep their quadrant, but the
   * order they appear inside that quadrant follows the new timeline order, so
   * the Eisenhower matrix immediately reflects what the calendar shows.
   */
  async applySequence(orderedIds: string[]): Promise<void> {
    const date = this.selectedDate();
    const entries = this.entryIndex(this.plans()[date]);
    const perQuadrant = this.quadrantIdLists(date, '');
    const sequenced = new Set(orderedIds);

    for (const quadrant of QUADRANT_ORDER) {
      perQuadrant[quadrant] = perQuadrant[quadrant].filter(id => !sequenced.has(id));
    }
    for (const id of orderedIds) {
      const task = this.findTask(id);
      if (!task?.quadrant) continue;
      perQuadrant[task.quadrant].push(id);
    }

    const next: ScheduleEntry[] = [];
    const seen = new Set<string>();

    for (const quadrant of QUADRANT_ORDER) {
      perQuadrant[quadrant].forEach((id, position) => {
        const existing = entries.get(id);
        seen.add(id);
        next.push({
          taskId: id,
          order: position + 1,
          slotStart: existing?.slotStart ?? null,
          pomodoros: existing?.pomodoros ?? null,
        });
      });
    }

    for (const [id, entry] of entries) {
      if (seen.has(id)) continue;
      const task = this.findTask(id);
      if (!task || task.status === 'done') continue;
      next.push(entry);
    }

    await this.writePlan(date, next);
  }

  /**
   * Move a task to a quadrant at a given position. Used by both the matrix
   * (drag between columns) and the calendar (dragging a block re-sequences it).
   */
  async moveTaskToQuadrant(
    taskId: string,
    quadrant: TaskQuadrant | null,
    index: number,
    date: string = this.selectedDate()
  ): Promise<void> {
    const task = this.findTask(taskId);
    if (!task) return;

    if (quadrant === null) {
      await this.taskService.setQuadrant(taskId, null);
      return;
    }

    if (task.quadrant !== quadrant) {
      await this.taskService.setQuadrant(taskId, quadrant);
    }

    const perQuadrant = this.quadrantIdLists(date, taskId);
    const target = perQuadrant[quadrant];
    const at = Math.max(0, Math.min(Math.round(index), target.length));
    target.splice(at, 0, taskId);

    const entries = this.entryIndex(this.plans()[date]);
    const next: ScheduleEntry[] = [];
    const seen = new Set<string>();

    for (const q of QUADRANT_ORDER) {
      perQuadrant[q].forEach((id, position) => {
        const existing = entries.get(id);
        seen.add(id);
        next.push({
          taskId: id,
          order: position + 1,
          slotStart: existing?.slotStart ?? null,
          pomodoros: existing?.pomodoros ?? null,
        });
      });
    }

    // Keep placements for tasks that are not part of the quadrant queue
    // (for example a task without a quadrant that was pinned by hand).
    for (const [id, entry] of entries) {
      if (seen.has(id)) continue;
      const other = this.findTask(id);
      if (!other || other.status === 'done') continue;
      next.push(entry);
    }

    await this.writePlan(date, next);
  }

  async setPrefs(patch: Partial<SchedulePrefs>): Promise<void> {
    const current = this.prefs();
    const dayStart = clampMinute(patch.dayStart ?? current.dayStart);
    const dayEnd = clampMinute(patch.dayEnd ?? current.dayEnd);
    const next: SchedulePrefs = {
      dayStart,
      dayEnd: Math.max(dayEnd, dayStart + 60),
    };
    this.prefs.set(next);
    await this.db.setAppState(PREFS_KEY, next);
  }

  /** Extend the visible day until every queued task fits. */
  async fitDayToTasks(): Promise<void> {
    const { dayStart } = this.prefs();
    const stretch = this.buildSchedule(this.buildScheduleItems(this.selectedDate()), {
      dayStart,
      dayEnd: 24 * 60 - SNAP_MINUTES,
    });
    const lastEnd = stretch.blocks.reduce((max, block) => Math.max(max, block.endMin), dayStart);
    const rounded = Math.ceil((lastEnd + 15) / 15) * 15;
    await this.setPrefs({ dayEnd: Math.max(rounded, dayStart + 60) });
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Derived helpers for the UI Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  placementOf(taskId: string): PlacedTask | undefined {
    return this.schedule().placements.find(placement => placement.taskId === taskId);
  }

  /** Reserved pomodoros for a task on the selected day. */
  pomodorosOf(taskId: string): number {
    const entry = this.entryIndex(this.plans()[this.selectedDate()]).get(taskId);
    return Math.max(MIN_POMODOROS, Math.min(MAX_POMODOROS, Math.round(entry?.pomodoros ?? MIN_POMODOROS)));
  }

  /** Lightweight per-day summary used by the week strip. */
  summaryFor(date: string): { tasks: number; focusMinutes: number; breaks: number } {
    const schedule = this.buildSchedule(this.buildScheduleItems(date), this.prefs());
    return {
      tasks: schedule.placements.length,
      focusMinutes: schedule.totals.focusMinutes,
      breaks: schedule.totals.breaks,
    };
  }

  /**
   * Full layout for any day without touching the selected date — used by the
   * calendar reminders, which always follow the real today.
   */
  scheduleFor(date: string): DaySchedule {
    return this.buildSchedule(this.buildScheduleItems(date), this.prefs());
  }

  weekDates(around: string = this.selectedDate()): string[] {
    const start = weekStart(around);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Internal: queue building Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  private findTask(taskId: string): Task | undefined {
    return this.taskService.tasks().find(task => task.id === taskId);
  }

  private entryIndex(plan?: DayPlan): Map<string, ScheduleEntry> {
    return new Map((plan?.entries ?? []).map(entry => [entry.taskId, { ...entry }]));
  }

  private dayTasks(date: string, entries: Map<string, ScheduleEntry>): Task[] {
    return this.taskService.tasks().filter(task => {
      if (task.status === 'done') return false;
      if (entries.has(task.id)) return true;
      if (task.deadline === date) return true;
      return task.createdAt.startsWith(date);
    });
  }

  private buildQueue(date: string, plans: Record<string, DayPlan>): QueuedTask[] {
    const entries = this.entryIndex(plans[date]);
    const assigned = this.dayTasks(date, entries).filter(task => task.quadrant !== null);

    assigned.sort((a, b) => {
      const qa = QUADRANT_CONFIG[a.quadrant as TaskQuadrant]?.sortOrder ?? 99;
      const qb = QUADRANT_CONFIG[b.quadrant as TaskQuadrant]?.sortOrder ?? 99;
      if (qa !== qb) return qa - qb;

      const oa = entries.get(a.id)?.order ?? Number.MAX_SAFE_INTEGER;
      const ob = entries.get(b.id)?.order ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;

      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.createdAt.localeCompare(b.createdAt);
    });

    return assigned.map((task, index) => ({
      task,
      quadrant: task.quadrant as TaskQuadrant,
      entry: entries.get(task.id) ?? null,
      index,
    }));
  }

  /**
   * Everything that belongs on the timeline for a day: the quadrant queue plus
   * any task without a quadrant that was dropped on the calendar by hand.
   */
  private buildScheduleItems(date: string): ScheduleItem[] {
    const entries = this.entryIndex(this.plans()[date]);
    const queue = this.buildQueue(date, this.plans());

    const extras = this.dayTasks(date, entries)
      .filter(task => task.quadrant === null)
      .map(task => ({ task, entry: entries.get(task.id) ?? null }))
      .filter((item): item is { task: Task; entry: ScheduleEntry } =>
        !!item.entry && item.entry.slotStart !== null
      )
      .sort((a, b) => a.task.priority - b.task.priority || a.task.createdAt.localeCompare(b.task.createdAt))
      .map((item, position) => ({
        task: item.task,
        quadrant: null,
        entry: item.entry,
        index: queue.length + position,
      }));

    return [...queue, ...extras];
  }

  private quadrantIdLists(date: string, excludeId: string): Record<TaskQuadrant, string[]> {
    const lists = {
      'urgent-important': [],
      important: [],
      urgent: [],
      neither: [],
    } as Record<TaskQuadrant, string[]>;
    for (const item of this.buildQueue(date, this.plans())) {
      if (item.task.id === excludeId) continue;
      lists[item.quadrant].push(item.task.id);
    }
    return lists;
  }

  private appendOrder(taskId: string, date: string): number {
    const task = this.findTask(taskId);
    const quadrant = task?.quadrant;
    if (!quadrant) return 1;
    const ids = this.quadrantIdLists(date, taskId)[quadrant];
    return ids.length + 1;
  }

  private async writePlan(date: string, entries: ScheduleEntry[]): Promise<void> {
    const sorted = [...entries].sort((a, b) => a.order - b.order || a.taskId.localeCompare(b.taskId));
    const plans = { ...this.plans() };
    if (sorted.length === 0) {
      delete plans[date];
    } else {
      plans[date] = { date, entries: sorted };
    }
    this.plans.set(plans);
    await this.db.setAppState(DAYS_KEY, plans);
  }

  /** Layout a day with the pomodoro settings the timer uses. */
  private buildSchedule(items: ScheduleItem[], prefs: SchedulePrefs): DaySchedule {
    return buildDaySchedule(items, prefs, {
      focusMinutes: this.focusMinutes(),
      shortBreakMinutes: this.shortBreakMinutes(),
      longBreakMinutes: this.longBreakMinutes(),
      pomodorosBeforeLongBreak: this.pomodorosBeforeLongBreak(),
    });
  }
}
