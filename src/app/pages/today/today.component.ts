import { Component, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { TaskService } from '../../core/services/task.service';
import { DbService } from '../../core/services/db.service';
import { Task, TaskStatus } from '../../core/models/task.model';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { STATUS_CONFIG } from '../../core/constants/theme.constants';

@Component({
  selector: 'app-today',
  imports: [DragDropModule, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="today-layout">
      <div class="page-header">
        <div class="header-left">
          <h1 class="gradient-text page-title">Today</h1>
          <span class="date-label">{{ todayLabel }}</span>
        </div>
        <div class="header-stats">
          <span class="stat">{{ completedCount() }}/{{ taskService.todayTasks().length }} done</span>
        </div>
      </div>

      @if (taskService.todayTasks().length === 0) {
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.3)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
          <h3>No tasks for today</h3>
          <p>Create a task with today's date or set a deadline for today</p>
        </div>
      } @else {
        <div class="task-list" cdkDropList (cdkDropListDropped)="onReorder($event)">
          @for (task of taskService.todayTasks(); track task.id; let i = $index) {
            <div class="today-card" cdkDrag [class.done]="task.status === 'done'" [class.in-progress]="task.status === 'in-progress'">
              <div class="drag-handle" cdkDragHandle>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="2"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg>
              </div>
              <span class="order-num">{{ i + 1 }}</span>
              <button class="status-btn" [class]="task.status" (click)="toggleStatus(task)"
                [appTooltip]="statusTooltip(task.status)">
                @if (task.status === 'done') {
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20,6 9,17 4,12"/></svg>
                } @else if (task.status === 'in-progress') {
                  <div class="progress-dot"></div>
                }
              </button>
              <div class="card-content">
                <span class="card-title">{{ task.title }}</span>
                @if (task.completedAt && task.status === 'done') {
                  <span class="completed-time">Done at {{ formatTime(task.completedAt) }}</span>
                }
              </div>
              <span class="status-tag" [class]="task.status">{{ statusLabel(task.status) }}</span>
              <div class="card-actions">
                <span class="priority-dot p{{ task.priority }}"></span>
                <button class="focus-btn" [class.active]="isFocused(task)" (click)="focusTask(task)" appTooltip="Focus & go to timer">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                <button class="remove-btn" (click)="removeFromToday(task)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; overflow: hidden; }
    .today-layout { display: flex; flex-direction: column; height: 100%; gap: 20px; }
    .page-header { display: flex; align-items: center; justify-content: space-between; }
    .header-left { display: flex; align-items: baseline; gap: 12px; }
    .page-title { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.5px; }
    .date-label { font-size: 0.75rem; color: var(--color-text-muted); }
    .header-stats {}
    .stat {
      font-size: 0.75rem; color: var(--color-text-muted); background: rgba(139,92,246,0.08);
      padding: 4px 12px; border-radius: 20px;
    }

    .empty-state {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      flex: 1; gap: 12px; text-align: center;
    }
    .empty-state h3 { font-size: 1rem; font-weight: 600; color: var(--color-text-secondary); }
    .empty-state p { font-size: 0.8rem; color: var(--color-text-muted); }

    .task-list {
      flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;
      padding-right: 4px;
    }
    .task-list::-webkit-scrollbar { width: 4px; }
    .task-list::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.2); border-radius: 4px; }

    .today-card {
      display: flex; align-items: center; gap: 12px; padding: 14px 16px;
      background: var(--glass-bg); border: 1px solid rgba(139,92,246,0.06);
      border-radius: 12px; transition: all 0.2s;
    }
    .today-card:hover { background: rgba(139,92,246,0.03); border-color: rgba(139,92,246,0.12); }
    .today-card.done { opacity: 0.5; }
    .today-card.done .card-title { text-decoration: line-through; }
    .today-card.in-progress { border-color: var(--status-in-progress-bg); }
    .cdk-drag-preview {
      background: var(--surface-float); backdrop-filter: blur(12px);
      border: 1px solid rgba(139,92,246,0.3); border-radius: 12px;
      padding: 14px 16px; box-shadow: 0 12px 40px rgba(0,0,0,0.5);
      display: flex; align-items: center; gap: 12px;
    }
    .cdk-drag-placeholder {
      background: rgba(139,92,246,0.04); border: 1px dashed rgba(139,92,246,0.2);
      border-radius: 12px;
    }
    .cdk-drag-animating { transition: transform 200ms ease; }

    .drag-handle {
      color: var(--color-text-muted); cursor: grab; opacity: 0.4;
      transition: opacity 0.2s;
    }
    .drag-handle:hover { opacity: 1; }
    .order-num {
      font-size: 0.65rem; font-weight: 700; color: var(--color-text-muted);
      font-family: var(--font-mono); width: 16px; text-align: center;
    }
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

    .card-content { flex: 1; min-width: 0; }
    .card-title { font-size: 0.85rem; font-weight: 500; color: var(--color-text-primary); }
    .completed-time { display: block; font-size: 0.65rem; color: var(--color-text-muted); margin-top: 2px; }

    .status-tag {
      font-size: 0.6rem; font-weight: 600; padding: 2px 8px; border-radius: 8px;
      letter-spacing: 0.03em; text-transform: uppercase; flex-shrink: 0;
    }
    .status-tag.todo { background: var(--status-todo-bg); color: var(--status-todo-color); }
    .status-tag.in-progress { background: var(--status-in-progress-bg); color: var(--status-in-progress-color); }
    .status-tag.done { background: var(--status-done-bg); color: var(--status-done-color); }

    .card-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .priority-dot { width: 6px; height: 6px; border-radius: 50%; }
    .priority-dot.p1 { background: var(--priority-p1-color); }
    .priority-dot.p2 { background: var(--priority-p2-color); }
    .priority-dot.p3 { background: var(--priority-p3-color); }
    .priority-dot.p4 { background: var(--priority-p4-color); }
    .focus-btn, .remove-btn {
      width: 26px; height: 26px; border-radius: 7px; border: none; background: transparent;
      display: flex; align-items: center; justify-content: center;
      color: var(--color-text-muted); cursor: pointer; transition: all 0.2s;
    }
    .focus-btn:hover { background: rgba(139,92,246,0.1); color: var(--timer-work-color); }
    .focus-btn.active { background: rgba(139,92,246,0.15); color: var(--timer-work-color); border: 1px solid rgba(139,92,246,0.3); }
    .remove-btn:hover { background: rgba(239,68,68,0.1); color: #f87171; }
  `]
})
export class TodayComponent implements OnInit {
  taskService = inject(TaskService);
  private readonly db = inject(DbService);
  private readonly router = inject(Router);

  todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  completedCount = () => this.taskService.todayTasks().filter(t => t.status === 'done').length;

  ngOnInit(): void {
    this.initAsync();
  }

  private async initAsync(): Promise<void> {
    await this.db.init();
    await this.taskService.loadTasks();
    await this.taskService.dailyReset();
    await this.taskService.generateRecurringInstances();
  }

  async onReorder(event: CdkDragDrop<Task[]>): Promise<void> {
    const tasks = [...this.taskService.todayTasks()];
    moveItemInArray(tasks, event.previousIndex, event.currentIndex);
    await this.taskService.reorderToday(tasks.map(t => t.id));
  }

  async toggleStatus(task: Task): Promise<void> {
    await this.taskService.toggleStatus(task);
  }

  async removeFromToday(task: Task): Promise<void> {
    await this.taskService.removeFromToday(task.id);
  }

  focusTask(task: Task): void {
    localStorage.setItem('deepwork_focusTaskId', task.id);
    this.router.navigate(['/dashboard']);
  }

  isFocused(task: Task): boolean {
    return localStorage.getItem('deepwork_focusTaskId') === task.id;
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  statusLabel(status: string): string {
    return STATUS_CONFIG[status as TaskStatus]?.label ?? status;
  }

  statusTooltip(status: string): string {
    return STATUS_CONFIG[status as TaskStatus]?.tooltip ?? 'Click to change status';
  }
}
