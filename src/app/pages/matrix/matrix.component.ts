import { Component, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { TaskService } from '../../core/services/task.service';
import { DbService } from '../../core/services/db.service';
import { Task, TaskQuadrant } from '../../core/models/task.model';
import { QUADRANT_CONFIG } from '../../core/constants/theme.constants';

@Component({
  selector: 'app-matrix',
  imports: [DragDropModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header">
      <h1 class="gradient-text page-title">Eisenhower Matrix</h1>
      <p class="page-subtitle">Drag today's tasks from Unassigned into quadrants to prioritize</p>
    </div>
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
                  <span class="card-priority p{{ task.priority }}"></span>
                  <span class="card-title">{{ task.title }}</span>
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
              <span class="card-priority p{{ task.priority }}"></span>
              <span class="card-title">{{ task.title }}</span>
            </div>
          }
          @if (taskService.getUnassignedTasks().length === 0) {
            <p class="empty-text">All tasks assigned!</p>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; overflow: hidden; }
    .page-header { margin-bottom: 16px; }
    .page-title { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.5px; }
    .page-subtitle { color: var(--color-text-muted); margin-top: 4px; font-size: 0.8rem; }

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
      border-radius: 10px; min-height: 60px; padding: 4px;
      transition: background 0.2s;
    }
    .task-drop-zone.cdk-drop-list-dragging { background: rgba(139,92,246,0.06); }

    .matrix-card {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; background: var(--control-bg);
      border: 1px solid rgba(139,92,246,0.08); border-radius: 8px;
      cursor: grab; transition: all 0.2s;
    }
    .matrix-card:hover { background: rgba(139,92,246,0.06); border-color: rgba(139,92,246,0.2); }
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

    .card-priority {
      width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
    }
    .card-priority.p1 { background: var(--priority-p1-color); }
    .card-priority.p2 { background: var(--priority-p2-color); }
    .card-priority.p3 { background: var(--priority-p3-color); }
    .card-priority.p4 { background: var(--priority-p4-color); }
    .card-title { font-size: 0.78rem; color: var(--color-text-primary); }

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
  `]
})
export class MatrixComponent implements OnInit {
  taskService = inject(TaskService);
  private readonly db = inject(DbService);

  quadrants = (Object.keys(QUADRANT_CONFIG) as TaskQuadrant[]).map(id => ({
    id,
    label: QUADRANT_CONFIG[id].label,
    desc: QUADRANT_CONFIG[id].description,
    dotClass: QUADRANT_CONFIG[id].dotClass,
  }));

  allIds = ['urgent-important', 'important', 'urgent', 'neither', 'unassigned'];

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
}
