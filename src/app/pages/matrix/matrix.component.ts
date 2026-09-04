import { Component, inject, OnInit, ChangeDetectionStrategy, computed, signal } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { RouterLink } from '@angular/router';
import { TaskService } from '../../core/services/task.service';
import { DbService } from '../../core/services/db.service';
import { Task, TaskQuadrant } from '../../core/models/task.model';
import { QUADRANT_CONFIG } from '../../core/constants/theme.constants';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';

@Component({
  selector: 'app-matrix',
  imports: [DragDropModule, RouterLink, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header">
      <div>
        <h1 class="gradient-text page-title">Eisenhower Matrix</h1>
        <p class="page-subtitle">Sort today's tasks by urgency and importance to know what to do first</p>
      </div>
      <div class="header-actions">
        @if (totalTodayTasks() > 0) {
          <div class="progress-pill" appTooltip="Tasks you've sorted into a quadrant vs. still unassigned">
            <span class="progress-value">{{ assignedCount() }}/{{ totalTodayTasks() }}</span>
            <span class="progress-label">prioritized</span>
          </div>
        }
        <button class="guide-toggle" type="button" (click)="guideOpen.set(!guideOpen())" [attr.aria-expanded]="guideOpen()">
          {{ guideOpen() ? 'Hide guide' : 'How does this work?' }}
        </button>
      </div>
    </div>

    @if (guideOpen()) {
      <div class="guide-panel animate-fade-in">
        <div class="guide-item">
          <span class="guide-dot danger"></span>
          <div><strong>Do First</strong> — urgent &amp; important. Handle these yourself, right away.</div>
        </div>
        <div class="guide-item">
          <span class="guide-dot accent"></span>
          <div><strong>Schedule</strong> — important but not urgent. Block focus time for these before they become urgent.</div>
        </div>
        <div class="guide-item">
          <span class="guide-dot warning"></span>
          <div><strong>Delegate</strong> — urgent but not important. Hand these off if you can, or batch them quickly.</div>
        </div>
        <div class="guide-item">
          <span class="guide-dot muted"></span>
          <div><strong>Eliminate</strong> — neither urgent nor important. Question whether these need doing at all.</div>
        </div>
        <p class="guide-hint">Drag a card between columns, or use the <strong>Move</strong> menu on a card if you'd rather not drag.</p>
      </div>
    }

    @if (totalOverallTasks() === 0) {
      <div class="empty-state animate-fade-in">
        <div class="empty-icon">🗂️</div>
        <h3>No tasks for today yet</h3>
        <p>Add a task to start sorting it into a quadrant.</p>
        <a class="empty-cta" routerLink="/tasks">Go to Tasks</a>
      </div>
    } @else {
      <div class="matrix-wrapper">
        <div class="matrix-grid">
          @for (q of quadrants; track q.id) {
            <div class="quadrant" [class]="q.id">
              <div class="quadrant-header">
                <span class="quadrant-dot" [class]="q.dotClass"></span>
                <h3>{{ q.label }}</h3>
                <span class="quadrant-count">{{ getQuadrantTasks(q.id).length }}</span>
              </div>
              <p class="quadrant-desc">{{ q.desc }}</p>
              <div class="task-drop-zone"
                cdkDropList [cdkDropListData]="q.id"
                [id]="q.id"
                [cdkDropListConnectedTo]="allIds"
                (cdkDropListDropped)="onDrop($event)">
                @for (task of getQuadrantTasks(q.id); track task.id) {
                  <div class="matrix-card" cdkDrag [cdkDragData]="task">
                    <button class="card-check" type="button" (click)="toggleDone(task)" appTooltip="Mark complete">
                      <span class="check-circle"></span>
                    </button>
                    <div class="card-body">
                      <span class="card-title">{{ task.title }}</span>
                      @if (task.deadline) {
                        <span class="card-deadline">Due {{ formatDeadline(task.deadline) }}</span>
                      }
                    </div>
                    <span class="card-priority p{{ task.priority }}" appTooltip="Priority {{ task.priority }}"></span>
                    <select class="card-move" [value]="task.quadrant ?? ''" (click)="$event.stopPropagation()" (change)="onMoveSelect(task, $event)" aria-label="Move task to quadrant">
                      <option value="">Unassigned</option>
                      @for (opt of quadrants; track opt.id) {
                        <option [value]="opt.id">{{ opt.label }}</option>
                      }
                    </select>
                  </div>
                }
                @if (getQuadrantTasks(q.id).length === 0) {
                  <div class="empty-hint">Drop tasks here</div>
                }
              </div>
            </div>
          }
        </div>

        <!-- Unassigned sidebar -->
        <div class="unassigned-panel">
          <div class="panel-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Unassigned
            <span class="unassigned-count">{{ taskService.getUnassignedTasks().length }}</span>
          </div>
          <div class="unassigned-list"
            cdkDropList id="unassigned" [cdkDropListData]="'unassigned'"
            [cdkDropListConnectedTo]="allIds"
            (cdkDropListDropped)="onDrop($event)">
            @for (task of taskService.getUnassignedTasks(); track task.id) {
              <div class="matrix-card" cdkDrag [cdkDragData]="task">
                <button class="card-check" type="button" (click)="toggleDone(task)" appTooltip="Mark complete">
                  <span class="check-circle"></span>
                </button>
                <div class="card-body">
                  <span class="card-title">{{ task.title }}</span>
                  @if (task.deadline) {
                    <span class="card-deadline">Due {{ formatDeadline(task.deadline) }}</span>
                  }
                </div>
                <span class="card-priority p{{ task.priority }}" appTooltip="Priority {{ task.priority }}"></span>
                <select class="card-move" [value]="''" (click)="$event.stopPropagation()" (change)="onMoveSelect(task, $event)" aria-label="Move task to quadrant">
                  <option value="">Unassigned</option>
                  @for (opt of quadrants; track opt.id) {
                    <option [value]="opt.id">{{ opt.label }}</option>
                  }
                </select>
              </div>
            }
            @if (taskService.getUnassignedTasks().length === 0) {
              <p class="empty-text">All tasks assigned!</p>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; height: 100%; overflow: hidden; }
    .page-header { margin-bottom: 12px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .page-title { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.5px; }
    .page-subtitle { color: var(--color-text-muted); margin-top: 4px; font-size: 0.8rem; }

    .header-actions { display: flex; align-items: center; gap: 10px; }
    .progress-pill {
      display: flex; flex-direction: column; align-items: center; padding: 4px 12px; border-radius: 10px;
      background: var(--glass-bg); border: 1px solid rgba(139,92,246,0.12); min-width: 64px;
    }
    .progress-value { font-size: 0.85rem; font-weight: 800; color: var(--color-text-primary); }
    .progress-label { font-size: 0.6rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .guide-toggle {
      font-size: 0.72rem; font-weight: 600; padding: 7px 12px; border-radius: 10px; cursor: pointer;
      background: var(--control-bg); border: 1px solid rgba(139,92,246,0.15); color: var(--color-text-secondary);
    }
    .guide-toggle:hover { background: rgba(139,92,246,0.06); }

    .guide-panel {
      margin-bottom: 14px; padding: 14px 16px; border-radius: 14px;
      background: var(--glass-bg); border: 1px solid rgba(139,92,246,0.1);
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; font-size: 0.75rem;
    }
    .guide-item { display: flex; align-items: flex-start; gap: 8px; color: var(--color-text-secondary); line-height: 1.5; }
    .guide-item strong { color: var(--color-text-primary); }
    .guide-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
    .guide-dot.danger { background: var(--quadrant-q1-color); }
    .guide-dot.accent { background: var(--quadrant-q2-color); }
    .guide-dot.warning { background: var(--quadrant-q3-color); }
    .guide-dot.muted { background: var(--quadrant-q4-color); }
    .guide-hint { grid-column: 1 / -1; color: var(--color-text-muted); font-size: 0.7rem; margin: 4px 0 0; }

    .empty-state {
      display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
      gap: 6px; padding: 60px 20px; border-radius: 16px; background: var(--glass-bg); border: 1px dashed var(--glass-border);
    }
    .empty-icon { font-size: 2rem; }
    .empty-state h3 { font-size: 1rem; font-weight: 700; }
    .empty-state p { color: var(--color-text-muted); font-size: 0.8rem; margin-bottom: 6px; }
    .empty-cta {
      font-size: 0.78rem; font-weight: 700; padding: 8px 16px; border-radius: 10px; text-decoration: none;
      background: rgba(139,92,246,0.15); color: var(--color-text-primary); border: 1px solid rgba(139,92,246,0.3);
    }
    .empty-cta:hover { background: rgba(139,92,246,0.25); }

    .matrix-wrapper { display: flex; gap: 16px; height: calc(100% - 80px); }
    .matrix-grid {
      flex: 1; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;
      gap: 12px;
    }
    .quadrant {
      background: var(--glass-bg); backdrop-filter: blur(16px);
      border: 1px solid var(--glass-border); border-radius: 14px;
      padding: 14px; display: flex; flex-direction: column;
      transition: border-color 0.3s;
    }
    .quadrant:hover { border-color: rgba(139,92,246,0.15); }
    .quadrant-header { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
    .quadrant-header h3 { font-size: 0.8rem; font-weight: 700; }
    .quadrant-count {
      margin-left: auto; font-size: 0.65rem; background: rgba(139,92,246,0.1);
      padding: 2px 7px; border-radius: 10px; color: var(--color-text-muted);
    }
    .quadrant-dot { width: 8px; height: 8px; border-radius: 50%; }
    .quadrant-dot.danger { background: var(--quadrant-q1-color); box-shadow: 0 0 8px rgba(248,113,113,0.5); }
    .quadrant-dot.accent { background: var(--quadrant-q2-color); box-shadow: 0 0 8px rgba(139,92,246,0.5); }
    .quadrant-dot.warning { background: var(--quadrant-q3-color); box-shadow: 0 0 8px rgba(251,191,36,0.5); }
    .quadrant-dot.muted { background: var(--quadrant-q4-color); }
    .quadrant-desc { font-size: 0.65rem; color: var(--color-text-muted); margin-bottom: 10px; }

    .task-drop-zone {
      flex: 1; display: flex; flex-direction: column; gap: 6px;
      border-radius: 10px; min-height: 60px; padding: 4px; overflow-y: auto;
      transition: background 0.2s;
    }
    .task-drop-zone.cdk-drop-list-dragging { background: rgba(139,92,246,0.06); }

    .matrix-card {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; background: var(--control-bg);
      border: 1px solid rgba(139,92,246,0.08); border-radius: 8px;
      cursor: grab; transition: all 0.2s;
    }
    .matrix-card:hover { background: rgba(139,92,246,0.06); border-color: rgba(139,92,246,0.2); }
    .matrix-card:hover .card-move { opacity: 1; }
    .matrix-card:active { cursor: grabbing; }
    .cdk-drag-preview {
      background: var(--surface-float); backdrop-filter: blur(12px);
      border: 1px solid rgba(139,92,246,0.3); border-radius: 8px;
      padding: 8px 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    }
    .cdk-drag-placeholder {
      background: rgba(139,92,246,0.05); border: 1px dashed rgba(139,92,246,0.3);
      border-radius: 8px;
    }
    .cdk-drag-animating { transition: transform 200ms ease; }

    .card-check { background: none; border: none; padding: 0; cursor: pointer; flex-shrink: 0; display: flex; }
    .check-circle {
      width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(139,92,246,0.3); display: block;
      transition: all 0.2s;
    }
    .card-check:hover .check-circle { border-color: rgb(52,211,153); background: rgba(52,211,153,0.15); }

    .card-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
    .card-priority {
      width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
    }
    .card-priority.p1 { background: var(--priority-p1-color); }
    .card-priority.p2 { background: var(--priority-p2-color); }
    .card-priority.p3 { background: var(--priority-p3-color); }
    .card-priority.p4 { background: var(--priority-p4-color); }
    .card-title { font-size: 0.78rem; color: var(--color-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .card-deadline { font-size: 0.62rem; color: var(--color-text-muted); }
    .card-move {
      opacity: 0; transition: opacity 0.2s; font-size: 0.62rem; max-width: 74px; padding: 2px 4px;
      border-radius: 6px; border: 1px solid rgba(139,92,246,0.15); background: var(--control-bg); color: var(--color-text-muted); cursor: pointer;
    }

    .empty-hint {
      flex: 1; display: flex; align-items: center; justify-content: center;
      border: 1px dashed var(--glass-border); border-radius: 10px;
      color: var(--color-text-muted); font-size: 0.7rem; opacity: 0.5; min-height: 50px;
    }

    /* Unassigned panel */
    .unassigned-panel {
      width: 200px; background: var(--glass-bg); border: 1px solid rgba(139,92,246,0.06);
      border-radius: 14px; padding: 14px; display: flex; flex-direction: column;
    }
    .panel-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 0.78rem; font-weight: 700; margin-bottom: 12px; color: var(--color-text-secondary);
    }
    .unassigned-count {
      margin-left: auto; font-size: 0.65rem; background: rgba(139,92,246,0.1);
      padding: 2px 7px; border-radius: 10px; color: var(--color-text-muted);
    }
    .unassigned-list {
      flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;
    }
    .unassigned-list::-webkit-scrollbar { width: 3px; }
    .unassigned-list::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.2); border-radius: 3px; }
    .empty-text { font-size: 0.7rem; color: var(--color-text-muted); text-align: center; padding: 20px 0; }

    @media (max-width: 900px) {
      .matrix-wrapper { flex-direction: column; height: auto; overflow-y: auto; }
      .matrix-grid { grid-template-rows: repeat(4, minmax(160px, auto)); }
      .unassigned-panel { width: 100%; }
      .guide-panel { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      .matrix-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class MatrixComponent implements OnInit {
  taskService = inject(TaskService);
  private readonly db = inject(DbService);

  guideOpen = signal(false);

  quadrants = (Object.keys(QUADRANT_CONFIG) as TaskQuadrant[]).map(id => ({
    id,
    label: QUADRANT_CONFIG[id].label,
    desc: QUADRANT_CONFIG[id].description,
    dotClass: QUADRANT_CONFIG[id].dotClass,
  }));

  allIds = ['urgent-important', 'important', 'urgent', 'neither', 'unassigned'];

  totalTodayTasks = computed(() => this.assignedCount() + this.taskService.getUnassignedTasks().length);

  assignedCount = computed(() =>
    (['urgent-important', 'important', 'urgent', 'neither'] as TaskQuadrant[])
      .reduce((sum, q) => sum + this.taskService.getTasksByQuadrant(q).length, 0)
  );

  totalOverallTasks = computed(() => this.totalTodayTasks());

  ngOnInit(): void {
    this.initAsync();
  }

  private async initAsync(): Promise<void> {
    await this.db.init();
    await this.taskService.loadTasks();
    await this.taskService.dailyReset();
    await this.taskService.generateRecurringInstances();
  }

  getQuadrantTasks(quadrant: TaskQuadrant): Task[] {
    return this.taskService.getTasksByQuadrant(quadrant);
  }

  async onDrop(event: CdkDragDrop<any>): Promise<void> {
    const task: Task = event.item.data;
    const targetQuadrant = event.container.data as string;
    const newQuadrant: TaskQuadrant | null = targetQuadrant === 'unassigned' ? null : targetQuadrant as TaskQuadrant;

    if (task.quadrant !== newQuadrant) {
      await this.taskService.setQuadrant(task.id, newQuadrant);
    }
  }

  async onMoveSelect(task: Task, event: Event): Promise<void> {
    const value = (event.target as HTMLSelectElement).value;
    const newQuadrant: TaskQuadrant | null = value === '' ? null : value as TaskQuadrant;
    if (task.quadrant !== newQuadrant) {
      await this.taskService.setQuadrant(task.id, newQuadrant);
    }
  }

  async toggleDone(task: Task): Promise<void> {
    await this.taskService.toggleStatus(task);
  }

  formatDeadline(date: string): string {
    const d = new Date(date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'tomorrow';
    if (diffDays === -1) return 'yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}
