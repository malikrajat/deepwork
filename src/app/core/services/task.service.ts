import { Injectable, inject, signal, computed } from '@angular/core';
import { DbService } from './db.service';
import { Task, TaskQuadrant, RecurrenceConfig } from '../models/task.model';
import { QUADRANT_CONFIG, STATUS_CYCLE } from '../constants/theme.constants';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly db = inject(DbService);

  readonly tasks = signal<Task[]>([]);
  private static readonly QUADRANT_PRIORITY: Record<string, number> = Object.fromEntries(
    Object.entries(QUADRANT_CONFIG).map(([key, cfg]) => [key, cfg.sortOrder])
  );

  readonly todayTasks = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return this.tasks()
      .filter(t => t.deadline === today || t.createdAt.startsWith(today))
      .filter(t => t.status !== 'done')
      .sort((a, b) => {
        const qa = TaskService.QUADRANT_PRIORITY[a.quadrant ?? ''] ?? 99;
        const qb = TaskService.QUADRANT_PRIORITY[b.quadrant ?? ''] ?? 99;
        if (qa !== qb) return qa - qb;
        return (a.todayOrder ?? 999) - (b.todayOrder ?? 999);
      });
  });

  async loadTasks(): Promise<void> {
    const all = await this.db.getTasks();
    this.tasks.set(all);
  }

  async createTask(data: Partial<Task> & { title: string }): Promise<Task> {
    const task: Task = {
      id: crypto.randomUUID(),
      title: data.title,
      description: data.description ?? '',
      priority: data.priority ?? 3,
      status: data.status ?? 'todo',
      quadrant: data.quadrant ?? null,
      deadline: data.deadline ?? null,
      tags: data.tags ?? [],
      recurrence: data.recurrence ?? null,
      todayOrder: data.todayOrder ?? null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    await this.db.createTask(task);
    this.tasks.update(list => [task, ...list]);
    return task;
  }

  async updateTask(task: Task): Promise<void> {
    await this.db.updateTask(task);
    this.tasks.update(list => list.map(t => t.id === task.id ? task : t));
  }

  async deleteTask(id: string): Promise<void> {
    await this.db.deleteTask(id);
    this.tasks.update(list => list.filter(t => t.id !== id));
  }

  async toggleStatus(task: Task): Promise<void> {
    const nextIdx = (STATUS_CYCLE.indexOf(task.status) + 1) % STATUS_CYCLE.length;
    const updated: Task = {
      ...task,
      status: STATUS_CYCLE[nextIdx],
      completedAt: STATUS_CYCLE[nextIdx] === 'done' ? new Date().toISOString() : null,
    };
    await this.updateTask(updated);
  }

  async setQuadrant(taskId: string, quadrant: TaskQuadrant | null): Promise<void> {
    const task = this.tasks().find(t => t.id === taskId);
    if (!task) return;
    await this.updateTask({ ...task, quadrant });
  }

  async addToToday(taskId: string): Promise<void> {
    const task = this.tasks().find(t => t.id === taskId);
    if (!task) return;
    if (task.todayOrder !== null) return;
    const maxOrder = Math.max(0, ...this.todayTasks().map(t => t.todayOrder ?? 0));
    await this.updateTask({ ...task, todayOrder: maxOrder + 1 });
  }

  async removeFromToday(taskId: string): Promise<void> {
    const task = this.tasks().find(t => t.id === taskId);
    if (!task) return;
    await this.updateTask({ ...task, todayOrder: null });
  }

  async reorderToday(reorderedIds: string[]): Promise<void> {
    const updates = reorderedIds.map((id, idx) => {
      const task = this.tasks().find(t => t.id === id);
      return task ? { ...task, todayOrder: idx + 1 } : null;
    }).filter(Boolean) as Task[];

    for (const task of updates) {
      await this.db.updateTask(task);
    }
    this.tasks.update(list =>
      list.map(t => {
        const upd = updates.find(u => u.id === t.id);
        return upd ?? t;
      })
    );
  }

  async searchTasks(query: string): Promise<Task[]> {
    if (!query.trim()) return this.tasks();
    return this.db.searchTasks(query);
  }

  getTasksByQuadrant(quadrant: TaskQuadrant): Task[] {
    const today = new Date().toISOString().slice(0, 10);
    return this.tasks().filter(t =>
      t.quadrant === quadrant &&
      t.status !== 'done' &&
      (t.deadline === today || t.createdAt.startsWith(today))
    );
  }

  getUnassignedTasks(): Task[] {
    const today = new Date().toISOString().slice(0, 10);
    return this.tasks().filter(t =>
      t.quadrant === null &&
      t.status !== 'done' &&
      (t.deadline === today || t.createdAt.startsWith(today))
    );
  }

  // ==================== DAILY RESET ====================

  /**
   * Resets quadrant assignments from previous days.
   * Any task that was assigned to a quadrant on a previous day but not completed
   * gets its quadrant cleared, so the user must re-prioritize daily.
   */
  async dailyReset(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const allTasks = this.tasks();

    const tasksToReset = allTasks.filter(t =>
      t.quadrant !== null &&
      t.status !== 'done' &&
      !t.deadline?.startsWith(today) &&
      !t.createdAt.startsWith(today)
    );

    for (const task of tasksToReset) {
      await this.updateTask({ ...task, quadrant: null });
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
    const todayStr = today.toISOString().slice(0, 10);
    const allTasks = this.tasks();

    // Find template tasks with recurrence configured
    const templates = allTasks.filter((t): t is Task & { recurrence: RecurrenceConfig } => t.recurrence !== null && t.status !== 'done');

    for (const template of templates) {
      if (!this.shouldGenerateToday(template.recurrence, today)) continue;

      // Check if instance already exists for today
      const instanceExists = allTasks.some(t =>
        t.title === template.title &&
        t.id !== template.id &&
        t.createdAt.startsWith(todayStr)
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
