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
import { NotificationService } from '../../core/services/notification.service';
import { TaskService } from '../../core/services/task.service';
import { DbService } from '../../core/services/db.service';
import { ScheduleService, dayKey } from '../../core/services/schedule.service';
import { Task, TaskQuadrant, TaskStatus } from '../../core/models/task.model';
import { QUADRANT_CONFIG, STATUS_CONFIG, STATUS_CYCLE } from '../../core/constants/theme.constants';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';

const PANE_WIDTH_KEY = 'deepwork_matrix_pane_width';
const PANE_COLLAPSED_KEY = 'deepwork_matrix_pane_collapsed';
const QUADRANT_COLLAPSED_KEY = 'deepwork_matrix_collapsed_quadrants';

const QUADRANT_IDS: readonly TaskQuadrant[] = [
  'urgent-important',
  'important',
  'urgent',
  'neither',
];

/** Compact labels for the in-card status switch. */
const STATUS_SHORT_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  'in-progress': 'Doing',
  done: 'Done',
};

/** Secondary line shown next to each status inside the right-click menu. */
const STATUS_HINTS: Record<TaskStatus, string> = {
  todo: 'Not started',
  'in-progress': 'Working on it',
  done: 'Completed',
};

interface MatrixContextMenu {
  task: Task;
  x: number;
  y: number;
}

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
    '(document:click)': 'closeContextMenu()',
    '(document:contextmenu)': 'closeContextMenu()',
    '(document:keydown.escape)': 'closeContextMenu()',
    '(window:blur)': 'closeContextMenu()',
  },
  template: `
    <div class="page-header">
      <div>
        <h1 class="gradient-text page-title">Eisenhower Matrix</h1>
        <p class="page-subtitle">
          Sort today's tasks by urgency and importance to know what to do first
        </p>
      </div>
      <div class="header-actions">
        @if (totalTodayTasks() > 0) {
          <div
            class="progress-pill"
            appTooltip="Tasks you've sorted into a quadrant vs. still unassigned"
          >
            <span class="progress-value">{{ assignedCount() }}/{{ totalTodayTasks() }}</span>
            <span class="progress-label">prioritized</span>
          </div>
        }
        <button
          class="guide-toggle"
          type="button"
          (click)="guideOpen.set(!guideOpen())"
          [attr.aria-expanded]="guideOpen()"
        >
          {{ guideOpen() ? 'Hide guide' : 'How does this work?' }}
        </button>
        <a
          class="guide-toggle"
          routerLink="/calendar"
          appTooltip="See these tasks mapped onto a pomodoro timeline"
        >
          Open calendar
        </a>
      </div>
    </div>

    @if (guideOpen()) {
      <div class="guide-panel animate-fade-in">
        <div class="guide-item">
          <span class="guide-dot" style="background: var(--quadrant-q1-color)"></span>
          <div>
            <strong>Do First</strong> — urgent &amp; important. Handle these yourself, right away.
          </div>
        </div>
        <div class="guide-item">
          <span class="guide-dot" style="background: var(--quadrant-q2-color)"></span>
          <div>
            <strong>Schedule</strong> — important but not urgent. Block focus time for these before
            they become urgent.
          </div>
        </div>
        <div class="guide-item">
          <span class="guide-dot" style="background: var(--quadrant-q3-color)"></span>
          <div>
            <strong>Delegate</strong> — urgent but not important. Hand these off if you can, or
            batch them quickly.
          </div>
        </div>
        <div class="guide-item">
          <span class="guide-dot" style="background: var(--quadrant-q4-color)"></span>
          <div>
            <strong>Eliminate</strong> — neither urgent nor important. Question whether these need
            doing at all.
          </div>
        </div>
        <p class="guide-hint">
          Drag a card between columns — or focus a card and press <strong>1</strong> (Do First),
          <strong>2</strong> (Schedule), <strong>3</strong> (Delegate),
          <strong>4</strong> (Eliminate) or <strong>0</strong> (Unassigned). Change a task's status
          with the <strong>To Do / Doing / Done</strong> switch on its card — one click updates it.
          Right-click any card for the full menu: move it to another quadrant and set its status in
          one place. The order of the cards is the order the <strong>Calendar</strong> schedules
          them in — put a task at the top of a quadrant and it runs first, with pomodoro breaks
          reserved between blocks. Drag the <strong>divider</strong> beside the task list to widen
          it (double-click resets, arrow keys work too), and use the <strong>chevrons</strong> to
          collapse a quadrant or the task list.
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
                  [appTooltip]="
                    isQuadrantCollapsed(q.id) ? 'Expand ' + q.label : 'Collapse ' + q.label
                  "
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                  >
                    @if (isQuadrantCollapsed(q.id)) {
                      <polyline points="6,9 12,15 18,9" />
                    } @else {
                      <polyline points="18,15 12,9 6,15" />
                    }
                  </svg>
                </button>
              </div>
              <p class="quadrant-desc">{{ q.desc }}</p>
              <div
                class="task-drop-zone"
                [class.is-collapsed]="isQuadrantCollapsed(q.id)"
                cdkDropList
                [cdkDropListData]="q.id"
                [id]="q.id"
                [cdkDropListConnectedTo]="allIds"
                (cdkDropListDropped)="onDrop($event)"
              >
                @if (isQuadrantCollapsed(q.id)) {
                  <div class="empty-text">Collapsed · drop a task here</div>
                } @else {
                  @for (task of getQuadrantTasks(q.id); track task.id) {
                    <div
                      class="matrix-card"
                      [class.status-todo]="task.status === 'todo'"
                      [class.status-in-progress]="task.status === 'in-progress'"
                      [class.status-done]="task.status === 'done'"
                      cdkDrag
                      [cdkDragData]="task"
                      tabindex="0"
                      [attr.aria-label]="cardLabel(task)"
                      [appTooltip]="cardTooltip(task)"
                      (keydown)="onCardKeydown(task, $event)"
                      (contextmenu)="openContextMenu(task, $event)"
                    >
                      <div
                        class="status-switch"
                        role="group"
                        [attr.aria-label]="'Status for ' + task.title"
                        (pointerdown)="$event.stopPropagation()"
                        (mousedown)="$event.stopPropagation()"
                        (keydown)="$event.stopPropagation()"
                      >
                        @for (option of statusOptions; track option.status) {
                          <button
                            type="button"
                            class="status-segment"
                            [attr.data-status]="option.status"
                            [class.active]="task.status === option.status"
                            [attr.aria-pressed]="task.status === option.status"
                            [appTooltip]="option.tooltip"
                            (click)="setCardStatus(task, option.status)"
                          >
                            {{ option.shortLabel }}
                          </button>
                        }
                      </div>
                      <div class="card-body">
                        <span class="card-title">{{ task.title }}</span>
                        @if (task.deadline) {
                          <span class="card-deadline">Due {{ formatDeadline(task.deadline) }}</span>
                        }
                      </div>
                      <span
                        class="card-priority"
                        [style.background]="'var(--priority-p' + task.priority + '-color)'"
                        appTooltip="Priority {{ task.priority }}"
                      ></span>
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
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
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
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                @if (paneCollapsed()) {
                  <polyline points="15,18 9,12 15,6" />
                } @else {
                  <polyline points="9,6 15,12 9,18" />
                }
              </svg>
            </button>
          </div>
          <div
            class="unassigned-list"
            [class.is-collapsed]="paneCollapsed()"
            cdkDropList
            id="unassigned"
            [cdkDropListData]="'unassigned'"
            [cdkDropListConnectedTo]="allIds"
            (cdkDropListDropped)="onDrop($event)"
          >
            @if (paneCollapsed()) {
              <span class="rail-count">{{ taskService.getUnassignedTasks().length }}</span>
              <span class="rail-label">Drop here</span>
            } @else {
              @for (task of taskService.getUnassignedTasks(); track task.id) {
                <div
                  class="matrix-card"
                  [class.status-todo]="task.status === 'todo'"
                  [class.status-in-progress]="task.status === 'in-progress'"
                  [class.status-done]="task.status === 'done'"
                  cdkDrag
                  [cdkDragData]="task"
                  tabindex="0"
                  [attr.aria-label]="cardLabel(task)"
                  [appTooltip]="cardTooltip(task)"
                  (keydown)="onCardKeydown(task, $event)"
                  (contextmenu)="openContextMenu(task, $event)"
                >
                  <div
                    class="status-switch"
                    role="group"
                    [attr.aria-label]="'Status for ' + task.title"
                    (pointerdown)="$event.stopPropagation()"
                    (mousedown)="$event.stopPropagation()"
                    (keydown)="$event.stopPropagation()"
                  >
                    @for (option of statusOptions; track option.status) {
                      <button
                        type="button"
                        class="status-segment"
                        [attr.data-status]="option.status"
                        [class.active]="task.status === option.status"
                        [attr.aria-pressed]="task.status === option.status"
                        [appTooltip]="option.tooltip"
                        (click)="setCardStatus(task, option.status)"
                      >
                        {{ option.shortLabel }}
                      </button>
                    }
                  </div>
                  <div class="card-body">
                    <span class="card-title">{{ task.title }}</span>
                    @if (task.deadline) {
                      <span class="card-deadline">Due {{ formatDeadline(task.deadline) }}</span>
                    }
                  </div>
                  <span
                    class="card-priority"
                    [style.background]="'var(--priority-p' + task.priority + '-color)'"
                    appTooltip="Priority {{ task.priority }}"
                  ></span>
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

    @if (contextMenu(); as menu) {
      <div
        #contextMenu
        class="matrix-menu"
        role="menu"
        tabindex="-1"
        [attr.aria-label]="'Actions for ' + menu.task.title"
        [style.left.px]="menu.x"
        [style.top.px]="menu.y"
        (click)="$event.stopPropagation()"
        (contextmenu)="$event.preventDefault(); $event.stopPropagation()"
        (keydown.escape)="closeContextMenu()"
      >
        <div class="menu-header">
          <span class="menu-title">{{ menu.task.title }}</span>
          <span class="menu-subtitle">{{ taskContextLabel(menu.task) }}</span>
        </div>

        <div class="menu-section">
          <span class="menu-section-title">Move to quadrant</span>
          @for (q of quadrants; track q.id) {
            <button
              class="menu-option"
              type="button"
              role="menuitemradio"
              [attr.aria-checked]="menu.task.quadrant === q.id"
              [class.is-current]="menu.task.quadrant === q.id"
              (click)="moveFromMenu(menu.task, q.id)"
            >
              <span class="menu-dot" [style.background]="q.color"></span>
              <span class="menu-option-label">{{ q.label }}</span>
              <span class="menu-option-desc">{{ q.desc }}</span>
              @if (menu.task.quadrant === q.id) {
                <svg
                  class="menu-check"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                >
                  <polyline points="20,6 9,17 4,12" />
                </svg>
              }
            </button>
          }
          @if (menu.task.quadrant) {
            <button
              class="menu-option"
              type="button"
              role="menuitemradio"
              aria-checked="false"
              (click)="moveFromMenu(menu.task, null)"
            >
              <span class="menu-dot unassigned"></span>
              <span class="menu-option-label">Unassigned</span>
              <span class="menu-option-desc">Back to task list</span>
            </button>
          }
        </div>

        <div class="menu-section">
          <span class="menu-section-title">Status</span>
          @for (option of statusOptions; track option.status) {
            <button
              class="menu-option"
              type="button"
              role="menuitemradio"
              [attr.aria-checked]="menu.task.status === option.status"
              [class.is-current]="menu.task.status === option.status"
              (click)="setStatusFromMenu(menu.task, option.status)"
            >
              <span class="menu-dot" [style.background]="option.color"></span>
              <span class="menu-option-label">{{ option.label }}</span>
              <span class="menu-option-desc">{{ option.hint }}</span>
              @if (menu.task.status === option.status) {
                <svg
                  class="menu-check"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                >
                  <polyline points="20,6 9,17 4,12" />
                </svg>
              }
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow: hidden;
      }
      .page-header {
        margin-bottom: 12px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .page-title {
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -0.5px;
      }
      .page-subtitle {
        color: var(--color-text-muted);
        margin-top: 4px;
        font-size: 13px;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .progress-pill {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 4px 12px;
        border-radius: 10px;
        background: var(--glass-bg);
        border: 1px solid rgba(139, 92, 246, 0.12);
      }
      .progress-value {
        font-size: 14px;
        font-weight: 800;
        color: var(--color-text-primary);
      }
      .progress-label {
        font-size: 10px;
        color: var(--color-text-muted);
        text-transform: uppercase;
      }
      .guide-toggle {
        font-size: 12px;
        font-weight: 600;
        padding: 7px 12px;
        border-radius: 10px;
        cursor: pointer;
        background: var(--control-bg);
        border: 1px solid rgba(139, 92, 246, 0.15);
        color: var(--color-text-secondary);
      }

      .guide-panel {
        margin-bottom: 14px;
        padding: 14px 16px;
        border-radius: 14px;
        background: var(--glass-bg);
        border: 1px solid rgba(139, 92, 246, 0.1);
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px 20px;
        font-size: 12px;
      }
      .guide-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        color: var(--color-text-secondary);
        line-height: 1.5;
      }
      .guide-item strong {
        color: var(--color-text-primary);
      }
      .guide-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-top: 4px;
        flex-shrink: 0;
      }
      .guide-hint {
        grid-column: 1 / -1;
        color: var(--color-text-muted);
        font-size: 11px;
        margin: 4px 0 0;
        line-height: 1.6;
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 6px;
        padding: 60px 20px;
        border-radius: 16px;
        background: var(--glass-bg);
        border: 1px dashed var(--glass-border);
      }
      .empty-icon {
        font-size: 32px;
      }
      .empty-state h3 {
        font-size: 16px;
        font-weight: 700;
      }
      .empty-state p {
        color: var(--color-text-muted);
        font-size: 13px;
      }
      .empty-cta {
        font-size: 12px;
        font-weight: 700;
        padding: 8px 16px;
        border-radius: 10px;
        text-decoration: none;
        background: rgba(139, 92, 246, 0.15);
        color: var(--color-text-primary);
        border: 1px solid rgba(139, 92, 246, 0.3);
      }

      .matrix-wrapper {
        display: flex;
        gap: 0;
        height: calc(100% - 80px);
        align-items: stretch;
      }
      .matrix-wrapper.resizing {
        user-select: none;
        cursor: col-resize;
      }
      .matrix-grid {
        flex: 1 1 auto;
        min-width: 260px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr;
        gap: 12px;
        min-height: 0;
      }
      /* min-height:0 lets each grid row stay at 1fr so a full quadrant scrolls
       inside its own box instead of stretching the board. */
      .quadrant {
        background: var(--glass-bg);
        backdrop-filter: blur(16px);
        border: 1px solid var(--glass-border);
        border-radius: 14px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
      }
      .quadrant.is-collapsed {
        border-style: dashed;
      }
      .quadrant-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 2px;
      }
      .quadrant-header h3 {
        font-size: 13px;
        font-weight: 700;
      }
      .quadrant-count {
        margin-left: auto;
        font-size: 10px;
        background: rgba(139, 92, 246, 0.1);
        padding: 2px 7px;
        border-radius: 10px;
        color: var(--color-text-muted);
      }
      .quadrant-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      .quadrant-desc {
        font-size: 10px;
        color: var(--color-text-muted);
        margin-bottom: 10px;
      }

      .collapse-btn {
        width: 20px;
        height: 20px;
        border-radius: 6px;
        flex-shrink: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        color: var(--color-text-muted);
        transition: all 0.2s;
      }
      .collapse-btn:hover {
        background: rgba(139, 92, 246, 0.12);
        color: var(--color-text-primary);
      }
      .collapse-btn:focus-visible {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: 1px;
      }

      /* Each quadrant scrolls on its own once its tasks no longer fit. */
      .task-drop-zone {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        gap: 6px;
        border-radius: 10px;
        min-height: 44px;
        padding: 4px;
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: rgba(139, 92, 246, 0.35) transparent;
      }
      .task-drop-zone.cdk-drop-list-dragging {
        background: rgba(139, 92, 246, 0.06);
      }
      .task-drop-zone.is-collapsed {
        align-items: center;
        justify-content: center;
      }

      .matrix-card {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px 8px 14px;
        background: var(--control-bg);
        border: 1px solid rgba(139, 92, 246, 0.08);
        border-radius: 8px;
        cursor: grab;
      }
      .matrix-card::before {
        content: '';
        position: absolute;
        left: 0;
        top: 7px;
        bottom: 7px;
        width: 3px;
        border-radius: 0 2px 2px 0;
        background: var(--matrix-status-color, transparent);
        opacity: 0.85;
      }
      .matrix-card.status-todo {
        --matrix-status-color: var(--status-todo-color);
      }
      .matrix-card.status-in-progress {
        --matrix-status-color: var(--status-in-progress-color);
      }
      .matrix-card.status-done {
        --matrix-status-color: var(--status-done-color);
      }
      .matrix-card:hover {
        background: rgba(139, 92, 246, 0.06);
        border-color: rgba(139, 92, 246, 0.2);
      }
      .matrix-card:focus-visible {
        outline: 2px solid rgba(139, 92, 246, 0.7);
        outline-offset: 1px;
      }
      .matrix-card:active {
        cursor: grabbing;
      }
      .cdk-drag-preview {
        background: var(--surface-float);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(139, 92, 246, 0.3);
        border-radius: 8px;
        padding: 8px 12px;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
        min-width: 240px;
        max-width: 420px;
      }
      .cdk-drag-preview .card-title {
        white-space: normal;
        overflow: visible;
        -webkit-line-clamp: none;
      }
      .cdk-drag-placeholder {
        background: rgba(139, 92, 246, 0.05);
        border: 1px dashed rgba(139, 92, 246, 0.3);
        border-radius: 8px;
      }
      .cdk-drag-animating {
        transition: transform 200ms ease;
      }

      /* Inline status switch — the quick, always-visible alternative to a menu. */
      .status-switch {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        flex-shrink: 0;
        padding: 2px;
        border-radius: 8px;
        user-select: none;
        background: rgba(0, 0, 0, 0.18);
        border: 1px solid rgba(139, 92, 246, 0.12);
      }
      .status-segment {
        border: none;
        background: transparent;
        cursor: pointer;
        line-height: 1;
        padding: 3px 5px;
        border-radius: 6px;
        font-size: 10px;
        font-weight: 700;
        color: var(--color-text-muted);
        transition:
          background 0.15s,
          color 0.15s;
      }
      .status-segment:hover {
        color: var(--color-text-primary);
        background: rgba(139, 92, 246, 0.1);
      }
      .status-segment:focus-visible {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: 1px;
      }
      .status-segment.active[data-status='todo'] {
        color: var(--status-todo-color);
        background: var(--status-todo-bg);
      }
      .status-segment.active[data-status='in-progress'] {
        color: var(--status-in-progress-color);
        background: var(--status-in-progress-bg);
      }
      .status-segment.active[data-status='done'] {
        color: var(--status-done-color);
        background: var(--status-done-bg);
      }

      .card-body {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
        flex: 1;
      }
      .card-priority {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      /* Titles wrap onto two lines so they stay readable in a narrow list. */
      .card-title {
        font-size: 12px;
        color: var(--color-text-primary);
        line-height: 1.25;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      .card-deadline {
        font-size: 10px;
        color: var(--color-text-muted);
      }

      .empty-hint {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px dashed var(--glass-border);
        border-radius: 10px;
        color: var(--color-text-muted);
        font-size: 11px;
      }

      /* Right-click menu: quadrant moves and status changes in one panel. */
      .matrix-menu {
        position: fixed;
        z-index: 1200;
        width: 300px;
        max-width: calc(100vw - 16px);
        max-height: calc(100vh - 16px);
        overflow-y: auto;
        padding: 8px;
        background: var(--surface-float);
        backdrop-filter: blur(18px);
        border: 1px solid rgba(139, 92, 246, 0.28);
        border-radius: 14px;
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
        animation: matrix-menu-in 0.12s ease-out;
      }
      @keyframes matrix-menu-in {
        from {
          opacity: 0;
          transform: translateY(-4px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      .menu-header {
        padding: 6px 10px 10px;
        margin-bottom: 4px;
        border-bottom: 1px solid var(--glass-border);
      }
      .menu-title {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
        font-size: 12px;
        font-weight: 700;
        color: var(--color-text-primary);
      }
      .menu-subtitle {
        display: block;
        margin-top: 3px;
        font-size: 10px;
        color: var(--color-text-muted);
      }
      .menu-section {
        padding: 2px 0;
      }
      .menu-section + .menu-section {
        margin-top: 6px;
        padding-top: 8px;
        border-top: 1px solid var(--glass-border);
      }
      .menu-section-title {
        display: block;
        padding: 2px 10px 6px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--color-text-muted);
      }
      .menu-option {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 7px 10px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--color-text-secondary);
        text-align: left;
        cursor: pointer;
        transition:
          background 0.15s,
          color 0.15s;
      }
      .menu-option:hover,
      .menu-option:focus-visible {
        background: rgba(139, 92, 246, 0.13);
        color: var(--color-text-primary);
        outline: none;
      }
      .menu-option.is-current {
        background: rgba(139, 92, 246, 0.08);
      }
      .menu-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .menu-dot.unassigned {
        background: var(--color-text-muted);
      }
      .menu-option-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--color-text-primary);
        white-space: nowrap;
      }
      .menu-option-desc {
        margin-left: auto;
        font-size: 10px;
        color: var(--color-text-muted);
        text-align: right;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .menu-check {
        flex-shrink: 0;
        color: var(--color-accent-primary);
      }

      /* Resizable divider between the board and the task list */
      .pane-splitter {
        flex: 0 0 14px;
        position: relative;
        cursor: col-resize;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        touch-action: none;
      }
      .splitter-grip {
        width: 3px;
        height: 48px;
        border-radius: 2px;
        background: rgba(139, 92, 246, 0.18);
      }
      .pane-splitter:hover .splitter-grip,
      .pane-splitter:focus-visible .splitter-grip,
      .matrix-wrapper.resizing .splitter-grip {
        background: var(--color-accent-primary);
        height: 72%;
      }
      .pane-splitter:focus-visible {
        outline: none;
      }

      /* Unassigned panel */
      .unassigned-panel {
        flex: 0 0 auto;
        width: var(--pane-width, 300px);
        background: var(--glass-bg);
        border: 1px solid rgba(139, 92, 246, 0.06);
        border-radius: 14px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .unassigned-panel.is-collapsed {
        width: 58px;
        padding: 10px 6px;
      }
      .panel-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 12px;
        color: var(--color-text-secondary);
      }
      .unassigned-panel.is-collapsed .panel-title {
        flex-direction: column;
        gap: 6px;
      }
      .unassigned-count {
        margin-left: auto;
        font-size: 10px;
        background: rgba(139, 92, 246, 0.1);
        padding: 2px 7px;
        border-radius: 10px;
        color: var(--color-text-muted);
      }

      .unassigned-list {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .unassigned-list.is-collapsed {
        align-items: center;
        justify-content: center;
        gap: 8px;
        overflow: hidden;
      }
      .rail-count {
        font-size: 13px;
        font-weight: 800;
        color: var(--color-text-primary);
        background: rgba(139, 92, 246, 0.12);
        border-radius: 10px;
        padding: 4px 9px;
      }
      .rail-label {
        font-size: 10px;
        color: var(--color-text-muted);
        writing-mode: vertical-rl;
        text-transform: uppercase;
      }
      .empty-text {
        font-size: 11px;
        color: var(--color-text-muted);
        text-align: center;
        padding: 20px 0;
      }

      @media (max-width: 900px) {
        .matrix-wrapper {
          flex-direction: column;
          height: auto;
          overflow-y: auto;
          gap: 12px;
        }
        .matrix-grid {
          grid-template-rows: repeat(4, minmax(160px, auto));
          min-width: 0;
          padding-right: 0;
        }
        .pane-splitter {
          display: none;
        }
        .unassigned-panel,
        .unassigned-panel.is-collapsed {
          width: 100%;
          flex: 1 1 auto;
          padding: 14px;
        }
        .unassigned-panel.is-collapsed .panel-title {
          flex-direction: row;
        }
        .unassigned-list.is-collapsed {
          justify-content: flex-start;
          overflow-y: auto;
        }
        .rail-label {
          writing-mode: horizontal-tb;
        }
        .guide-panel {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 560px) {
        .matrix-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class MatrixComponent implements OnInit {
  taskService = inject(TaskService);
  private readonly schedule = inject(ScheduleService);
  private readonly db = inject(DbService);
  private readonly notifications = inject(NotificationService);

  private readonly wrapperRef = viewChild<ElementRef<HTMLElement>>('wrapper');
  private readonly contextMenuRef = viewChild<ElementRef<HTMLElement>>('contextMenu');

  /** Divider bounds, in pixels. */
  readonly minPaneWidth = 220;
  readonly defaultPaneWidth = 300;
  private readonly absoluteMaxPaneWidth = 760;
  /** Space the quadrant board always keeps for itself. */
  private readonly boardMinWidth = 300;

  guideOpen = signal(false);
  readonly resizing = signal(false);
  readonly contextMenu = signal<MatrixContextMenu | null>(null);
  readonly paneCollapsed = signal(this.readStoredPaneCollapsed());
  readonly paneWidth = signal(this.readStoredPaneWidth());
  readonly collapsedQuadrants = signal<Record<TaskQuadrant, boolean>>(
    this.readStoredQuadrantCollapse(),
  );
  private readonly wrapperWidth = signal(0);

  private resizeStartX = 0;
  private resizeStartWidth = 0;

  quadrants = (Object.keys(QUADRANT_CONFIG) as TaskQuadrant[]).map((id) => ({
    id,
    label: QUADRANT_CONFIG[id].label,
    desc: QUADRANT_CONFIG[id].description,
    color: QUADRANT_CONFIG[id].color,
  }));

  readonly statusOptions = STATUS_CYCLE.map((status) => ({
    status,
    label: STATUS_CONFIG[status].label,
    shortLabel: STATUS_SHORT_LABELS[status],
    hint: STATUS_HINTS[status],
    color: STATUS_CONFIG[status].color,
    tooltip: `Mark as ${STATUS_CONFIG[status].label}`,
  }));

  allIds = ['urgent-important', 'important', 'urgent', 'neither', 'unassigned'];

  totalTodayTasks = computed(
    () => this.assignedCount() + this.taskService.getUnassignedTasks().length,
  );

  assignedCount = computed(() =>
    QUADRANT_IDS.reduce((sum, q) => sum + this.getQuadrantTasks(q).length, 0),
  );

  totalOverallTasks = computed(() => this.totalTodayTasks());

  /** Width actually applied — the panel becomes a slim rail when collapsed. */
  readonly effectivePaneWidth = computed(() => (this.paneCollapsed() ? 58 : this.paneWidth()));

  /** Never let the task list squeeze the board out of the page. */
  readonly maxPaneWidth = computed(() => {
    const available = this.wrapperWidth();
    if (!available) return this.absoluteMaxPaneWidth;
    return Math.max(
      this.minPaneWidth,
      Math.min(this.absoluteMaxPaneWidth, available - this.boardMinWidth),
    );
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
    await this.taskService.runDailyUpkeep();
  }

  getQuadrantTasks(quadrant: TaskQuadrant): Task[] {
    return this.schedule.tasksInQuadrant(quadrant);
  }

  /** Drop, the 1–4 / 0 shortcuts, or the right-click menu re-prioritise a card. */
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
  }

  private async moveTask(task: Task, quadrant: TaskQuadrant | null): Promise<void> {
    if (quadrant === null) {
      await this.schedule.moveTaskToQuadrant(task.id, null, 0, dayKey());
      return;
    }
    const index = this.getQuadrantTasks(quadrant).filter((item) => item.id !== task.id).length;
    await this.schedule.moveTaskToQuadrant(task.id, quadrant, index, dayKey());
  }

  /**
   * The one-click status switch shown on every card. It writes straight to the
   * task service, so the change is reflected everywhere immediately — and a
   * completed task leaves the matrix (the matrix only shows open work).
   */
  async setCardStatus(task: Task, status: TaskStatus): Promise<void> {
    if (task.status === status) return;
    await this.taskService.setStatus(task, status);
    if (status === 'done') {
      // The card carries the news; the line under it is the encouragement, and
      // it comes from the app's own list for a finished task rather than from
      // the session lists. See `NotificationService.announceTaskCompleted`.
      this.notifications.announceTaskCompleted(task.title);
    }
  }

  openContextMenu(task: Task, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const margin = 8;
    const menuWidth = 300;
    const menuHeight = 470;
    const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
    const maxX = viewportWidth ? viewportWidth - menuWidth - margin : event.clientX;
    const maxY = viewportHeight ? viewportHeight - menuHeight - margin : event.clientY;

    this.contextMenu.set({
      task,
      x: Math.max(margin, Math.min(event.clientX, maxX)),
      y: Math.max(margin, Math.min(event.clientY, maxY)),
    });

    // Move keyboard focus into the menu so Tab/Enter work after a right-click.
    setTimeout(() => {
      const element = this.contextMenuRef()?.nativeElement;
      element?.querySelector<HTMLElement>('.menu-option')?.focus();
    });
  }

  closeContextMenu(): void {
    if (this.contextMenu()) this.contextMenu.set(null);
  }

  async moveFromMenu(task: Task, quadrant: TaskQuadrant | null): Promise<void> {
    this.closeContextMenu();
    if (task.quadrant === quadrant) return;
    await this.moveTask(task, quadrant);
  }

  async setStatusFromMenu(task: Task, status: TaskStatus): Promise<void> {
    this.closeContextMenu();
    await this.setCardStatus(task, status);
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
    this.paneWidth.set(
      this.clampPaneWidth(this.resizeStartWidth + (this.resizeStartX - event.clientX)),
    );
  }

  onSplitterPointerUp(event: PointerEvent): void {
    if (!this.resizing()) return;
    this.resizing.set(false);
    const element = event.currentTarget as HTMLElement;
    if (element.hasPointerCapture?.(event.pointerId))
      element.releasePointerCapture(event.pointerId);
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
    this.closeContextMenu();
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

  cardLabel(task: Task): string {
    return `${task.title} — ${this.taskContextLabel(task)}. Use the status buttons to change status, press 1-4 or 0 to move it, or right-click for all options.`;
  }

  cardTooltip(task: Task): string {
    return `${task.title}\n\n${this.taskContextLabel(task)} · click a status button · drag or press 1–4 / 0 · right-click for all options`;
  }

  taskContextLabel(task: Task): string {
    const quadrant = task.quadrant ? QUADRANT_CONFIG[task.quadrant].label : 'Unassigned';
    return `${quadrant} · ${STATUS_CONFIG[task.status].label}`;
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
