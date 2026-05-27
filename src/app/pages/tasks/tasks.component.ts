import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { form, FormField, required, validate, maxLength, submit } from '@angular/forms/signals';
import { TaskService } from '../../core/services/task.service';
import { DbService } from '../../core/services/db.service';
import { Task, TaskStatus, TaskQuadrant, RecurrenceConfig } from '../../core/models/task.model';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { STATUS_CONFIG, QUADRANT_CONFIG } from '../../core/constants/theme.constants';
import { FormFieldWrapperComponent } from '../../shared/components/form-field/form-field-wrapper.component';
import { TaskFormModel, SearchFormModel, createTaskFormDefaults, createSearchFormDefaults } from '../../shared/models/form.models';
import { noXss, trimmedRequired, futureDate } from '../../shared/validators/form-validators';

@Component({
  selector: 'app-tasks',
  imports: [FormField, TooltipDirective, FormFieldWrapperComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tasks-layout">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <h1 class="gradient-text page-title">Tasks</h1>
          <span class="task-count">{{ filteredTasks().length }} tasks</span>
        </div>
        <button class="btn btn-primary btn-sm" (click)="openAddPanel()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Task
        </button>
      </div>

      <!-- Search & Filters -->
      <div class="filters-bar">
        <div class="search-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Search tasks..." [formField]="searchForm.query" />
        </div>
        <div class="filter-chips">
          @for (f of statusFilters; track f.value) {
            <button class="chip" [class.active]="activeFilter() === f.value" (click)="activeFilter.set(f.value)">{{ f.label }}</button>
          }
        </div>
      </div>

      <!-- Task List -->
      <div class="task-list">
        @if (filteredTasks().length === 0) {
          <div class="empty-state">
            <p>No tasks found</p>
          </div>
        }
        @for (task of filteredTasks(); track task.id) {
          <div class="task-row" [class.done]="task.status === 'done'" [class.in-progress]="task.status === 'in-progress'" (click)="openEditPanel(task)">
            <button class="status-btn" [class]="task.status" (click)="toggleStatus(task); $event.stopPropagation()"
              [appTooltip]="statusTooltip(task.status)">
              @if (task.status === 'done') {
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20,6 9,17 4,12"/></svg>
              } @else if (task.status === 'in-progress') {
                <div class="progress-dot"></div>
              }
            </button>
            <div class="task-info">
              <span class="task-title">{{ task.title }}</span>
              <div class="task-meta">
                @if (task.deadline) {
                  <span class="meta-badge deadline" [class.overdue]="isOverdue(task)">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
                    {{ formatDeadline(task.deadline) }}
                  </span>
                }
                @if (task.quadrant) {
                  <span class="meta-badge quadrant">{{ quadrantLabel(task.quadrant) }}</span>
                }
                @if (task.recurrence) {
                  <span class="meta-badge recurring">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
                    {{ task.recurrence.frequency }}
                  </span>
                }
              </div>
            </div>
            <span class="status-tag" [class]="task.status">{{ statusLabel(task.status) }}</span>
            <div class="task-actions">
              <span class="priority-badge p{{ task.priority }}">P{{ task.priority }}</span>
              <button class="icon-btn" [appTooltip]="task.todayOrder !== null ? 'Remove from Today' : 'Add to Today'"
                (click)="toggleToday(task); $event.stopPropagation()">
                <svg width="14" height="14" viewBox="0 0 24 24" [attr.fill]="task.todayOrder !== null ? '#8b5cf6' : 'none'" stroke="currentColor" stroke-width="2"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
              </button>
              <button class="icon-btn delete" (click)="deleteTask(task.id); $event.stopPropagation()" appTooltip="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"/></svg>
              </button>
            </div>
          </div>
        }
      </div>

      <!-- Slide-in Panel -->
      @if (panelOpen()) {
        <div class="panel-backdrop" (click)="closePanel()"></div>
        <div class="slide-panel">
          <div class="panel-header">
            <h2>{{ editingTask() ? 'Edit Task' : 'New Task' }}</h2>
            <button class="icon-btn" (click)="closePanel()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <form class="panel-form" (submit)="onSubmitTask($event)">
            <app-form-field label="Title" [fieldState]="taskForm.title()">
              <input type="text" [formField]="taskForm.title" placeholder="What needs to be done?" autofocus />
            </app-form-field>
            <app-form-field label="Description" [fieldState]="taskForm.description()">
              <textarea [formField]="taskForm.description" rows="3" placeholder="Optional details..."></textarea>
            </app-form-field>
            <div class="form-row">
              <app-form-field label="Priority" [fieldState]="taskForm.priority()">
                <select [formField]="taskForm.priority">
                  <option value="1">P1 — Critical</option>
                  <option value="2">P2 — High</option>
                  <option value="3">P3 — Medium</option>
                  <option value="4">P4 — Low</option>
                </select>
              </app-form-field>
              <app-form-field label="Quadrant" [fieldState]="taskForm.quadrant()">
                <select [formField]="taskForm.quadrant">
                  <option value="">Unassigned</option>
                  <option value="urgent-important">Urgent + Important</option>
                  <option value="important">Important</option>
                  <option value="urgent">Urgent</option>
                  <option value="neither">Neither</option>
                </select>
              </app-form-field>
            </div>
            <app-form-field label="Deadline" [fieldState]="taskForm.deadline()" hint="Must be a future date if set">
              <input type="date" [formField]="taskForm.deadline" />
            </app-form-field>
            <!-- Recurrence config -->
            <app-form-field label="Repeat" [fieldState]="taskForm.recurFrequency()">
              <select [formField]="taskForm.recurFrequency">
                <option value="">No repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </app-form-field>
            @if (taskFormModel().recurFrequency) {
              <div class="recurrence-options">
                @if (taskFormModel().recurFrequency === 'weekly') {
                  <div class="form-group">
                    <label>Days</label>
                    <div class="day-picker">
                      @for (d of weekDays; track d.value) {
                        <button type="button" class="day-btn" [class.active]="formRecurDays.includes(d.value)"
                          (click)="toggleDay(d.value)">{{ d.label }}</button>
                      }
                    </div>
                  </div>
                }
                <app-form-field label="End date (optional)" [fieldState]="taskForm.recurEndDate()">
                  <input type="date" [formField]="taskForm.recurEndDate" />
                </app-form-field>
              </div>
            }
            <div class="form-actions">
              <button type="button" class="btn btn-ghost" (click)="closePanel()">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="taskForm().invalid()">
                {{ editingTask() ? 'Save Changes' : 'Create Task' }}
              </button>
            </div>
          </form>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; overflow: hidden; }
    .tasks-layout { display: flex; flex-direction: column; height: 100%; gap: 16px; }
    .page-header {
      display: flex; align-items: center; justify-content: space-between;
    }
    .header-left { display: flex; align-items: baseline; gap: 12px; }
    .page-title { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.5px; }
    .task-count { font-size: 0.75rem; color: var(--color-text-muted); }

    .filters-bar { display: flex; align-items: center; gap: 12px; }
    .search-box {
      display: flex; align-items: center; gap: 8px;
      background: rgba(255,255,255,0.03); border: 1px solid rgba(139,92,246,0.12);
      border-radius: 10px; padding: 8px 14px; flex: 1; max-width: 320px;
    }
    .search-box svg { color: var(--color-text-muted); flex-shrink: 0; }
    .search-box input {
      background: transparent; border: none; outline: none; color: var(--color-text-primary);
      font-size: 0.82rem; width: 100%;
    }
    .search-box input::placeholder { color: var(--color-text-muted); }
    .filter-chips { display: flex; gap: 6px; }
    .chip {
      padding: 5px 12px; font-size: 0.7rem; font-weight: 500;
      background: rgba(255,255,255,0.03); border: 1px solid rgba(139,92,246,0.1);
      border-radius: 20px; color: var(--color-text-muted); cursor: pointer;
      transition: all 0.2s;
    }
    .chip:hover { border-color: rgba(139,92,246,0.3); color: var(--color-text-secondary); }
    .chip.active {
      background: rgba(139,92,246,0.12); border-color: rgba(139,92,246,0.4);
      color: #a78bfa; font-weight: 600;
    }

    .task-list {
      flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;
      padding-right: 4px;
    }
    .task-list::-webkit-scrollbar { width: 4px; }
    .task-list::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.2); border-radius: 4px; }

    .task-row {
      display: flex; align-items: center; gap: 12px; padding: 12px 16px;
      background: rgba(255,255,255,0.02); border: 1px solid rgba(139,92,246,0.06);
      border-radius: 12px; cursor: pointer; transition: all 0.2s;
    }
    .task-row:hover {
      background: rgba(139,92,246,0.04); border-color: rgba(139,92,246,0.15);
      transform: translateX(2px);
    }
    .task-row.done { opacity: 0.5; }
    .task-row.done .task-title { text-decoration: line-through; }
    .task-row.in-progress { border-color: var(--status-in-progress-bg); }

    .status-btn {
      width: 22px; height: 22px; border-radius: 6px; border: 2px solid rgba(139,92,246,0.3);
      background: transparent; display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all 0.2s; flex-shrink: 0;
    }
    .status-btn:hover { border-color: #8b5cf6; }
    .status-btn.done { background: var(--color-accent-primary); border-color: var(--color-accent-primary); }
    .status-btn.done svg { color: white; }
    .status-btn.in-progress { border-color: var(--status-in-progress-color); }
    .progress-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--status-in-progress-color); }

    .task-info { flex: 1; min-width: 0; }
    .task-title { font-size: 0.85rem; font-weight: 500; color: var(--color-text-primary); }
    .task-meta { display: flex; gap: 8px; margin-top: 4px; }
    .meta-badge {
      display: flex; align-items: center; gap: 4px;
      font-size: 0.65rem; color: var(--color-text-muted); padding: 2px 8px;
      background: rgba(255,255,255,0.03); border-radius: 6px;
    }
    .meta-badge.overdue { color: #f87171; background: rgba(248,113,113,0.08); }

    .task-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .status-tag {
      font-size: 0.6rem; font-weight: 600; padding: 2px 8px; border-radius: 8px;
      letter-spacing: 0.03em; text-transform: uppercase; flex-shrink: 0;
    }
    .status-tag.todo { background: var(--status-todo-bg); color: var(--status-todo-color); }
    .status-tag.in-progress { background: var(--status-in-progress-bg); color: var(--status-in-progress-color); }
    .status-tag.done { background: var(--status-done-bg); color: var(--status-done-color); }
    .priority-badge {
      font-size: 0.6rem; font-weight: 700; padding: 2px 7px; border-radius: 6px;
      font-family: var(--font-mono);
    }
    .priority-badge.p1 { background: var(--priority-p1-bg); color: var(--priority-p1-color); }
    .priority-badge.p2 { background: var(--priority-p2-bg); color: var(--priority-p2-color); }
    .priority-badge.p3 { background: var(--priority-p3-bg); color: var(--priority-p3-color); }
    .priority-badge.p4 { background: var(--priority-p4-bg); color: var(--priority-p4-color); }

    .icon-btn {
      width: 28px; height: 28px; border-radius: 8px; border: none; background: transparent;
      display: flex; align-items: center; justify-content: center;
      color: var(--color-text-muted); cursor: pointer; transition: all 0.2s;
    }
    .icon-btn:hover { background: rgba(139,92,246,0.1); color: #a78bfa; }
    .icon-btn.delete:hover { background: rgba(239,68,68,0.1); color: #f87171; }

    .empty-state {
      display: flex; align-items: center; justify-content: center;
      padding: 60px 20px; color: var(--color-text-muted); font-size: 0.85rem;
    }

    /* Slide Panel */
    .panel-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100;
      backdrop-filter: blur(2px);
    }
    .slide-panel {
      position: fixed; top: 0; right: 0; bottom: 0; width: 420px; max-width: 90vw;
      background: var(--color-bg-secondary); border-left: 1px solid rgba(139,92,246,0.15);
      z-index: 101; display: flex; flex-direction: column; padding: 24px;
      animation: slide-in 0.2s ease-out;
    }
    @keyframes slide-in {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
    .panel-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;
    }
    .panel-header h2 { font-size: 1.1rem; font-weight: 700; }
    .panel-form { display: flex; flex-direction: column; gap: 18px; flex: 1; }
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-group label { font-size: 0.72rem; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .form-group input, .form-group textarea, .form-group select {
      background: rgba(255,255,255,0.03); border: 1px solid rgba(139,92,246,0.12);
      border-radius: 10px; padding: 10px 14px; color: var(--color-text-primary);
      font-size: 0.85rem; outline: none; transition: border-color 0.2s;
    }
    .form-group input:focus, .form-group textarea:focus, .form-group select:focus {
      border-color: rgba(139,92,246,0.4);
    }
    .form-group textarea { resize: vertical; min-height: 80px; }
    .form-group select { cursor: pointer; }
    .form-group select option { background: var(--color-bg-secondary); }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: auto; padding-top: 16px; }

    .btn { padding: 8px 18px; border-radius: 10px; font-size: 0.8rem; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s; }
    .btn-primary { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(139,92,246,0.3); }
    .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
    .btn-ghost { background: transparent; color: var(--color-text-muted); }
    .btn-ghost:hover { color: var(--color-text-primary); }
    .btn-sm { padding: 6px 14px; font-size: 0.75rem; display: flex; align-items: center; gap: 6px; }
    .recurrence-options { padding: 8px 0; display: flex; flex-direction: column; gap: 12px; }
    .day-picker { display: flex; gap: 4px; flex-wrap: wrap; }
    .day-btn { width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(139,92,246,0.3); background: transparent; color: var(--color-text-muted); cursor: pointer; font-size: 0.7rem; transition: all 0.2s; }
    .day-btn.active { background: rgba(139,92,246,0.3); border-color: rgba(139,92,246,0.7); color: var(--color-text-primary); }
    .day-btn:hover { border-color: rgba(139,92,246,0.6); }
    .meta-badge.recurring { background: rgba(139,92,246,0.15); color: rgb(167,139,250); display: inline-flex; align-items: center; gap: 3px; }
  `]
})
export class TasksComponent implements OnInit {
  private taskService = inject(TaskService);
  private db = inject(DbService);

  activeFilter = signal<'all' | TaskStatus>('all');
  panelOpen = signal(false);
  editingTask = signal<Task | null>(null);

  // Search form
  private readonly searchModel = signal<SearchFormModel>(createSearchFormDefaults());
  readonly searchForm = form(this.searchModel);
  readonly searchQuery = computed(() => this.searchModel().query);

  // Task add/edit form with validation schema
  readonly taskFormModel = signal<TaskFormModel>(createTaskFormDefaults());
  readonly taskForm = form(this.taskFormModel, (s) => {
    // Title is required and must be safe
    required(s.title, { message: 'Task title is required' });
    validate(s.title, trimmedRequired);
    validate(s.title, noXss);
    maxLength(s.title, 200, { message: 'Title must be 200 characters or fewer' });

    // Description security
    validate(s.description, noXss);
    maxLength(s.description, 2000, { message: 'Description must be 2000 characters or fewer' });

    // Priority is required
    required(s.priority, { message: 'Priority is required' });

    // Deadline must be future if set
    validate(s.deadline, futureDate);
  });
  formRecurDays: number[] = [];

  weekDays = [
    { label: 'Sun', value: 0 },
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
  ];

  statusFilters = [
    { label: 'All', value: 'all' as const },
    { label: 'To Do', value: 'todo' as const },
    { label: 'In Progress', value: 'in-progress' as const },
    { label: 'Done', value: 'done' as const },
  ];

  filteredTasks = computed(() => {
    let tasks = this.taskService.tasks();
    const q = this.searchQuery().toLowerCase();
    if (q) {
      tasks = tasks.filter(t => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    const filter = this.activeFilter();
    if (filter !== 'all') {
      tasks = tasks.filter(t => t.status === filter);
    }
    return tasks;
  });

  async ngOnInit(): Promise<void> {
    await this.db.init();
    await this.taskService.loadTasks();
  }

  openAddPanel(): void {
    this.editingTask.set(null);
    this.taskFormModel.set(createTaskFormDefaults());
    this.formRecurDays = [];
    this.panelOpen.set(true);
  }

  openEditPanel(task: Task): void {
    this.editingTask.set(task);
    this.taskFormModel.set({
      title: task.title,
      description: task.description,
      priority: String(task.priority),
      quadrant: task.quadrant ?? '',
      deadline: task.deadline ?? '',
      recurFrequency: task.recurrence?.frequency ?? '',
      recurEndDate: task.recurrence?.endDate ?? '',
    });
    this.formRecurDays = task.recurrence?.days ? [...task.recurrence.days] : [];
    this.panelOpen.set(true);
  }

  closePanel(): void {
    this.panelOpen.set(false);
    this.editingTask.set(null);
  }

  onSubmitTask(event: Event): void {
    event.preventDefault();
    submit(this.taskForm, async () => {
      const formData = this.taskFormModel();
      const recurrence: RecurrenceConfig | null = formData.recurFrequency
        ? {
            frequency: formData.recurFrequency as 'daily' | 'weekly' | 'monthly',
            interval: 1,
            days: this.formRecurDays.length > 0 ? this.formRecurDays : undefined,
            endDate: formData.recurEndDate || undefined,
          }
        : null;
      const existing = this.editingTask();
      if (existing) {
        await this.taskService.updateTask({
          ...existing,
          title: formData.title.trim(),
          description: formData.description.trim(),
          priority: Number(formData.priority) as 1 | 2 | 3 | 4,
          quadrant: (formData.quadrant || null) as TaskQuadrant | null,
          deadline: formData.deadline || null,
          recurrence,
        });
      } else {
        await this.taskService.createTask({
          title: formData.title.trim(),
          description: formData.description.trim(),
          priority: Number(formData.priority) as 1 | 2 | 3 | 4,
          quadrant: (formData.quadrant || null) as TaskQuadrant | null,
          deadline: formData.deadline || null,
          recurrence,
        });
      }
      this.closePanel();
    });
  }

  async toggleStatus(task: Task): Promise<void> {
    await this.taskService.toggleStatus(task);
  }

  statusLabel(status: string): string {
    return STATUS_CONFIG[status as TaskStatus]?.label ?? status;
  }

  statusTooltip(status: string): string {
    return STATUS_CONFIG[status as TaskStatus]?.tooltip ?? 'Click to change status';
  }

  async toggleToday(task: Task): Promise<void> {
    if (task.todayOrder !== null) {
      await this.taskService.removeFromToday(task.id);
    } else {
      await this.taskService.addToToday(task.id);
    }
  }

  async deleteTask(id: string): Promise<void> {
    await this.taskService.deleteTask(id);
  }

  isOverdue(task: Task): boolean {
    if (!task.deadline) return false;
    return new Date(task.deadline) < new Date(new Date().toISOString().slice(0, 10));
  }

  formatDeadline(deadline: string): string {
    const d = new Date(deadline);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  quadrantLabel(q: TaskQuadrant): string {
    return QUADRANT_CONFIG[q].label;
  }

  toggleDay(day: number): void {
    const idx = this.formRecurDays.indexOf(day);
    if (idx >= 0) {
      this.formRecurDays.splice(idx, 1);
    } else {
      this.formRecurDays.push(day);
    }
  }
}
