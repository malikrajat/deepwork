import { Injectable, inject, signal, computed } from '@angular/core';
import { DbService } from './db.service';
import { SettingsService } from './settings.service';
import {
  Task,
  TaskQuadrant,
  TaskStatus,
  RecurrenceConfig,
  normalizeTaskTitle,
} from '../models/task.model';
import { QUADRANT_CONFIG, STATUS_CYCLE } from '../constants/theme.constants';
import { isPinnedToToday, localDayKey, taskDayKey, writtenDayKey } from '../utils/task-day.util';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly db = inject(DbService);
  private readonly settings = inject(SettingsService);

  readonly tasks = signal<Task[]>([]);
  private static readonly QUADRANT_PRIORITY: Record<string, number> = Object.fromEntries(
    Object.entries(QUADRANT_CONFIG).map(([key, cfg]) => [key, cfg.sortOrder]),
  );

  /**
   * Whether a task belongs on today's list — the one rule every "today" surface
   * reads.
   *
   * A task's own date decides where it lives: its deadline when it has one, the
   * day it was written when it has not. In practice:
   *
   * - A deadline **in the future** takes the task off today. This is the rule an
   *   import needs: a sheet dated for tomorrow is tomorrow's work, and putting
   *   every row on today because the file happened to be opened today throws away
   *   the date the user typed. The task is not lost — the Tasks page files it
   *   under its own day, and that section is opened for it.
   * - A task that is **overdue** stays. It is still on the user's plate, and
   *   today's board is where a slipping task should keep showing up.
   * - **Add to Today** (`todayOrder`) always wins, because it is the user saying
   *   so by hand — but only for the day it was said on. See
   *   {@link isPinnedToToday}: a star from yesterday is not today's.
   */
  private static isOnToday(task: Task, today: string): boolean {
    if (isPinnedToToday(task, today)) return true;
    return TaskService.datedToday(task, today);
  }

  /**
   * Whether the task's *own* date puts it on today, before "Add to Today" is
   * read.
   *
   * The two questions are asked separately because they answer differently when
   * the same work exists twice — see {@link withoutRepeats}.
   */
  private static datedToday(task: Task, today: string): boolean {
    const deadline = task.deadline?.slice(0, 10) ?? '';
    if (deadline !== '' && deadline > today) return false;
    return deadline === today || writtenDayKey(task) === today;
  }

  /**
   * One card per piece of work.
   *
   * The same task arriving twice is normal here, not an accident: a sheet
   * carrying yesterday's work again today is imported as a second row (the
   * importer labels it Duplicate and writes it anyway), and a task that was
   * added to Today once keeps the star that says so. Both rows are then on the
   * day's list — one dated yesterday, one dated today — and the board showed the
   * same title twice, as two cards the user has to read to tell apart.
   *
   * The copy whose *own date* is today wins, because that is the one the user
   * just wrote down and the one whose status is current; an older copy that is
   * only on the list because it was starred stays where it is (the Tasks page
   * files it under its own day), it simply does not get a second card here.
   * Titles are compared the way the importer compares them, so trailing spaces
   * and capitalisation do not smuggle a duplicate through.
   */
  private static withoutRepeats(tasks: Task[], today: string): Task[] {
    // A stable sort, so equally-dated copies keep the day's own order and the
    // first of them is the one kept.
    const byDate = [...tasks].sort(
      (a, b) => Number(TaskService.datedToday(b, today)) - Number(TaskService.datedToday(a, today)),
    );

    const seen = new Set<string>();
    const kept: Task[] = [];
    for (const task of byDate) {
      const key = normalizeTaskTitle(task.title).toLowerCase();
      // A missing title cannot be a duplicate of anything.
      if (!key) {
        kept.push(task);
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(task);
    }
    return kept;
  }

  /**
   * Every task on the day's list, one card per piece of work.
   *
   * The single door every "today" surface comes through — the dashboard's
   * counter, the timer's task picker, the Today board and the matrix rails — so
   * none of them can disagree about what today holds.
   */
  private todaysTasks(today: string): Task[] {
    return TaskService.withoutRepeats(
      this.tasks().filter((task) => TaskService.isOnToday(task, today)),
      today,
    );
  }

  readonly todayTasks = computed(() => {
    const today = localDayKey();
    return this.todayOrdered(this.todaysTasks(today).filter((t) => t.status !== 'done'));
  });

  /**
   * The Today board lists today's tasks in *every* status — Done included, so a
   * card dragged into the Done column stays there (and can be dragged back out)
   * instead of disappearing. `todayTasks()` keeps its "open work only" meaning
   * for the dashboard and the timer.
   */
  readonly todayBoardTasks = computed(() => {
    const today = localDayKey();
    return this.todayOrdered(this.todaysTasks(today));
  });

  /** Daily sequence: quadrant priority first, then the order the user dragged. */
  private todayOrdered(tasks: Task[]): Task[] {
    return [...tasks].sort((a, b) => {
      const qa = TaskService.QUADRANT_PRIORITY[a.quadrant ?? ''] ?? 99;
      const qb = TaskService.QUADRANT_PRIORITY[b.quadrant ?? ''] ?? 99;
      if (qa !== qb) return qa - qb;
      return (a.todayOrder ?? 999) - (b.todayOrder ?? 999);
    });
  }

  async loadTasks(): Promise<void> {
    const all = await this.db.getTasks();
    this.tasks.set(all);
  }

  async createTask(data: Partial<Task> & { title: string }): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      title: normalizeTaskTitle(data.title),
      description: data.description ?? '',
      priority: data.priority ?? 3,
      status: data.status ?? 'todo',
      quadrant: data.quadrant ?? null,
      deadline: data.deadline ?? null,
      tags: data.tags ?? [],
      recurrence: data.recurrence ?? null,
      todayOrder: data.todayOrder ?? null,
      // A star created without a day cannot mean today, so it is stamped with
      // the day it is written on.
      todayOrderDate: data.todayOrder != null ? (data.todayOrderDate ?? localDayKey()) : null,
      createdAt: now,
      completedAt: null,
      updatedAt: now,
    };
    await this.db.createTask(task);
    this.tasks.update((list) => [task, ...list]);
    return task;
  }

  /** Every user-visible change stamps the task, which drives the Tasks list order. */
  async updateTask(task: Task): Promise<void> {
    const normalized: Task = {
      ...task,
      title: normalizeTaskTitle(task.title),
      updatedAt: new Date().toISOString(),
    };
    await this.db.updateTask(normalized);
    this.tasks.update((list) => list.map((t) => (t.id === normalized.id ? normalized : t)));
  }

  /**
   * Bookkeeping write that must not count as user activity — the automatic
   * daily reset would otherwise push every old task into today's group.
   */
  private async updateTaskQuietly(task: Task): Promise<void> {
    await this.db.updateTask(task);
    this.tasks.update((list) => list.map((t) => (t.id === task.id ? task : t)));
  }

  async deleteTask(id: string): Promise<void> {
    await this.db.deleteTask(id);
    this.tasks.update((list) => list.filter((t) => t.id !== id));
  }

  async toggleStatus(task: Task): Promise<void> {
    const nextIdx = (STATUS_CYCLE.indexOf(task.status) + 1) % STATUS_CYCLE.length;
    await this.setStatus(task, STATUS_CYCLE[nextIdx]);
  }

  /**
   * Move a task straight to a status — what the board's drag & drop (and its
   * 1/2/3 keyboard shortcuts) writes. Unlike {@link toggleStatus} it does not
   * care where the task was, so a card can be dropped in any column.
   */
  async setStatus(task: Task, status: TaskStatus): Promise<void> {
    if (task.status === status) return;
    await this.updateTask({
      ...task,
      status,
      completedAt: status === 'done' ? new Date().toISOString() : null,
    });
  }

  async setQuadrant(taskId: string, quadrant: TaskQuadrant | null): Promise<void> {
    const task = this.tasks().find((t) => t.id === taskId);
    if (!task) return;
    await this.updateTask({ ...task, quadrant });
  }

  async addToToday(taskId: string): Promise<void> {
    const task = this.tasks().find((t) => t.id === taskId);
    if (!task) return;
    const today = localDayKey();
    // A star left from an earlier day does not count as "already there": this
    // click is today's instruction, and it replaces yesterday's position.
    if (isPinnedToToday(task, today)) return;
    const maxOrder = Math.max(0, ...this.todayTasks().map((t) => t.todayOrder ?? 0));
    await this.updateTask({ ...task, todayOrder: maxOrder + 1, todayOrderDate: today });
  }

  async removeFromToday(taskId: string): Promise<void> {
    const task = this.tasks().find((t) => t.id === taskId);
    if (!task) return;
    await this.updateTask({ ...task, todayOrder: null, todayOrderDate: null });
  }

  async reorderToday(reorderedIds: string[]): Promise<void> {
    const today = localDayKey();
    const updates = reorderedIds
      .map((id, idx) => {
        const task = this.tasks().find((t) => t.id === id);
        return task ? { ...task, todayOrder: idx + 1, todayOrderDate: today } : null;
      })
      .filter(Boolean) as Task[];

    for (const task of updates) {
      await this.db.updateTask(task);
    }
    this.tasks.update((list) =>
      list.map((t) => {
        const upd = updates.find((u) => u.id === t.id);
        return upd ?? t;
      }),
    );
  }

  async searchTasks(query: string): Promise<Task[]> {
    if (!query.trim()) return this.tasks();
    return this.db.searchTasks(query);
  }

  getTasksByQuadrant(quadrant: TaskQuadrant): Task[] {
    const today = localDayKey();
    return this.todaysTasks(today).filter((t) => t.quadrant === quadrant && t.status !== 'done');
  }

  getUnassignedTasks(): Task[] {
    const today = localDayKey();
    return this.todaysTasks(today).filter((t) => t.quadrant === null && t.status !== 'done');
  }

  // ==================== DAILY RESET ====================

  /**
   * The day's housekeeping, in the order the day asks for it.
   *
   * Every page that can be opened first thing in the morning runs this instead
   * of picking its own subset — see `dailyReset` and `generateRecurringInstances`
   * for what each step is for, and `closeExpiredTasks` for the one that only
   * fires when the user has turned carry-forward off.
   */
  async runDailyUpkeep(): Promise<void> {
    // A star belongs to the day it was set on, so yesterday's go first: they are
    // no longer today's work, and none of the steps below should read them as if
    // they were.
    await this.expireTodayPins();
    // Closing comes next: a task that expired overnight must not be swept into
    // today's quadrant question by the reset below, or have a recurring instance
    // generated from it.
    await this.closeExpiredTasks();
    await this.dailyReset();
    await this.generateRecurringInstances();
  }

  /**
   * Clears "Add to Today" stars that belonged to an earlier day.
   *
   * The star is a one-day instruction (see `isPinnedToToday`), so a row carrying
   * one from an earlier day — or, from an older build, one with no day at all —
   * is a claim the app no longer honours. The write is quiet and bulk-written by
   * the database, because this is housekeeping applied to a whole backlog at
   * once, not the user touching each task.
   *
   * Returns how many stars were cleared, which is what the tests read.
   */
  async expireTodayPins(): Promise<number> {
    const today = localDayKey();
    const stale = this.tasks().filter(
      (task) => task.todayOrder !== null && !isPinnedToToday(task, today),
    );
    if (!stale.length) return 0;

    await this.db.clearStaleTodayPins(today);
    this.tasks.update((list) =>
      list.map((task) =>
        task.todayOrder !== null && !isPinnedToToday(task, today)
          ? { ...task, todayOrder: null, todayOrderDate: null }
          : task,
      ),
    );
    return stale.length;
  }

  /**
   * Closes work whose day has passed, when the user has asked for that.
   *
   * With "Carry forward unfinished tasks" on (the default) this does nothing at
   * all: an unfinished task is the user's own business, and the app has no
   * business closing it behind their back.
   *
   * With it off, every task that is still open and whose *own day* is behind us
   * is marked Done. A task's own day is its deadline when it has one, and the
   * day it was written when it has not — the same day the Tasks page files it
   * under and the one `datedToday` reads, so a task cannot be "finished" on the
   * board and still sit in yesterday's section.
   *
   * The write is deliberately quiet (see {@link updateTaskQuietly}): a task
   * closed by the calendar should not read as one the user just touched, and a
   * backlog of forty closing at once would otherwise swamp the list's
   * "last activity" ordering. `completedAt` is what records the moment it
   * happened, and the task's own day is untouched — only its status moves.
   * Returns how many tasks were closed, which is what the tests read and what a
   * caller that wanted to tell the user could count.
   */
  async closeExpiredTasks(): Promise<number> {
    if (this.settings.settings().carryForwardTasks) return 0;

    const now = new Date().toISOString();
    const today = localDayKey();
    const expired = this.tasks().filter(
      (task) => task.status !== 'done' && TaskService.ownDay(task) < today,
    );

    for (const task of expired) {
      await this.updateTaskQuietly({ ...task, status: 'done', completedAt: now });
    }
    return expired.length;
  }

  /**
   * The day a task is *for*: its deadline when it has one, the day it was
   * written when it has not.
   *
   * A task with a deadline that cannot be read as a day falls back to the day it
   * was written rather than being treated as expired on the spot.
   */
  private static ownDay(task: Task): string {
    return taskDayKey(task);
  }

  /**
   * Resets quadrant assignments from previous days.
   * Any task that was assigned to a quadrant on a previous day but not completed
   * gets its quadrant cleared, so the user must re-prioritize daily.
   */
  async dailyReset(): Promise<void> {
    const today = localDayKey();
    const allTasks = this.tasks();

    const tasksToReset = allTasks.filter((t) => {
      const writtenToday = writtenDayKey(t) === today;
      return (
        t.quadrant !== null &&
        t.status !== 'done' &&
        !t.deadline?.startsWith(today) &&
        !writtenToday
      );
    });

    for (const task of tasksToReset) {
      // Clearing yesterday's quadrant is housekeeping, not activity.
      await this.updateTaskQuietly({ ...task, quadrant: null });
    }
  }

  // ==================== RECURRING TASKS ====================

  /**
   * Generates today's instances for recurring tasks.
   * Only generates for today (not past missed days).
   * A recurring task acts as a template — instances are new tasks linked by title prefix.
   */
  async generateRecurringInstances(): Promise<void> {
    const today = new Date();
    const todayStr = localDayKey(today);
    const allTasks = this.tasks();

    // Find template tasks with recurrence configured
    const templates = allTasks.filter(
      (t): t is Task & { recurrence: RecurrenceConfig } =>
        t.recurrence !== null && t.status !== 'done',
    );

    for (const template of templates) {
      if (!this.shouldGenerateToday(template.recurrence, today)) continue;

      // Check if instance already exists for today
      const instanceExists = allTasks.some(
        (t) => t.title === template.title && t.id !== template.id && writtenDayKey(t) === todayStr,
      );
      if (instanceExists) continue;

      // Check end date
      if (template.recurrence.endDate && template.recurrence.endDate < todayStr) continue;

      // Create today's instance
      await this.createTask({
        title: template.title,
        description: template.description,
        priority: template.priority,
        deadline: todayStr,
        quadrant: null,
        tags: [...template.tags, 'recurring'],
        todayOrder: null,
      });
    }
  }

  private shouldGenerateToday(config: RecurrenceConfig, today: Date): boolean {
    const dayOfWeek = today.getDay(); // 0=Sun
    const dayOfMonth = today.getDate();

    switch (config.frequency) {
      case 'daily':
        return true;
      case 'weekly':
        // If days specified, check if today is one of those days
        if (config.days && config.days.length > 0) {
          return config.days.includes(dayOfWeek);
        }
        // Default: every N weeks on the same day (always fire)
        return true;
      case 'monthly':
        // If days specified, use as days-of-month
        if (config.days && config.days.length > 0) {
          return config.days.includes(dayOfMonth);
        }
        // Default: 1st of month
        return dayOfMonth === 1;
      default:
        return false;
    }
  }
}
