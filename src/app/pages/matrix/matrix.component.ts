import {
  Component,
  inject,
  OnInit,
  ChangeDetectionStrategy,
  computed,
  signal,
  viewChild,
  ElementRef,
  afterNextRender,
} from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { RouterLink } from '@angular/router';
import { TaskService } from '../../core/services/task.service';
import { DbService } from '../../core/services/db.service';
import { ScheduleService, dayKey } from '../../core/services/schedule.service';
import { Task, TaskQuadrant } from '../../core/models/task.model';
import { QUADRANT_CONFIG } from '../../core/constants/theme.constants';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';

const PANE_WIDTH_KEY = 'deepwork_matrix_pane_width';
const PANE_COLLAPSED_KEY = 'deepwork_matrix_pane_collapsed';
const QUADRANT_COLLAPSED_KEY = 'deepwork_matrix_collapsed_quadrants';

const QUADRANT_IDS: readonly TaskQuadrant[] = ['urgent-important', 'important', 'urgent', 'neither'];

/**
 * Eisenhower Matrix with a resizable task list.
 *
 * The unassigned list and the quadrant board share a draggable divider: drag it
 * (or use the arrow keys when it is focused, or double-click to reset) to give
 * either side more room. Task cards wrap onto two lines and the drag preview
 * shows the full title, so long titles stay readable while dragging.
 */
@Component({
  selector: 'app-matrix',
  imports: [DragDropModule, RouterLink, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:resize)': 'onWindowResize()',
  },
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
        <a class="guide-toggle" routerLink="/calendar" appTooltip="See these tasks mapped onto a pomodoro timeline">
          Open calendar
        </a>
      </div>
    </div>

    @if (guideOpen()) {
      <div class="guide-panel animate-fade-in">
        <div class="guide-item">
          <span class="guide-dot" style="background: var(--quadrant-q1-color)"></span>
          <div><strong>Do First</strong> — urgent &amp; important. Handle these yourself, right away.</div>
        </div>
        <div class="guide-item">
          <span class="guide-dot" style="background: var(--quadrant-q2-color)"></span>
          <div><strong>Schedule</strong> — important but not urgent. Block focus time for these before they become urgent.</div>
        </div>
        <div class="guide-item">
          <span class="guide-dot" style="background: var(--quadrant-q3-color)"></span>
          <div><strong>Delegate</strong> — urgent but not important. Hand these off if you can, or batch them quickly.</div>
        </div>
        <div class="guide-item">
          <span class="guide-dot" style="background: var(--quadrant-q4-color)"></span>
          <div><strong>Eliminate</strong> — neither urgent nor important. Question whether these need doing at all.</div>
        </div>
        <p class="guide-hint">
          Drag a card between columns — or focus a card and press <strong>1</strong> (Do First),
          <strong>2</strong> (Schedule), <strong>3</strong> (Delegate), <strong>4</strong> (Eliminate) or
          <strong>0</strong> (Unassigned); <strong>Enter</strong> marks it complete.
          The order of the cards is the order the <strong>Calendar</strong> schedules them in — put a task at the
          top of a quadrant and it runs first, with pomodoro breaks reserved between blocks.
          Drag the <strong>divider</strong> beside the task list to widen it (double-click resets, arrow keys work
          too), and use the <strong>chevrons</strong> to collapse a quadrant or the task list.
        </p>
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
      <div
        #wrapper
        class="matrix-wrapper"
        [class.resizing]="resizing()"
        [style.--pane-width]="effectivePaneWidth() + 'px'"
      >
        <div class="matrix-grid">
          @for (q of quadrants; track q.id) {
            <div class="quadrant" [class]="q.id" [class.is-collapsed]="isQuadrantCollapsed(q.id)">
              <div class="quadrant-header">
                <span class="quadrant-dot" [style.background]="q.color"></span>
                <h3>{{ q.label }}</h3>
                <span class="quadrant-count">{{ getQuadrantTasks(q.id).length }}</span>
                <button
                  class="collapse-btn"
                  type="button"
                  (click)="toggleQuadrant(q.id)"
                  [attr.aria-expanded]="!isQuadrantCollapsed(q.id)"
                  [appTooltip]="isQuadrantCollapsed(q.id) ? 'Expand ' + q.label : 'Collapse ' + q.label"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    @if (isQuadrantCollapsed(q.id)) {
                      <polyline points="6,9 12,15 18,9" />
                    } @else {
                      <polyline points="18,15 12,9 6,15" />
                    }
                  </svg>
                </button>
              </div>
              <p class="quadrant-desc">{{ q.desc }}</p>
              <div class="task-drop-zone"
                [class.is-collapsed]="isQuadrantCollapsed(q.id)"
                cdkDropList [cdkDropListData]="q.id"
                [id]="q.id"
                [cdkDropListConnectedTo]="allIds"
                (cdkDropListDropped)="onDrop($event)">
                @if (isQuadrantCollapsed(q.id)) {
                  <div class="empty-text">Collapsed · drop a task here</div>
                } @else {
                  @for (task of getQuadrantTasks(q.id); track task.id) {
                    <div
                      class="matrix-card"
                      cdkDrag
                      [cdkDragData]="task"
                      tabindex="0"
                      [attr.aria-label]="task.title + ' — press 1 to 4 to move it, Enter to complete'"
                      [appTooltip]="task.title + '\n\nDrag to another quadrant · or press 1–4 / 0 · Enter completes'"
                      (keydown)="onCardKeydown(task, $event)"
                    >
                      <button class="card-check" type="button" (click)="toggleDone(task)" aria-label="Mark complete">
                        <span class="check-circle"></span>
                      </button>
                      <div class="card-body">
                        <span class="card-title">{{ task.title }}</span>
                        @if (task.deadline) {
                          <span class="card-deadline">Due {{ formatDeadline(task.deadline) }}</span>
                        }
                      </div>
                      <span class="card-priority" [style.background]="'var(--priority-p' + task.priority + '-color)'" appTooltip="Priority {{ task.priority }}"></span>
                    </div>
                  }
                  @if (getQuadrantTasks(q.id).length === 0) {
                    <div class="empty-hint">Drop tasks here</div>
                  }
                }
              </div>
            </div>
          }
        </div>

        <!-- Divider: drag to resize the task list -->
        @if (!paneCollapsed()) {
          <div
            class="pane-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the task list"
            [attr.aria-valuenow]="paneWidth()"
            [attr.aria-valuemin]="minPaneWidth"
            [attr.aria-valuemax]="maxPaneWidth()"
            tabindex="0"
            appTooltip="Drag to resize · double-click to reset"
            (pointerdown)="onSplitterPointerDown($event)"
            (pointermove)="onSplitterPointerMove($event)"
            (pointerup)="onSplitterPointerUp($event)"
            (pointercancel)="onSplitterPointerUp($event)"
            (dblclick)="resetPaneWidth()"
            (keydown)="onSplitterKeydown($event)"
          >
            <span class="splitter-grip"></span>
          </div>
        }

        <!-- Unassigned sidebar -->
        <div class="unassigned-panel" [class.is-collapsed]="paneCollapsed()">
          <div class="panel-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            @if (!paneCollapsed()) {
              Unassigned
              <span class="unassigned-count">{{ taskService.getUnassignedTasks().length }}</span>
            }
            <button
              class="collapse-btn pane-toggle"
              type="button"
              (click)="togglePane()"
              [attr.aria-expanded]="!paneCollapsed()"
              [appTooltip]="paneCollapsed() ? 'Expand the task list' : 'Collapse the task list'"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                @if (paneCollapsed()) {
                  <polyline points="15,18 9,12 15,6" />
                } @else {
                  <polyline points="9,6 15,12 9,18" />
                }
              </svg>
            </button>
          </div>
          <div class="unassigned-list"
            [class.is-collapsed]="paneCollapsed()"
            cdkDropList id="unassigned" [cdkDropListData]="'unassigned'"
            [cdkDropListConnectedTo]="allIds"
            (cdkDropListDropped)="onDrop($event)">
            @if (paneCollapsed()) {
              <span class="rail-count">{{ taskService.getUnassignedTasks().length }}</span>
              <span class="rail-label">Drop here</span>
            } @else {
              @for (task of taskService.getUnassignedTasks(); track task.id) {
                <div
                  class="matrix-card"
                  cdkDrag
                  [cdkDragData]="task"
                  tabindex="0"
                  [attr.aria-label]="task.title + ' — press 1 to 4 to prioritise it'"
                  [appTooltip]="task.title + '\n\nDrag into a quadrant · or press 1–4 with the card focused'"
                  (keydown)="onCardKeydown(task, $event)"
                >
                  <button class="card-check" type="button" (click)="toggleDone(task)" aria-label="Mark complete">
                    <span class="check-circle"></span>
                  </button>
                  <div class="card-body">
                    <span class="card-title">{{ task.title }}</span>
                    @if (task.deadline) {
                      <span class="card-deadline">Due {{ formatDeadline(task.deadline) }}</span>
                    }
                  </div>
                  <span class="card-priority" [style.background]="'var(--priority-p' + task.priority + '-color)'" appTooltip="Priority {{ task.priority }}"></span>
                </div>
              }
              @if (taskService.getUnassignedTasks().length === 0) {
                <p class="empty-text">All tasks assigned!</p>
              }
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
      background: var(--glass-bg); border: 1px solid rgba(139,92,246,0.12);
    }
    .progress-value { font-size: 0.85rem; font-weight: 800; color: var(--color-text-primary); }
    .progress-label { font-size: 0.6rem; color: var(--color-text-muted); text-transform: uppercase; }
    .guide-toggle {
      font-size: 0.72rem; font-weight: 600; padding: 7px 12px; border-radius: 10px; cursor: pointer;
      background: var(--control-bg); border: 1px solid rgba(139,92,246,0.15); color: var(--color-text-secondary);
    }


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
    .guide-hint { grid-column: 1 / -1; color: var(--color-text-muted); font-size: 0.7rem; margin: 4px 0 0; line-height: 1.6; }

    .empty-state {
      display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
      gap: 6px; padding: 60px 20px; border-radius: 16px; background: var(--glass-bg); border: 1px dashed var(--glass-border);
    }
    .empty-icon { font-size: 2rem; }
    .empty-state h3 { font-size: 1rem; font-weight: 700; }
    .empty-state p { color: var(--color-text-muted); font-size: 0.8rem; }
    .empty-cta {
      font-size: 0.78rem; font-weight: 700; padding: 8px 16px; border-radius: 10px; text-decoration: none;
      background: rgba(139,92,246,0.15); color: var(--color-text-primary); border: 1px solid rgba(139,92,246,0.3);
    }


    .matrix-wrapper { display: flex; gap: 0; height: calc(100% - 80px); align-items: stretch; }
    .matrix-wrapper.resizing { user-select: none; cursor: col-resize; }
    .matrix-grid {
      flex: 1 1 auto; min-width: 260px; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;
      gap: 12px; min-height: 0;
    }
    /* min-height:0 lets each grid row stay at 1fr so a full quadrant scrolls
       inside its own box instead of stretching the board. */
    .quadrant {
      background: var(--glass-bg); backdrop-filter: blur(16px);
      border: 1px solid var(--glass-border); border-radius: 14px;
      padding: 14px; display: flex; flex-direction: column;
      min-width: 0; min-height: 0; overflow: hidden;
    }
    .quadrant.is-collapsed { border-style: dashed; }
    .quadrant-header { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
    .quadrant-header h3 { font-size: 0.8rem; font-weight: 700; }
    .quadrant-count {
      margin-left: auto; font-size: 0.65rem; background: rgba(139,92,246,0.1);
      padding: 2px 7px; border-radius: 10px; color: var(--color-text-muted);
    }
    .quadrant-dot { width: 8px; height: 8px; border-radius: 50%; }
    .quadrant-desc { font-size: 0.65rem; color: var(--color-text-muted); margin-bottom: 10px; }

    .collapse-btn {
      width: 20px; height: 20px; border-radius: 6px; flex-shrink: 0; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      background: transparent; border: none; color: var(--color-text-muted); transition: all 0.2s;
    }
    .collapse-btn:hover { background: rgba(139,92,246,0.12); color: var(--color-text-primary); }
    .collapse-btn:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 1px; }

    /* Each quadrant scrolls on its own once its tasks no longer fit. */
    .task-drop-zone {
      flex: 1 1 auto; display: flex; flex-direction: column; gap: 6px;
      border-radius: 10px; min-height: 44px; padding: 4px;
      overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain;
      scrollbar-width: thin; scrollbar-color: rgba(139,92,246,0.35) transparent;
    }
    .task-drop-zone.cdk-drop-list-dragging { background: rgba(139,92,246,0.06); }
    .task-drop-zone.is-collapsed { align-items: center; justify-content: center; }

    .matrix-card {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; background: var(--control-bg);
      border: 1px solid rgba(139,92,246,0.08); border-radius: 8px;
      cursor: grab;
    }
    .matrix-card:hover { background: rgba(139,92,246,0.06); border-color: rgba(139,92,246,0.2); }
    .matrix-card:focus-visible {
      outline: 2px solid rgba(139, 92, 246, 0.7);
      outline-offset: 1px;
    }
    .matrix-card:active { cursor: grabbing; }
    .cdk-drag-preview {
      background: var(--surface-float); backdrop-filter: blur(12px);
      border: 1px solid rgba(139,92,246,0.3); border-radius: 8px;
      padding: 8px 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.5);
      min-width: 240px; max-width: 420px;
    }
    .cdk-drag-preview .card-title { white-space: normal; overflow: visible; -webkit-line-clamp: none; }
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
    .card-priority { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    /* Titles wrap onto two lines so they stay readable in a narrow list. */
    .card-title {
      font-size: 0.78rem; color: var(--color-text-primary); line-height: 1.25;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden; overflow-wrap: anywhere;
    }
    .card-deadline { font-size: 0.62rem; color: var(--color-text-muted); }

    .empty-hint {
      flex: 1; display: flex; align-items: center; justify-content: center;
      border: 1px dashed var(--glass-border); border-radius: 10px;
      color: var(--color-text-muted); font-size: 0.7rem;
    }

    /* Resizable divider between the board and the task list */
    .pane-splitter {
      flex: 0 0 14px; position: relative; cursor: col-resize;
      display: flex; align-items: center; justify-content: center;
      background: transparent; border: none; touch-action: none;
    }
    .splitter-grip {
      width: 3px; height: 48px; border-radius: 3px;
      background: rgba(139,92,246,0.18);
    }
    .pane-splitter:hover .splitter-grip,
    .pane-splitter:focus-visible .splitter-grip,
    .matrix-wrapper.resizing .splitter-grip { background: var(--color-accent-primary); height: 72%; }
    .pane-splitter:focus-visible { outline: none; }

    /* Unassigned panel */
    .unassigned-panel {
      flex: 0 0 auto; width: var(--pane-width, 300px);
      background: var(--glass-bg); border: 1px solid rgba(139,92,246,0.06);
      border-radius: 14px; padding: 14px; display: flex; flex-direction: column; min-width: 0;
    }
    .unassigned-panel.is-collapsed { width: 58px; padding: 10px 6px; }
    .panel-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 0.78rem; font-weight: 700; margin-bottom: 12px; color: var(--color-text-secondary);
    }
    .unassigned-panel.is-collapsed .panel-title { flex-direction: column; gap: 6px; }
    .unassigned-count {
      margin-left: auto; font-size: 0.65rem; background: rgba(139,92,246,0.1);
      padding: 2px 7px; border-radius: 10px; color: var(--color-text-muted);
    }

    .unassigned-list {
      flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;
    }
    .unassigned-list.is-collapsed { align-items: center; justify-content: center; gap: 8px; overflow: hidden; }
    .rail-count {
      font-size: 0.8rem; font-weight: 800; color: var(--color-text-primary);
      background: rgba(139,92,246,0.12); border-radius: 10px; padding: 4px 9px;
    }
    .rail-label {
      font-size: 0.6rem; color: var(--color-text-muted); writing-mode: vertical-rl;
      text-transform: uppercase;
    }
    .empty-text { font-size: 0.7rem; color: var(--color-text-muted); text-align: center; padding: 20px 0; }

    @media (max-width: 900px) {
      .matrix-wrapper { flex-direction: column; height: auto; overflow-y: auto; gap: 12px; }
      .matrix-grid { grid-template-rows: repeat(4, minmax(160px, auto)); min-width: 0; padding-right: 0; }
      .pane-splitter { display: none; }
      .unassigned-panel, .unassigned-panel.is-collapsed { width: 100%; flex: 1 1 auto; padding: 14px; }
      .unassigned-panel.is-collapsed .panel-title { flex-direction: row; }
      .unassigned-list.is-collapsed { justify-content: flex-start; overflow-y: auto; }
      .rail-label { writing-mode: horizontal-tb; }
      .guide-panel { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      .matrix-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class MatrixComponent implements OnInit {
  taskService = inject(TaskService);
  private readonly schedule = inject(ScheduleService);
  private readonly db = inject(DbService);

  private readonly wrapperRef = viewChild<ElementRef<HTMLElement>>('wrapper');

  /** Divider bounds, in pixels. */
  readonly minPaneWidth = 220;
  readonly defaultPaneWidth = 300;
  private readonly absoluteMaxPaneWidth = 760;
  /** Space the quadrant board always keeps for itself. */
  private readonly boardMinWidth = 300;

  guideOpen = signal(false);
  readonly resizing = signal(false);
  readonly paneCollapsed = signal(this.readStoredPaneCollapsed());
  readonly paneWidth = signal(this.readStoredPaneWidth());
  readonly collapsedQuadrants = signal<Record<TaskQuadrant, boolean>>(this.readStoredQuadrantCollapse());
  private readonly wrapperWidth = signal(0);

  private resizeStartX = 0;
  private resizeStartWidth = 0;

  quadrants = (Object.keys(QUADRANT_CONFIG) as TaskQuadrant[]).map(id => ({
    id,
    label: QUADRANT_CONFIG[id].label,
    desc: QUADRANT_CONFIG[id].description,
    color: QUADRANT_CONFIG[id].color,
  }));

  allIds = ['urgent-important', 'important', 'urgent', 'neither', 'unassigned'];

  totalTodayTasks = computed(() => this.assignedCount() + this.taskService.getUnassignedTasks().length);

  assignedCount = computed(() =>
    QUADRANT_IDS.reduce((sum, q) => sum + this.getQuadrantTasks(q).length, 0)
  );

  totalOverallTasks = computed(() => this.totalTodayTasks());

  /** Width actually applied — the panel becomes a slim rail when collapsed. */
  readonly effectivePaneWidth = computed(() => (this.paneCollapsed() ? 58 : this.paneWidth()));

  /** Never let the task list squeeze the board out of the page. */
  readonly maxPaneWidth = computed(() => {
    const available = this.wrapperWidth();
    if (!available) return this.absoluteMaxPaneWidth;
    return Math.max(this.minPaneWidth, Math.min(this.absoluteMaxPaneWidth, available - this.boardMinWidth));
  });

  constructor() {
    afterNextRender(() => {
      this.measureWrapper();
      this.paneWidth.set(this.clampPaneWidth(this.paneWidth()));
    });
  }

  ngOnInit(): void {
    this.initAsync();
  }

  private async initAsync(): Promise<void> {
    await this.db.init();
    await this.schedule.load();
    await this.taskService.loadTasks();
    await this.taskService.dailyReset();
    await this.taskService.generateRecurringInstances();
  }

  getQuadrantTasks(quadrant: TaskQuadrant): Task[] {
    return this.schedule.tasksInQuadrant(quadrant);
  }

  /** Drop, or the 1–4 / 0 shortcuts, are the only ways to re-prioritise. */
  async onCardKeydown(task: Task, event: KeyboardEvent): Promise<void> {
    const targets: Record<string, TaskQuadrant | null> = {
      '1': 'urgent-important',
      '2': 'important',
      '3': 'urgent',
      '4': 'neither',
      '0': null,
    };

    if (event.key in targets) {
      event.preventDefault();
      await this.moveTask(task, targets[event.key]);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      await this.taskService.toggleStatus(task);
    }
  }

  private async moveTask(task: Task, quadrant: TaskQuadrant | null): Promise<void> {
    if (quadrant === null) {
      await this.schedule.moveTaskToQuadrant(task.id, null, 0, dayKey());
      return;
    }
    const index = this.getQuadrantTasks(quadrant).filter(item => item.id !== task.id).length;
    await this.schedule.moveTaskToQuadrant(task.id, quadrant, index, dayKey());
  }

  /**
   * Dropping a card re-sequences the quadrant, and because the calendar reads
   * the same queue the timeline updates with it.
   */
  async onDrop(event: CdkDragDrop<any>): Promise<void> {
    const task: Task = event.item.data;
    const targetQuadrant = event.container.data as string;
    const newQuadrant: TaskQuadrant | null =
      targetQuadrant === 'unassigned' ? null : (targetQuadrant as TaskQuadrant);

    await this.schedule.moveTaskToQuadrant(task.id, newQuadrant, event.currentIndex, dayKey());
  }

  async toggleDone(task: Task): Promise<void> {
    await this.taskService.toggleStatus(task);
  }

  // ── Resizing ──────────────────────────────────────────────────────────────

  onSplitterPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    this.measureWrapper();
    this.resizing.set(true);
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.paneWidth();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onSplitterPointerMove(event: PointerEvent): void {
    if (!this.resizing()) return;
    event.preventDefault();
    // The task list sits to the right of the divider: moving left widens it.
    this.paneWidth.set(this.clampPaneWidth(this.resizeStartWidth + (this.resizeStartX - event.clientX)));
  }

  onSplitterPointerUp(event: PointerEvent): void {
    if (!this.resizing()) return;
    this.resizing.set(false);
    const element = event.currentTarget as HTMLElement;
    if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
    this.persist(PANE_WIDTH_KEY, String(this.paneWidth()));
  }

  onSplitterKeydown(event: KeyboardEvent): void {
    const step = event.shiftKey ? 64 : 16;
    switch (event.key) {
      case 'ArrowLeft':
        this.setPaneWidth(this.paneWidth() + step);
        break;
      case 'ArrowRight':
        this.setPaneWidth(this.paneWidth() - step);
        break;
      case 'Home':
        this.setPaneWidth(this.minPaneWidth);
        break;
      case 'End':
        this.setPaneWidth(this.maxPaneWidth());
        break;
      case 'Enter':
      case ' ':
        this.resetPaneWidth();
        return;
      default:
        return;
    }
    event.preventDefault();
    this.persist(PANE_WIDTH_KEY, String(this.paneWidth()));
  }

  setPaneWidth(value: number): void {
    this.paneWidth.set(this.clampPaneWidth(value));
  }

  resetPaneWidth(): void {
    this.measureWrapper();
    this.setPaneWidth(this.defaultPaneWidth);
    this.persist(PANE_WIDTH_KEY, String(this.paneWidth()));
  }

  onWindowResize(): void {
    this.measureWrapper();
    this.paneWidth.set(this.clampPaneWidth(this.paneWidth()));
  }

  private measureWrapper(): void {
    this.wrapperWidth.set(this.wrapperRef()?.nativeElement.clientWidth ?? 0);
  }

  private clampPaneWidth(value: number): number {
    return Math.round(Math.min(Math.max(value, this.minPaneWidth), this.maxPaneWidth()));
  }

  // ── Collapsing ────────────────────────────────────────────────────────────

  isQuadrantCollapsed(id: TaskQuadrant): boolean {
    return this.collapsedQuadrants()[id] === true;
  }

  toggleQuadrant(id: TaskQuadrant): void {
    const next = { ...this.collapsedQuadrants(), [id]: !this.collapsedQuadrants()[id] };
    this.collapsedQuadrants.set(next);
    this.persist(QUADRANT_COLLAPSED_KEY, JSON.stringify(next));
  }

  togglePane(): void {
    const next = !this.paneCollapsed();
    this.paneCollapsed.set(next);
    this.persist(PANE_COLLAPSED_KEY, String(next));
    if (!next) {
      // Restore a readable width when re-opening the list.
      this.measureWrapper();
      this.setPaneWidth(Math.max(this.paneWidth(), this.defaultPaneWidth));
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  private readStoredPaneWidth(): number {
    const raw = this.read(PANE_WIDTH_KEY);
    const parsed = raw === null ? NaN : Number(raw);
    if (!Number.isFinite(parsed)) return this.defaultPaneWidth;
    return Math.min(Math.max(Math.round(parsed), this.minPaneWidth), this.absoluteMaxPaneWidth);
  }

  private readStoredPaneCollapsed(): boolean {
    return this.read(PANE_COLLAPSED_KEY) === 'true';
  }

  private readStoredQuadrantCollapse(): Record<TaskQuadrant, boolean> {
    const empty: Record<TaskQuadrant, boolean> = {
      'urgent-important': false,
      important: false,
      urgent: false,
      neither: false,
    };
    const raw = this.read(QUADRANT_COLLAPSED_KEY);
    if (!raw) return empty;
    try {
      const parsed = JSON.parse(raw) as Partial<Record<TaskQuadrant, boolean>>;
      return {
        'urgent-important': parsed['urgent-important'] === true,
        important: parsed['important'] === true,
        urgent: parsed['urgent'] === true,
        neither: parsed['neither'] === true,
      };
    } catch {
      return empty;
    }
  }

  private read(key: string): string | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private persist(key: string, value: string): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {
      // Layout preferences are best-effort only.
    }
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
