import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TaskService } from '../../core/services/task.service';
import {
  QUADRANT_ORDER,
  ScheduleService,
  clampMinute,
  dayKey,
  formatDuration,
  formatMinute,
  parseTimeInput,
  snapMinute,
} from '../../core/services/schedule.service';
import { QUADRANT_CONFIG } from '../../core/constants/theme.constants';
import { Task, TaskQuadrant, TASK_TITLE_MAX_LENGTH, normalizeTaskTitle } from '../../core/models/task.model';
import {
  BreakBlock,
  DaySchedule,
  FocusBlock,
  MAX_POMODOROS,
  MIN_POMODOROS,
  MinuteOfDay,
  ScheduleBlock,
} from '../../core/models/schedule.model';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';

interface BlockLayout {
  block: ScheduleBlock;
  top: number;
  height: number;
  left: number;
  width: number;
  tasks: Task[];
  color: string;
  tint: string;
  stroke: string;
}

interface DragState {
  taskId: string;
  title: string;
  source: 'rail' | 'event';
  originStart: MinuteOfDay;
  grabOffsetMin: number;
  previewStart: MinuteOfDay;
  startX: number;
  startY: number;
  overGrid: boolean;
  moved: boolean;
}

interface ResizeState {
  taskId: string;
  startY: number;
  basePomodoros: number;
}

interface PanelState {
  startMin: MinuteOfDay;
  blockId: string | null;
}

/** "rgba(r, g, b, a)" needs the channels, and color-mix() is not available everywhere. */
function hexToRgb(hex: string): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int)) return '139, 92, 246';
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
}

const COLLAPSED_GROUPS_KEY = 'deepwork_calendar_collapsed_groups';
const RAIL_GROUP_IDS = ['urgent-important', 'important', 'urgent', 'neither', 'unassigned'] as const;

/** Which queue groups the user folded away — remembered between sessions. */
function readCollapsedGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function persistCollapsedGroups(value: Record<string, boolean>): void {
  try {
    localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(value));
  } catch {
    /* layout preference only — safe to drop */
  }
}

/**
 * Google-Calendar-style timeline for the four quadrants.
 *
 * The page is a projection of the Eisenhower matrix: tasks are queued in
 * quadrant order and in the order they appear inside a quadrant, then poured
 * into pomodoro focus blocks with the short/long breaks reserved between them.
 * Dragging on the timeline pins a task and re-sequences its quadrant, so both
 * views always describe the same plan.
 */
@Component({
  selector: 'app-calendar',
  imports: [TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:pointermove)': 'onPointerMove($event)',
    '(window:pointerup)': 'onPointerUp($event)',
    '(window:pointercancel)': 'onPointerUp($event)',
    '(window:keydown.escape)': 'onEscape()',
  },
  template: `
    <div class="page-header">
      <div>
        <h1 class="gradient-text page-title">Calendar</h1>
        <p class="page-subtitle">
          Your quadrants, scheduled into {{ focusMinutes() }}-minute focus blocks with {{ pomodorosBeforeLongBreak() }}
          pomodoros per long break
        </p>
      </div>
      <div class="header-actions">
        <button class="cal-btn ghost" type="button" (click)="clearPins()" [disabled]="!hasPins()"
          appTooltip="Return every hand-placed task to the automatic flow">
          Clear pins
        </button>
        <button class="cal-btn ghost" type="button" (click)="fitDay()"
          appTooltip="Extend the day until every queued task fits">
          Fit day
        </button>
      </div>
    </div>

    <div class="cal-toolbar">
      <div class="date-nav">
        <button class="nav-btn" type="button" (click)="shiftDay(-1)" aria-label="Previous day">‹</button>
        <button class="nav-btn today-btn" type="button" [class.active]="isToday()" (click)="goToday()">Today</button>
        <button class="nav-btn" type="button" (click)="shiftDay(1)" aria-label="Next day">›</button>
      </div>
      <input class="date-input" type="date" [value]="selectedDate()" (change)="onDateInput($event)" aria-label="Pick a date">
      <span class="day-title">{{ longDate() }}</span>
      <div class="day-window">
        <span class="window-label">Day window</span>
        <input type="time" step="300" [value]="startTime()" (change)="onDayStart($event)" aria-label="Day starts at">
        <span class="dash">–</span>
        <input type="time" step="300" [value]="endTime()" (change)="onDayEnd($event)" aria-label="Day ends at">
      </div>
    </div>

    <div class="week-strip">
      @for (day of weekStrip(); track day.date) {
        <button
          class="week-day"
          type="button"
          [class.active]="day.date === selectedDate()"
          [class.is-today]="day.isToday"
          (click)="selectDate(day.date)"
        >
          <span class="wd-name">{{ day.weekday }}</span>
          <span class="wd-num">{{ day.dayNumber }}</span>
          <span class="wd-meta">{{ day.tasks }} task{{ day.tasks === 1 ? '' : 's' }}</span>
          <span class="wd-focus">{{ day.focusLabel }}</span>
        </button>
      }
    </div>

    <div class="cal-layout">
      <!-- ── Priority queue ─────────────────────────────────────────────── -->
      <aside class="queue-rail">
        <div class="rail-head">
          <div class="rail-head-row">
            <span class="rail-title">Priority queue</span>
            <button
              type="button"
              class="rail-collapse"
              (click)="toggleAllGroups()"
              [appTooltip]="allGroupsCollapsed() ? 'Expand every quadrant in the queue' : 'Collapse every quadrant in the queue'"
            >
              {{ allGroupsCollapsed() ? 'Expand all' : 'Collapse all' }}
            </button>
          </div>
          <span class="rail-hint">drag a task onto the timeline to place it</span>
        </div>
        <div class="rail-scroll">
          @for (group of queueGroups(); track group.id) {
            <section class="rail-group" [class.is-collapsed]="isGroupCollapsed(group.id)" [style.--q-color]="group.color">
              <button
                type="button"
                class="rail-group-head"
                (click)="toggleGroup(group.id)"
                [attr.aria-expanded]="!isGroupCollapsed(group.id)"
                [attr.aria-label]="(isGroupCollapsed(group.id) ? 'Expand ' : 'Collapse ') + group.label"
              >
                <svg class="chevron" [class.open]="!isGroupCollapsed(group.id)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="9,6 15,12 9,18" />
                </svg>
                <span class="dot"></span>
                <span class="group-label">{{ group.label }}</span>
                @if (isGroupCollapsed(group.id)) {
                  <span class="group-summary">{{ group.items.length }} · {{ group.focusLabel }}</span>
                } @else {
                  <span class="group-count">{{ group.items.length }}</span>
                }
              </button>
              @if (!isGroupCollapsed(group.id)) {
                @for (item of group.items; track item.task.id) {
                  <article
                    class="rail-card"
                    [class.pinned]="item.pinned"
                    [class.dragging]="dragTaskId() === item.task.id"
                    (pointerdown)="onItemPointerDown($event, item.task)"
                  >
                    <span class="seq">{{ item.seq }}</span>
                    <div class="rail-body">
                      <span class="rail-task" [appTooltip]="item.task.title">{{ item.task.title }}</span>
                      <span class="rail-meta">
                        <span>{{ item.pomodoros }}× pomodoro</span>
                        <span class="sep">·</span>
                        <span class="at">{{ item.atLabel }}</span>
                      </span>
                    </div>
                    <div class="rail-actions">
                      <button type="button" [disabled]="item.isFirst" aria-label="Move earlier" (click)="reorder(item.task, -1, $event)">↑</button>
                      <button type="button" [disabled]="item.isLast" aria-label="Move later" (click)="reorder(item.task, 1, $event)">↓</button>
                      <button type="button" [class.on]="item.pinned" aria-label="Pin or unpin"
                        [appTooltip]="item.pinned ? 'Pinned — click to return to the automatic flow' : 'Pin to this time'"
                        (click)="togglePin(item.task, $event)">📌</button>
                    </div>
                  </article>
                }
                @if (group.items.length === 0) {
                  <p class="rail-empty">Nothing queued in this quadrant</p>
                }
              }
            </section>
          }

          @if (unassignedItems().length) {
            <section class="rail-group unassigned-group" [class.is-collapsed]="isGroupCollapsed('unassigned')">
              <button
                type="button"
                class="rail-group-head"
                (click)="toggleGroup('unassigned')"
                [attr.aria-expanded]="!isGroupCollapsed('unassigned')"
                [attr.aria-label]="(isGroupCollapsed('unassigned') ? 'Expand ' : 'Collapse ') + 'Unassigned'"
              >
                <svg class="chevron" [class.open]="!isGroupCollapsed('unassigned')" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="9,6 15,12 9,18" />
                </svg>
                <span class="dot"></span>
                <span class="group-label">Unassigned</span>
                <span class="group-count">{{ unassignedItems().length }}</span>
              </button>
              @if (!isGroupCollapsed('unassigned')) {
                @for (item of unassignedItems(); track item.task.id) {
                  <article class="rail-card" [class.pinned]="item.pinned"
                    [class.dragging]="dragTaskId() === item.task.id"
                    (pointerdown)="onItemPointerDown($event, item.task)">
                    <span class="seq muted">–</span>
                    <div class="rail-body">
                      <span class="rail-task" [appTooltip]="item.task.title">{{ item.task.title }}</span>
                      <span class="rail-meta"><span>{{ item.atLabel }}</span></span>
                    </div>
                    <div class="rail-actions">
                      <button type="button" (click)="assignToQuadrant(item.task, $event)" appTooltip="Put in Q1 · Do First">Q1</button>
                    </div>
                  </article>
                }
                <p class="rail-note">Tasks join the automatic plan once they are in a quadrant.</p>
              }
            </section>
          }
        </div>
        @if (overflow().length) {
          <div class="rail-warning">
            <strong>{{ overflow().length }} task{{ overflow().length === 1 ? '' : 's' }}</strong> don't fit in the day window.
            <button type="button" (click)="fitDay()">Fit day</button>
          </div>
        }
      </aside>

      <!-- ── Timeline ───────────────────────────────────────────────────── -->
      <section class="timeline">
        <header class="timeline-head">
          <div class="summary">
            <span class="chip">{{ totals().tasks }} scheduled</span>
            <span class="chip accent">{{ duration(totals().focusMinutes) }} focus</span>
            <span class="chip cyan">{{ totals().pomodoros }} pomodoros</span>
            <span class="chip muted">{{ totals().breaks }} breaks · {{ duration(totals().breakMinutes) }}</span>
          </div>
        </header>

        <div class="timeline-scroll">
          <div class="gutter">
            @for (hour of hourMarks(); track hour) {
              <div class="hour-cell" [style.height.px]="pxPerHour()"><span>{{ hourLabel(hour) }}</span></div>
            }
          </div>

          <div
            #grid
            class="grid"
            [style.height.px]="gridHeight()"
            [class.drop-active]="dragTaskId() !== null"
            (click)="onGridClick($event)"
          >
            @for (hour of hourMarks(); track hour) {
              <div class="hour-line" [style.top.px]="minuteToPx(hour * 60)"></div>
            }

            @for (item of layout(); track item.block.id) {
              @if (item.block.kind === 'focus') {
                <article
                  class="ev focus"
                  [class.pinned]="item.block.pinned"
                  [class.continued]="item.block.continued"
                  [class.multi]="item.block.taskIds.length > 1"
                  [class.selected]="panelBlockId() === item.block.id"
                  [class.dragging]="isDraggingBlock(item.block)"
                  [class.compact]="item.height < 52"
                  [style.top.px]="blockTop(item)"
                  [style.height.px]="item.height"
                  [style.left.%]="item.left"
                  [style.width.%]="item.width"
                  [style.background]="'linear-gradient(135deg, ' + item.tint + ', rgba(14, 12, 30, 0.88))'"
                  [style.border-color]="item.stroke"
                  [style.border-left-color]="item.color"
                  (pointerdown)="onBlockPointerDown($event, item)"
                  (click)="openPanel(item.block, $event)"
                >
                  <div class="ev-head">
                    <span class="ev-time">{{ formatMinute(item.block.startMin) }}–{{ formatMinute(item.block.endMin) }}</span>
                    <span class="ev-badges">
                      @if (item.block.pinned) { <span class="badge pin">pinned</span> }
                      @if (item.block.continued) { <span class="badge">cont.</span> }
                    </span>
                  </div>
                  @for (task of item.tasks; track task.id) {
                    <div class="ev-task">
                      <button class="ev-check" type="button" (click)="complete(task, $event)"
                        [attr.aria-label]="'Mark ' + task.title + ' complete'"></button>
                      <span class="ev-title" [appTooltip]="task.title">{{ task.title }}</span>
                    </div>
                  }
                  <span class="ev-resize" (pointerdown)="onResizePointerDown($event, item)"
                    appTooltip="Drag to add or remove pomodoros"></span>
                </article>
              } @else {
                <div
                  class="ev rest"
                  [class.long]="item.block.kind === 'long-break'"
                  [style.top.px]="item.top"
                  [style.height.px]="item.height"
                  [style.left.%]="item.left"
                  [style.width.%]="item.width"
                  [appTooltip]="breakLabel(item.block) + ' — reserved automatically'"
                >
                  @if (item.height >= 22) {
                    <span class="rest-label">{{ item.block.kind === 'long-break' ? 'Long break' : 'Short break' }}</span>
                    <span class="rest-time">{{ duration(item.block.endMin - item.block.startMin) }}</span>
                  }
                </div>
              }
            }

            @if (dragPreviewTop() !== null) {
              <div class="drop-hint" [style.top.px]="dragPreviewTop()!">
                <span>{{ formatMinute(dragPreviewStart()!) }}</span>
              </div>
            }

            @if (nowTop() !== null) {
              <div class="now-line" [style.top.px]="nowTop()!"><span class="now-dot"></span></div>
            }
          </div>
        </div>
      </section>

      <!-- ── Slot panel ─────────────────────────────────────────────────── -->
      @if (panel(); as target) {
        <aside class="slot-panel">
          <header class="panel-head">
            <div>
              <span class="panel-time">{{ formatMinute(target.startMin) }}</span>
              <span class="panel-sub">{{ panelSubtitle() }}</span>
            </div>
            <button type="button" class="panel-close" (click)="closePanel()" aria-label="Close">✕</button>
          </header>

          @if (panelBreak(); as brk) {
            <p class="panel-note">
              {{ brk.kind === 'long-break' ? 'Long break' : 'Short break' }} ({{ duration(brk.endMin - brk.startMin) }})
              is reserved automatically from your pomodoro settings. Breaks are never filled with work.
            </p>
          } @else {
            @if (panelTasks().length) {
              <div class="panel-tasks">
                @for (task of panelTasks(); track task.id) {
                  <div class="panel-task" [class.done]="task.status === 'done'">
                    <div class="panel-task-head">
                      <button class="ev-check" type="button" (click)="complete(task, $event)"
                        [attr.aria-label]="'Mark ' + task.title + ' complete'"></button>
                      <span class="panel-task-title" [appTooltip]="task.title">{{ task.title }}</span>
                    </div>
                    <div class="panel-task-meta">
                      <span
                        class="q-chip"
                        [style.background]="quadrantTint(task)"
                        [style.color]="quadrantColor(task)"
                      >{{ quadrantLabel(task) }}</span>
                      <span class="meta-text">{{ pomodoros(task.id) }}× pomodoro · {{ taskTimeLabel(task) }}</span>
                    </div>
                    <div class="panel-task-actions">
                      <button type="button" (click)="nudge(task, -5, $event)" appTooltip="Move 5 minutes earlier">−5 min</button>
                      <button type="button" (click)="nudge(task, 5, $event)" appTooltip="Move 5 minutes later">+5 min</button>
                      <button type="button" (click)="bumpPomodoros(task, 1, $event)" appTooltip="Add a pomodoro">+1 pomo</button>
                      <button type="button" (click)="bumpPomodoros(task, -1, $event)" appTooltip="Remove a pomodoro" [disabled]="pomodoros(task.id) <= 1">−1 pomo</button>
                      <button type="button" [class.on]="isPinned(task.id)" (click)="togglePin(task, $event)"
                        appTooltip="Pin or unpin">{{ isPinned(task.id) ? 'Unpin' : 'Pin' }}</button>
                      <button type="button" class="danger" (click)="unschedule(task, $event)" appTooltip="Take off the timeline">Remove</button>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <p class="panel-note">This slot is free. Add a task below or drag one from the queue.</p>
            }

            <div class="panel-add">
              <h4>Add to this slot</h4>
              <input
                class="panel-search"
                type="search"
                placeholder="Search tasks…"
                [value]="search()"
                (input)="onSearch($event)"
                aria-label="Search tasks to add"
              >
              <div class="panel-candidates">
                @for (task of candidates(); track task.id) {
                  <button type="button" class="candidate" (click)="addExisting(task, target.startMin)">
                    <span class="cand-title" [appTooltip]="task.title">{{ task.title }}</span>
                    <span class="cand-meta">{{ quadrantLabel(task) }}</span>
                  </button>
                }
                @if (candidates().length === 0) {
                  <p class="panel-note small">No matching tasks.</p>
                }
              </div>

              <div class="panel-new">
                <input
                  class="panel-search"
                  type="text"
                  placeholder="New task title…"
                  [value]="newTitle()"
                  [attr.maxlength]="titleMax"
                  (input)="onNewTitle($event)"
                  (keydown.enter)="createTask(target.startMin)"
                  aria-label="New task title"
                >
                <div class="panel-new-row">
                  <select [value]="newPomodoros()" (change)="onNewPomodoros($event)" aria-label="Pomodoros for the new task">
                    @for (n of pomodoroChoices; track n) {
                      <option [value]="n">{{ n }}× pomodoro</option>
                    }
                  </select>
                  <button type="button" class="cal-btn primary" (click)="createTask(target.startMin)">Add</button>
                </div>
                <p class="panel-hint">
                  A new task joins {{ slotQuadrantLabel() }} and is scheduled straight away
                  (titles up to {{ titleMax }} characters).
                </p>
              </div>
            </div>

            <footer class="panel-foot">
              <span class="panel-hint">Drag a block to re-time it · drag its bottom edge to add or remove pomodoros</span>
            </footer>
          }
        </aside>
      }
    </div>

    @if (dragGhost(); as ghost) {
      <div class="drag-ghost" [style.left.px]="ghost.x" [style.top.px]="ghost.y">{{ ghost.title }}</div>
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

    .page-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 12px; flex-wrap: wrap; margin-bottom: 10px;
    }
    .page-title { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.5px; }
    .page-subtitle { color: var(--color-text-muted); margin-top: 4px; font-size: 0.8rem; }
    .header-actions { display: flex; align-items: center; gap: 8px; }

    .cal-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 12px; border-radius: 10px; font-size: 0.75rem; font-weight: 600;
      border: 1px solid var(--glass-border); background: var(--glass-bg);
      color: var(--color-text-secondary); cursor: pointer; transition: all 0.2s;
    }
    .cal-btn:hover:not(:disabled) { color: var(--color-text-primary); border-color: rgba(139, 92, 246, 0.35); }
    .cal-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .cal-btn.primary {
      background: rgba(139, 92, 246, 0.18); border-color: rgba(139, 92, 246, 0.45);
      color: var(--color-text-primary);
    }

    .cal-toolbar {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      padding: 8px 12px; border-radius: 12px; margin-bottom: 8px;
      background: var(--glass-bg); border: 1px solid var(--glass-border);
    }
    .date-nav { display: flex; align-items: center; gap: 4px; }
    .nav-btn {
      min-width: 30px; height: 28px; padding: 0 8px; border-radius: 8px; cursor: pointer;
      background: transparent; border: 1px solid transparent; color: var(--color-text-secondary);
      font-size: 0.9rem; line-height: 1; transition: all 0.2s;
    }
    .nav-btn:hover { background: rgba(139, 92, 246, 0.12); color: var(--color-text-primary); }
    .today-btn { font-size: 0.72rem; font-weight: 700; }
    .today-btn.active { border-color: rgba(139, 92, 246, 0.4); color: var(--color-text-primary); }
    .date-input {
      background: rgba(255, 255, 255, 0.04); border: 1px solid var(--glass-border);
      color: var(--color-text-secondary); border-radius: 8px; padding: 5px 8px; font-size: 0.72rem;
    }
    .day-title { font-size: 0.85rem; font-weight: 700; color: var(--color-text-primary); }
    .day-window {
      display: flex; align-items: center; gap: 6px; margin-left: auto;
      font-size: 0.7rem; color: var(--color-text-muted);
    }
    .day-window input[type='time'] {
      background: rgba(255, 255, 255, 0.04); border: 1px solid var(--glass-border);
      color: var(--color-text-secondary); border-radius: 8px; padding: 4px 6px; font-size: 0.72rem;
    }
    .window-label { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.62rem; }
    .dash { opacity: 0.6; }

    .week-strip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-bottom: 10px; }
    .week-day {
      display: flex; flex-direction: column; align-items: center; gap: 1px;
      padding: 6px 4px; border-radius: 10px; cursor: pointer;
      background: var(--glass-bg); border: 1px solid var(--glass-border);
      color: var(--color-text-secondary); transition: all 0.2s;
    }
    .week-day:hover { border-color: rgba(139, 92, 246, 0.35); color: var(--color-text-primary); }
    .week-day.active { border-color: rgba(139, 92, 246, 0.6); background: rgba(139, 92, 246, 0.12); color: var(--color-text-primary); }
    .week-day.is-today .wd-num { color: var(--color-accent-primary); }
    .wd-name { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.75; }
    .wd-num { font-size: 0.95rem; font-weight: 800; }
    .wd-meta, .wd-focus { font-size: 0.6rem; opacity: 0.7; }

    .cal-layout { display: flex; gap: 10px; align-items: stretch; flex: 1; min-height: 0; }

    /* ── Queue rail ───────────────────────────────────────────────────── */
    .queue-rail {
      width: 268px; flex-shrink: 0; display: flex; flex-direction: column;
      background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 14px;
      overflow: hidden;
    }
    .rail-head { padding: 10px 12px 6px; border-bottom: 1px solid var(--glass-border); flex-shrink: 0; }
    .rail-head-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .rail-title { font-size: 0.78rem; font-weight: 800; color: var(--color-text-primary); }
    .rail-collapse {
      background: none; border: 1px solid var(--glass-border); border-radius: 7px;
      color: var(--color-text-muted); font-size: 0.6rem; padding: 2px 7px; cursor: pointer;
      white-space: nowrap; transition: all 0.2s;
    }
    .rail-collapse:hover { color: var(--color-text-primary); border-color: rgba(139, 92, 246, 0.4); }
    .rail-hint { display: block; font-size: 0.62rem; color: var(--color-text-muted); margin-top: 2px; }
    .rail-scroll {
      flex: 1; min-height: 0; overflow-y: auto; padding: 8px;
      scrollbar-width: thin; scrollbar-color: rgba(139,92,246,0.35) transparent;
    }
    .rail-group { margin-bottom: 10px; }
    .rail-group-head {
      display: flex; align-items: center; gap: 6px; width: 100%;
      padding: 5px 6px; margin-bottom: 4px; border-radius: 8px; cursor: pointer;
      background: rgba(255, 255, 255, 0.03); border: 1px solid var(--glass-border);
      font-size: 0.68rem; font-weight: 700; color: var(--color-text-secondary);
      text-transform: uppercase; letter-spacing: 0.06em; text-align: left;
      transition: all 0.2s;
    }
    .rail-group-head:hover { color: var(--color-text-primary); border-color: rgba(139, 92, 246, 0.35); }
    .chevron { flex-shrink: 0; color: var(--color-text-muted); transition: transform 0.2s ease; }
    .chevron.open { transform: rotate(90deg); }
    .rail-group.is-collapsed .rail-group-head { background: rgba(139, 92, 246, 0.08); }
    .rail-group-head .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--q-color, var(--color-accent-primary)); flex-shrink: 0; }
    .unassigned-group .dot { background: var(--color-text-muted); }
    .group-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .group-summary {
      margin-left: auto; font-size: 0.58rem; font-weight: 600; letter-spacing: 0;
      color: var(--color-text-muted); text-transform: none; white-space: nowrap;
    }
    .group-count {
      margin-left: auto; font-size: 0.62rem; padding: 1px 6px; border-radius: 999px;
      background: rgba(255, 255, 255, 0.06); color: var(--color-text-muted);
    }
    .rail-card {
      display: flex; align-items: center; gap: 8px; padding: 6px 8px; margin-bottom: 4px;
      border-radius: 10px; cursor: grab; touch-action: none;
      user-select: none; -webkit-user-select: none;
      background: rgba(255, 255, 255, 0.03);
      border-left: 3px solid var(--q-color, var(--color-accent-primary));
      transition: background 0.15s, transform 0.15s;
    }
    .rail-card:hover { background: rgba(139, 92, 246, 0.1); }
    .rail-card.pinned { box-shadow: inset 0 0 0 1px rgba(139, 92, 246, 0.4); }
    .rail-card.dragging { opacity: 0.45; cursor: grabbing; }
    .seq {
      width: 18px; height: 18px; flex-shrink: 0; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 0.6rem; font-weight: 800; color: var(--color-text-primary);
      background: rgba(139, 92, 246, 0.2);
    }
    .seq.muted { background: rgba(255, 255, 255, 0.06); color: var(--color-text-muted); }
    .rail-body { flex: 1; min-width: 0; }
    .rail-task {
      display: block; font-size: 0.74rem; font-weight: 600; color: var(--color-text-primary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .rail-meta { display: flex; gap: 4px; font-size: 0.6rem; color: var(--color-text-muted); }
    .rail-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.15s; }
    .rail-card:hover .rail-actions, .rail-card:focus-within .rail-actions { opacity: 1; }
    .rail-actions button {
      width: 20px; height: 20px; border-radius: 6px; cursor: pointer; font-size: 0.62rem;
      background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border);
      color: var(--color-text-secondary); display: flex; align-items: center; justify-content: center;
    }
    .rail-actions button:hover:not(:disabled) { color: var(--color-text-primary); border-color: rgba(139, 92, 246, 0.4); }
    .rail-actions button:disabled { opacity: 0.3; cursor: not-allowed; }
    .rail-actions button.on { background: rgba(139, 92, 246, 0.25); border-color: rgba(139, 92, 246, 0.5); }
    .rail-empty, .rail-note { font-size: 0.62rem; color: var(--color-text-muted); padding: 2px 4px 6px; }
    .rail-warning {
      padding: 8px 10px; font-size: 0.66rem; color: #fbbf24;
      border-top: 1px solid var(--glass-border); background: rgba(251, 191, 36, 0.08);
    }
    .rail-warning button {
      margin-left: 6px; background: none; border: none; color: #fbbf24;
      text-decoration: underline; cursor: pointer; font-size: 0.66rem;
    }

    /* ── Timeline ─────────────────────────────────────────────────────── */
    .timeline {
      flex: 1; min-width: 0; display: flex; flex-direction: column;
      background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 14px;
      overflow: hidden;
    }
    .timeline-head { padding: 8px 12px; border-bottom: 1px solid var(--glass-border); }
    .summary { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip {
      font-size: 0.63rem; padding: 3px 8px; border-radius: 999px;
      background: rgba(255, 255, 255, 0.05); color: var(--color-text-secondary);
      border: 1px solid var(--glass-border);
    }
    .chip.accent { color: #c4b5fd; border-color: rgba(139, 92, 246, 0.35); }
    .chip.cyan { color: #67e8f9; border-color: rgba(6, 182, 212, 0.3); }
    .chip.muted { color: var(--color-text-muted); }

    .timeline-scroll { flex: 1; overflow-y: auto; display: flex; position: relative; }
    .gutter { width: 58px; flex-shrink: 0; border-right: 1px solid var(--glass-border); }
    .hour-cell {
      position: relative; box-sizing: border-box;
      font-size: 0.6rem; color: var(--color-text-muted); text-align: right; padding-right: 8px;
    }
    .hour-cell span { position: relative; top: -6px; }
    .grid { position: relative; flex: 1; min-width: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
    .grid.drop-active { background: rgba(139, 92, 246, 0.04); }
    .hour-line { position: absolute; left: 0; right: 0; border-top: 1px solid rgba(255, 255, 255, 0.05); }
    .hour-line:nth-child(even) { border-top-color: rgba(255, 255, 255, 0.03); }

    .ev {
      position: absolute; box-sizing: border-box; overflow: hidden;
      border-radius: 8px; padding: 4px 6px; cursor: grab; touch-action: none;
      user-select: none; -webkit-user-select: none;
      background: rgba(14, 12, 30, 0.88);
      border: 1px solid rgba(139, 92, 246, 0.4);
      border-left: 4px solid var(--color-accent-primary);
      transition: box-shadow 0.15s, transform 0.05s;
    }
    .ev.focus:hover { box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35); }
    .ev.focus.selected { box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.6); }
    .ev.focus.dragging { opacity: 0.8; cursor: grabbing; z-index: 40; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5); }
    .ev.focus.continued { border-left-style: dashed; }
    .ev-head { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
    .ev-time { font-size: 0.6rem; font-weight: 700; color: var(--color-text-primary); opacity: 0.9; }
    .ev-badges { display: flex; gap: 3px; }
    .badge {
      font-size: 0.52rem; padding: 0 4px; border-radius: 999px; text-transform: uppercase;
      background: rgba(255, 255, 255, 0.12); color: var(--color-text-secondary);
    }
    .badge.pin { background: rgba(139, 92, 246, 0.35); color: #ede9fe; }
    .ev-task { display: flex; align-items: center; gap: 5px; margin-top: 2px; min-width: 0; }
    .ev-title {
      font-size: 0.68rem; font-weight: 600; color: var(--color-text-primary);
      flex: 1; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ev-check {
      width: 12px; height: 12px; flex-shrink: 0; border-radius: 50%; cursor: pointer;
      border: 1.5px solid rgba(255, 255, 255, 0.4); background: transparent; padding: 0;
    }
    .ev-check:hover { border-color: var(--color-accent-primary); background: rgba(139, 92, 246, 0.25); }
    .ev-resize {
      position: absolute; left: 0; right: 0; bottom: 0; height: 6px;
      cursor: ns-resize; background: transparent;
    }
    .ev-resize:hover { background: rgba(139, 92, 246, 0.45); }

    .ev.rest {
      cursor: default; padding: 0 6px;
      background: repeating-linear-gradient(45deg, rgba(6, 182, 212, 0.14) 0 6px, rgba(6, 182, 212, 0.06) 6px 12px);
      border: 1px dashed rgba(6, 182, 212, 0.35); border-radius: 6px;
      display: flex; align-items: center; gap: 6px;
    }
    .ev.rest.long {
      background: repeating-linear-gradient(45deg, rgba(52, 211, 153, 0.16) 0 6px, rgba(52, 211, 153, 0.07) 6px 12px);
      border-color: rgba(52, 211, 153, 0.4);
    }
    .rest-label { font-size: 0.58rem; font-weight: 700; color: #67e8f9; text-transform: uppercase; letter-spacing: 0.05em; }
    .ev.rest.long .rest-label { color: #6ee7b7; }
    .rest-time { font-size: 0.56rem; color: var(--color-text-muted); }

    .drop-hint {
      position: absolute; left: 0; right: 0; height: 0; z-index: 30;
      border-top: 2px dashed rgba(139, 92, 246, 0.9);
    }
    .drop-hint span {
      position: absolute; right: 4px; top: -9px; font-size: 0.58rem; font-weight: 700;
      background: rgba(139, 92, 246, 0.9); color: #fff; padding: 1px 5px; border-radius: 5px;
    }
    .now-line { position: absolute; left: 0; right: 0; border-top: 2px solid #f87171; z-index: 20; }
    .now-dot {
      position: absolute; left: -5px; top: -5px; width: 8px; height: 8px; border-radius: 50%;
      background: #f87171; box-shadow: 0 0 8px rgba(248, 113, 113, 0.8);
    }

    /* ── Slot panel ───────────────────────────────────────────────────── */
    .slot-panel {
      flex: 0 0 330px; width: 330px; display: flex; flex-direction: column;
      background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 14px;
      overflow: hidden;
    }
    .panel-head {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
      padding: 10px 12px; border-bottom: 1px solid var(--glass-border); flex-shrink: 0;
    }
    .panel-time { font-size: 0.95rem; font-weight: 800; color: var(--color-text-primary); }
    .panel-sub { display: block; font-size: 0.62rem; color: var(--color-text-muted); }
    .panel-close {
      background: none; border: none; color: var(--color-text-muted); cursor: pointer;
      font-size: 0.8rem; flex-shrink: 0; padding: 0 2px; line-height: 1;
    }
    .panel-close:hover { color: var(--color-text-primary); }
    .panel-tasks {
      padding: 8px; border-bottom: 1px solid var(--glass-border);
      flex: 0 1 auto; min-height: 0; overflow-y: auto;
      scrollbar-width: thin; scrollbar-color: rgba(139,92,246,0.35) transparent;
    }
    /* Rows are stacked so long titles and the action buttons can never collide. */
    .panel-task {
      display: flex; flex-direction: column; gap: 5px;
      padding: 8px; border-radius: 10px; margin-bottom: 6px;
      background: rgba(255, 255, 255, 0.03); border: 1px solid var(--glass-border);
    }
    .panel-task:last-child { margin-bottom: 0; }
    .panel-task.done .panel-task-title { text-decoration: line-through; opacity: 0.6; }
    .panel-task-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
    /* Long titles are clamped to two lines; hover shows the whole task. */
    .panel-task-title {
      font-size: 0.72rem; font-weight: 600; color: var(--color-text-primary);
      min-width: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden; overflow-wrap: anywhere;
    }
    .panel-task-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .meta-text { font-size: 0.6rem; color: var(--color-text-muted); }
    .q-chip {
      font-size: 0.56rem; font-weight: 700; padding: 1px 7px; border-radius: 999px;
      text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;
    }
    .panel-task-actions { display: flex; flex-wrap: wrap; gap: 4px; }
    .panel-task-actions button {
      padding: 3px 7px; border-radius: 7px; font-size: 0.58rem; cursor: pointer;
      background: rgba(255, 255, 255, 0.05); border: 1px solid var(--glass-border);
      color: var(--color-text-secondary); white-space: nowrap;
    }
    .panel-task-actions button:hover:not(:disabled) { color: var(--color-text-primary); border-color: rgba(139, 92, 246, 0.4); }
    .panel-task-actions button:disabled { opacity: 0.35; cursor: not-allowed; }
    .panel-task-actions button.on { background: rgba(139, 92, 246, 0.25); }
    .panel-task-actions button.danger:hover { color: #fca5a5; border-color: rgba(248, 113, 113, 0.4); }
    .panel-note { padding: 10px 12px; font-size: 0.66rem; color: var(--color-text-muted); line-height: 1.5; }
    .panel-note.small { padding: 4px 2px; }
    .panel-add {
      padding: 8px 10px; flex: 1 1 auto; min-height: 0; overflow-y: auto;
      scrollbar-width: thin; scrollbar-color: rgba(139,92,246,0.35) transparent;
    }
    .panel-add h4 {
      font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--color-text-muted); margin-bottom: 6px;
    }
    .panel-search {
      width: 100%; box-sizing: border-box; padding: 6px 8px; margin-bottom: 6px;
      background: rgba(255, 255, 255, 0.04); border: 1px solid var(--glass-border);
      border-radius: 8px; color: var(--color-text-primary); font-size: 0.7rem;
    }
    .panel-search::placeholder { color: var(--color-text-muted); }
    .panel-candidates { max-height: 160px; overflow-y: auto; margin-bottom: 8px; }
    .candidate {
      display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%;
      padding: 5px 7px; margin-bottom: 3px; border-radius: 8px; cursor: pointer; text-align: left;
      background: rgba(255, 255, 255, 0.03); border: 1px solid transparent;
      color: var(--color-text-secondary); font-size: 0.68rem;
    }
    .candidate:hover { border-color: rgba(139, 92, 246, 0.4); color: var(--color-text-primary); }
    .cand-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cand-meta { font-size: 0.58rem; color: var(--color-text-muted); flex-shrink: 0; }
    .panel-new-row { display: flex; gap: 6px; align-items: center; }
    .panel-new-row select {
      flex: 1; min-width: 0; padding: 5px; border-radius: 8px; font-size: 0.62rem;
      background: rgba(255, 255, 255, 0.04); border: 1px solid var(--glass-border);
      color: var(--color-text-secondary);
    }
    .panel-foot { padding: 8px 10px; border-top: 1px solid var(--glass-border); flex-shrink: 0; }
    .panel-hint { font-size: 0.58rem; color: var(--color-text-muted); line-height: 1.5; }

    .drag-ghost {
      position: fixed; z-index: 9999; pointer-events: none;
      padding: 5px 9px; border-radius: 8px; font-size: 0.7rem; font-weight: 600;
      background: rgba(139, 92, 246, 0.95); color: #fff;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* Narrow windows: the slot panel becomes a drawer over the timeline instead
       of squeezing it (and never overlaps the queue rail). */
    @media (max-width: 1360px) {
      .cal-layout { position: relative; }
      .slot-panel {
        position: absolute; top: 6px; right: 6px; bottom: 6px;
        width: 330px; max-width: calc(100% - 12px);
        z-index: 40; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
      }
    }
  `],
})
export class CalendarComponent implements OnInit, OnDestroy {
  protected readonly schedule = inject(ScheduleService);
  private readonly taskService = inject(TaskService);

  protected readonly pomodoroChoices = [1, 2, 3, 4, 5, 6];
  protected readonly pxPerMinute = 1.8;
  /** Shared task-title limit, applied to the panel's new-task input. */
  protected readonly titleMax = TASK_TITLE_MAX_LENGTH;

  private readonly gridRef = viewChild<ElementRef<HTMLElement>>('grid');
  private readonly clock = signal(new Date());
  private timerId: ReturnType<typeof setInterval> | null = null;

  // Interaction state
  private drag: DragState | null = null;
  private resize: ResizeState | null = null;
  private suppressClick = false;

  protected readonly dragTaskId = signal<string | null>(null);
  protected readonly dragGhost = signal<{ x: number; y: number; title: string } | null>(null);
  protected readonly dragPreviewStart = signal<MinuteOfDay | null>(null);
  protected readonly panel = signal<PanelState | null>(null);
  protected readonly search = signal('');
  protected readonly newTitle = signal('');
  protected readonly newPomodoros = signal(1);
  protected readonly collapsedGroups = signal<Record<string, boolean>>(readCollapsedGroups());

  // ── Derived state ─────────────────────────────────────────────────────────
  protected readonly selectedDate = this.schedule.selectedDate;
  protected readonly focusMinutes = this.schedule.focusMinutes;
  protected readonly pomodorosBeforeLongBreak = this.schedule.pomodorosBeforeLongBreak;

  protected readonly daySchedule = computed<DaySchedule>(() => this.schedule.schedule());
  protected readonly totals = computed(() => this.daySchedule().totals);
  protected readonly overflow = computed(() => this.daySchedule().unscheduled);
  protected readonly hasPins = computed(() =>
    this.daySchedule().placements.some(placement => placement.pinned)
  );

  protected readonly startTime = computed(() => formatMinute(this.schedule.prefs().dayStart));
  protected readonly endTime = computed(() => formatMinute(this.schedule.prefs().dayEnd));
  protected readonly longDate = computed(() =>
    new Date(`${this.selectedDate()}T00:00:00Z`).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })
  );

  protected readonly isToday = computed(() => this.selectedDate() === dayKey(this.clock()));

  protected readonly weekStrip = computed(() =>
    this.schedule.weekDates().map(date => {
      const summary = this.schedule.summaryFor(date);
      const d = new Date(`${date}T00:00:00Z`);
      return {
        date,
        weekday: d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
        dayNumber: d.getUTCDate(),
        isToday: date === dayKey(this.clock()),
        tasks: summary.tasks,
        focusLabel: summary.focusMinutes ? formatDuration(summary.focusMinutes) : '—',
      };
    })
  );

  protected readonly queueGroups = computed(() => {
    const queue = this.schedule.queue();
    const placements = this.daySchedule().placements;

    return QUADRANT_ORDER.map(quadrant => {
      const items = queue.filter(item => item.quadrant === quadrant);
      const cards = items.map((item, position) => {
        const placement = placements.find(p => p.taskId === item.task.id);
        return {
          task: item.task,
          seq: item.index + 1,
          pomodoros: this.schedule.pomodorosOf(item.task.id),
          pinned: !!placement?.pinned,
          atLabel: placement
            ? `${formatMinute(placement.startMin)}–${formatMinute(placement.endMin)}`
            : 'auto',
          isFirst: position === 0,
          isLast: position === items.length - 1,
        };
      });
      const focusMinutes = cards.reduce((sum, card) => sum + card.pomodoros, 0) * this.schedule.focusMinutes();
      return {
        id: quadrant,
        label: QUADRANT_CONFIG[quadrant].label,
        color: QUADRANT_CONFIG[quadrant].color,
        items: cards,
        focusLabel: focusMinutes ? formatDuration(focusMinutes) : '—',
      };
    });
  });

  protected readonly unassignedItems = computed(() => {
    const placements = this.daySchedule().placements;
    return this.schedule.unassigned().map(task => {
      const placement = placements.find(p => p.taskId === task.id);
      return {
        task,
        pinned: !!placement?.pinned,
        atLabel: placement ? formatMinute(placement.startMin) : 'not scheduled',
      };
    });
  });

  protected readonly panelBlockId = computed(() => this.panel()?.blockId ?? null);

  protected readonly panelBlock = computed(() => {
    const target = this.panel();
    if (!target?.blockId) return null;
    const block = this.daySchedule().blocks.find(candidate => candidate.id === target.blockId);
    return block && block.kind === 'focus' ? block : null;
  });

  protected readonly panelBreak = computed(() => {
    const target = this.panel();
    if (!target?.blockId) return null;
    const block = this.daySchedule().blocks.find(candidate => candidate.id === target.blockId);
    return block && block.kind !== 'focus' ? (block as BreakBlock) : null;
  });

  protected readonly panelSubtitle = computed(() => {
    const brk = this.panelBreak();
    if (brk) return brk.kind === 'long-break' ? 'Long break · reserved' : 'Short break · reserved';
    const block = this.panelBlock();
    if (!block) return 'Free time';
    return `Focus block #${block.index} · ${formatDuration(block.endMin - block.startMin)}`;
  });

  protected readonly panelTasks = computed(() => {
    const block = this.panelBlock();
    if (block) {
      return block.taskIds
        .map(id => this.taskService.tasks().find(task => task.id === id))
        .filter((task): task is Task => !!task);
    }
    const target = this.panel();
    if (!target) return [];
    return this.daySchedule()
      .placements.filter(p => target.startMin >= p.startMin && target.startMin < p.endMin)
      .map(p => this.taskService.tasks().find(task => task.id === p.taskId))
      .filter((task): task is Task => !!task);
  });

  protected readonly candidates = computed(() => {
    const query = this.search().trim().toLowerCase();
    const inPanel = new Set(this.panelTasks().map(task => task.id));
    const scheduled = new Set(this.daySchedule().placements.map(p => p.taskId));

    return this.poolTasks()
      .filter(task => !inPanel.has(task.id))
      .filter(task => !query || task.title.toLowerCase().includes(query))
      .sort((a, b) => Number(scheduled.has(a.id)) - Number(scheduled.has(b.id)) || a.priority - b.priority)
      .slice(0, 30);
  });

  protected readonly hourMarks = computed(() => {
    const start = Math.floor(this.daySchedule().viewStartMin / 60);
    const end = Math.ceil(this.daySchedule().viewEndMin / 60);
    return Array.from({ length: Math.max(1, end - start) }, (_, i) => start + i);
  });

  protected readonly gridHeight = computed(
    () => (this.daySchedule().viewEndMin - this.daySchedule().viewStartMin) * this.pxPerMinute
  );

  protected readonly layout = computed<BlockLayout[]>(() => {
    const tasks = this.taskService.tasks();
    const nodes = this.daySchedule().blocks.map(block => ({
      block,
      start: block.startMin,
      end: block.endMin,
      column: 0,
      columns: 1,
    }));

    const columnEnds: number[] = [];
    for (const node of [...nodes].sort((a, b) => a.start - b.start || a.end - b.end)) {
      let column = columnEnds.findIndex(end => end <= node.start);
      if (column === -1) {
        column = columnEnds.length;
      }
      columnEnds[column] = node.end;
      node.column = column;
    }

    for (const node of nodes) {
      const overlapping = nodes.filter(other => other.start < node.end && other.end > node.start);
      node.columns = Math.max(1, ...overlapping.map(other => other.column + 1));
    }

    const viewStart = this.daySchedule().viewStartMin;
    const width = 100;

    return nodes
      .map(node => {
        const block = node.block;
        const blockTasks = block.kind === 'focus'
          ? block.taskIds
              .map(id => tasks.find(task => task.id === id))
              .filter((task): task is Task => !!task)
          : [];
        const first = blockTasks[0];
        const color = first?.quadrant ? QUADRANT_CONFIG[first.quadrant].color : '#8b5cf6';
        const rgb = hexToRgb(color);
        return {
          block,
          top: (block.startMin - viewStart) * this.pxPerMinute,
          height: Math.max(6, (block.endMin - block.startMin) * this.pxPerMinute),
          left: (node.column / node.columns) * width,
          width: width / node.columns,
          tasks: blockTasks,
          color,
          tint: `rgba(${rgb}, 0.24)`,
          stroke: `rgba(${rgb}, 0.55)`,
        };
      })
      .sort((a, b) => a.top - b.top);
  });

  protected readonly nowTop = computed(() => {
    if (!this.isToday()) return null;
    const now = this.clock();
    const minute = now.getHours() * 60 + now.getMinutes();
    const { viewStartMin, viewEndMin } = this.daySchedule();
    if (minute < viewStartMin || minute > viewEndMin) return null;
    return this.minuteToPx(minute);
  });

  protected readonly dragPreviewTop = computed(() => {
    const start = this.dragPreviewStart();
    if (start === null || this.dragTaskId() === null) return null;
    return this.minuteToPx(start);
  });

  constructor() {
    // Keep the "now" indicator and the date fresh without leaning on zone.js.
    this.timerId = setInterval(() => this.clock.set(new Date()), 30_000);
  }

  ngOnInit(): void {
    void this.init();
  }

  private async init(): Promise<void> {
    await this.schedule.load();
    await this.taskService.loadTasks();
    await this.taskService.dailyReset();
    await this.taskService.generateRecurringInstances();
    // Open on today once the stored plan and tasks are in.
    this.schedule.selectedDate.set(dayKey());
  }

  ngOnDestroy(): void {
    if (this.timerId !== null) clearInterval(this.timerId);
  }

  // ── Formatting helpers used by the template ───────────────────────────────
  protected readonly formatMinute = formatMinute;
  protected readonly duration = formatDuration;

  protected hourLabel(hour: number): string {
    return `${String(hour % 24).padStart(2, '0')}:00`;
  }

  protected minuteToPx(minute: number): number {
    return (minute - this.daySchedule().viewStartMin) * this.pxPerMinute;
  }

  protected pxPerHour(): number {
    return 60 * this.pxPerMinute;
  }

  protected breakLabel(block: ScheduleBlock): string {
    return block.kind === 'long-break' ? 'Long break' : 'Short break';
  }

  protected quadrantLabel(task: Task): string {
    return task.quadrant ? QUADRANT_CONFIG[task.quadrant].label : 'Unassigned';
  }

  protected quadrantColor(task: Task): string {
    return task.quadrant ? QUADRANT_CONFIG[task.quadrant].color : '#9ca3af';
  }

  protected quadrantTint(task: Task): string {
    return `rgba(${hexToRgb(this.quadrantColor(task))}, 0.16)`;
  }

  /** "09:00–09:50" for a task on the timeline, or a hint when it is not placed. */
  protected taskTimeLabel(task: Task): string {
    const placement = this.schedule.placementOf(task.id);
    if (!placement) return 'auto';
    return `${formatMinute(placement.startMin)}–${formatMinute(placement.endMin)}`;
  }

  protected pomodoros(taskId: string): number {
    return this.schedule.pomodorosOf(taskId);
  }

  protected isPinned(taskId: string): boolean {
    return !!this.schedule.placementOf(taskId)?.pinned;
  }

  protected isDraggingBlock(block: FocusBlock): boolean {
    return !!this.dragTaskId() && block.taskIds.includes(this.dragTaskId()!);
  }

  protected blockTop(item: BlockLayout): number {
    if (item.block.kind === 'focus' && this.isDraggingBlock(item.block)) {
      const preview = this.dragPreviewStart();
      const placement = this.schedule.placementOf(item.block.taskIds[0]);
      if (preview !== null && placement) {
        const offset = item.block.startMin - placement.startMin;
        return this.minuteToPx(preview + offset);
      }
    }
    return item.top;
  }

  private poolTasks(): Task[] {
    const day = this.schedule.selectedDate();
    const active = this.taskService.tasks().filter(task => task.status !== 'done');
    const forDay = active.filter(task =>
      task.deadline === day || task.createdAt.startsWith(day) || !!task.quadrant
    );
    return forDay.length ? forDay : active;
  }

  // ── Queue rail: fold quadrants away so long lists stay manageable ─────────
  protected isGroupCollapsed(id: string): boolean {
    return this.collapsedGroups()[id] === true;
  }

  protected toggleGroup(id: string): void {
    const next = { ...this.collapsedGroups(), [id]: !this.collapsedGroups()[id] };
    this.collapsedGroups.set(next);
    persistCollapsedGroups(next);
  }

  protected allGroupsCollapsed(): boolean {
    const state = this.collapsedGroups();
    return RAIL_GROUP_IDS.every(id => state[id] === true);
  }

  protected toggleAllGroups(): void {
    const collapse = !this.allGroupsCollapsed();
    const next: Record<string, boolean> = { ...this.collapsedGroups() };
    for (const id of RAIL_GROUP_IDS) next[id] = collapse;
    this.collapsedGroups.set(next);
    persistCollapsedGroups(next);
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  protected selectDate(date: string): void {
    this.schedule.selectedDate.set(date);
    this.closePanel();
  }

  protected shiftDay(delta: number): void {
    const current = new Date(`${this.selectedDate()}T00:00:00Z`);
    current.setUTCDate(current.getUTCDate() + delta);
    this.selectDate(dayKey(current));
  }

  protected goToday(): void {
    this.selectDate(dayKey());
  }

  protected onDateInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) this.selectDate(value);
  }

  protected onDayStart(event: Event): void {
    const parsed = parseTimeInput((event.target as HTMLInputElement).value);
    if (parsed !== null) void this.schedule.setPrefs({ dayStart: parsed });
  }

  protected onDayEnd(event: Event): void {
    const parsed = parseTimeInput((event.target as HTMLInputElement).value);
    if (parsed !== null) void this.schedule.setPrefs({ dayEnd: parsed });
  }

  protected clearPins(): void {
    void this.schedule.clearPins();
  }

  protected fitDay(): void {
    void this.schedule.fitDayToTasks();
  }

  // ── Queue actions ─────────────────────────────────────────────────────────
  protected async reorder(task: Task, delta: number, event: Event): Promise<void> {
    event.stopPropagation();
    const quadrant = task.quadrant;
    if (!quadrant) return;
    const ids = this.schedule.tasksInQuadrant(quadrant).map(item => item.id);
    const from = ids.indexOf(task.id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    await this.schedule.moveTaskToQuadrant(task.id, quadrant, to);
  }

  protected async togglePin(task: Task, event: Event): Promise<void> {
    event.stopPropagation();
    await this.schedule.togglePin(task.id);
  }

  protected async assignToQuadrant(task: Task, event: Event): Promise<void> {
    event.stopPropagation();
    await this.schedule.moveTaskToQuadrant(task.id, 'urgent-important', 0);
  }

  /** Quadrant of the slot's owning task, used for the read-only badge and new tasks. */
  private slotQuadrant(): TaskQuadrant {
    const owner = this.panelBlock()?.taskIds
      .map(id => this.taskService.tasks().find(task => task.id === id))
      .find((task): task is Task => !!task);
    return owner?.quadrant ?? 'urgent-important';
  }

  /** Move a task between quadrants straight from the slot panel. */
  protected slotQuadrantLabel(): string {
    return QUADRANT_CONFIG[this.slotQuadrant()].label;
  }

  protected async complete(task: Task, event: Event): Promise<void> {
    event.stopPropagation();
    await this.taskService.toggleStatus(task);
  }

  // ── Slot panel ────────────────────────────────────────────────────────────
  protected openPanel(block: FocusBlock, event: Event): void {
    event.stopPropagation();
    if (this.suppressClick) return;
    this.panel.set({ startMin: block.startMin, blockId: block.id });
    this.resetPanelInputs();
  }

  protected closePanel(): void {
    this.panel.set(null);
    this.search.set('');
    this.newTitle.set('');
  }

  private resetPanelInputs(): void {
    this.search.set('');
    this.newTitle.set('');
    this.newPomodoros.set(1);
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected onNewTitle(event: Event): void {
    this.newTitle.set((event.target as HTMLInputElement).value);
  }

  protected onNewPomodoros(event: Event): void {
    this.newPomodoros.set(Number((event.target as HTMLSelectElement).value) || 1);
  }

  protected async addExisting(task: Task, startMin: MinuteOfDay): Promise<void> {
    await this.schedule.pinTask(task.id, startMin);
    await this.schedule.applySequence(this.schedule.scheduledTaskIds());
    this.search.set('');
  }

  protected async createTask(startMin: MinuteOfDay): Promise<void> {
    const title = normalizeTaskTitle(this.newTitle());
    if (!title) return;
    const created = await this.taskService.createTask({
      title,
      quadrant: this.slotQuadrant(),
      deadline: this.selectedDate(),
      status: 'todo',
    });
    await this.schedule.pinTask(created.id, startMin, this.newPomodoros());
    await this.schedule.applySequence(this.schedule.scheduledTaskIds());
    this.newTitle.set('');
  }

  protected async nudge(task: Task, delta: number, event: Event): Promise<void> {
    event.stopPropagation();
    await this.schedule.nudgeTask(task.id, delta);
    await this.schedule.applySequence(this.schedule.scheduledTaskIds());
  }

  protected async bumpPomodoros(task: Task, delta: number, event: Event): Promise<void> {
    event.stopPropagation();
    const next = this.schedule.pomodorosOf(task.id) + delta;
    if (next < MIN_POMODOROS || next > MAX_POMODOROS) return;
    await this.schedule.setPomodoros(task.id, next);
  }

  protected async unschedule(task: Task, event: Event): Promise<void> {
    event.stopPropagation();
    await this.schedule.removeFromSlot(task.id);
  }

  // ── Timeline geometry ─────────────────────────────────────────────────────
  private gridRect(): DOMRect | null {
    return this.gridRef()?.nativeElement.getBoundingClientRect() ?? null;
  }

  private minuteAt(clientY: number): number {
    const rect = this.gridRect();
    if (!rect) return this.schedule.prefs().dayStart;
    return this.daySchedule().viewStartMin + (clientY - rect.top) / this.pxPerMinute;
  }

  /** Focus slot the dropped task should join, snapped to the pomodoro rhythm. */
  private resolveSlot(minute: number): MinuteOfDay {
    const blocks = this.daySchedule().blocks;
    const focus = blocks.filter((block): block is FocusBlock => block.kind === 'focus');
    const inside = focus.find(block => minute >= block.startMin && minute < block.endMin);
    if (inside) return inside.startMin;

    const next = focus.find(block => block.startMin > minute);
    if (next && next.startMin - minute <= 30) return next.startMin;

    return clampMinute(minute);
  }

  protected onGridClick(event: MouseEvent): void {
    if (this.suppressClick) return;
    const target = event.target as HTMLElement;
    if (target.closest('.ev')) return;
    const minute = snapMinute(this.minuteAt(event.clientY));
    const slot = this.resolveSlot(minute);
    const block = this.daySchedule().blocks.find(
      candidate => candidate.kind === 'focus' && candidate.startMin === slot
    );
    this.panel.set({ startMin: slot, blockId: block?.id ?? null });
    this.resetPanelInputs();
  }

  // ── Dragging ──────────────────────────────────────────────────────────────
  protected onItemPointerDown(event: PointerEvent, task: Task): void {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;
    const placement = this.schedule.placementOf(task.id);
    this.beginDrag(event, task, placement?.startMin ?? this.schedule.prefs().dayStart, 0, 'rail');
  }

  protected onBlockPointerDown(event: PointerEvent, item: BlockLayout): void {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('.ev-resize')) return;
    const taskId = item.block.kind === 'focus' ? item.block.taskIds[0] : null;
    if (!taskId) return;
    const task = this.taskService.tasks().find(candidate => candidate.id === taskId);
    if (!task) return;
    const placement = this.schedule.placementOf(taskId);
    const origin = placement?.startMin ?? item.block.startMin;
    const grabOffset = this.minuteAt(event.clientY) - origin;
    this.beginDrag(event, task, origin, grabOffset, 'event');
  }

  private beginDrag(
    event: PointerEvent,
    task: Task,
    origin: MinuteOfDay,
    grabOffset: number,
    source: 'rail' | 'event'
  ): void {
    this.drag = {
      taskId: task.id,
      title: task.title,
      source,
      originStart: origin,
      grabOffsetMin: grabOffset,
      previewStart: origin,
      startX: event.clientX,
      startY: event.clientY,
      overGrid: false,
      moved: false,
    };
    this.dragTaskId.set(task.id);
    this.dragPreviewStart.set(origin);
    this.dragGhost.set({ x: event.clientX + 12, y: event.clientY + 12, title: task.title });
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.resize) {
      this.applyResize(event);
      return;
    }
    const drag = this.drag;
    if (!drag) return;

    drag.moved =
      drag.moved ||
      Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 4;

    const rect = this.gridRect();
    const overGrid =
      !!rect &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    drag.overGrid = overGrid;
    this.dragGhost.set({ x: event.clientX + 12, y: event.clientY + 12, title: drag.title });

    if (overGrid) {
      const minute = snapMinute(this.minuteAt(event.clientY) - drag.grabOffsetMin);
      drag.previewStart = minute;
      this.dragPreviewStart.set(minute);
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.resize) {
      this.resize = null;
      return;
    }
    const drag = this.drag;
    if (!drag) return;

    const shouldCommit = drag.moved && drag.overGrid;
    const taskId = drag.taskId;
    const minute = drag.previewStart;
    const wasMoved = drag.moved;

    this.drag = null;
    this.dragTaskId.set(null);
    this.dragPreviewStart.set(null);
    this.dragGhost.set(null);

    if (wasMoved) {
      // Swallow the click that follows a drag gesture.
      this.suppressClick = true;
      setTimeout(() => (this.suppressClick = false), 0);
    }

    if (shouldCommit) {
      void this.applyDrop(taskId, minute);
    }

    event.preventDefault();
  }

  protected onEscape(): void {
    this.drag = null;
    this.resize = null;
    this.dragTaskId.set(null);
    this.dragPreviewStart.set(null);
    this.dragGhost.set(null);
    this.closePanel();
  }

  private async applyDrop(taskId: string, minute: MinuteOfDay): Promise<void> {
    const slot = this.resolveSlot(minute);
    await this.schedule.pinTask(taskId, slot);
    // Mirror the new visual order back onto the quadrant sequence.
    await this.schedule.applySequence(this.schedule.scheduledTaskIds());
  }

  // ── Resizing (add / remove pomodoros) ─────────────────────────────────────
  protected onResizePointerDown(event: PointerEvent, item: BlockLayout): void {
    if (event.button !== 0 || item.block.kind !== 'focus') return;
    event.preventDefault();
    event.stopPropagation();
    const taskId = item.block.taskIds[0];
    this.resize = {
      taskId,
      startY: event.clientY,
      basePomodoros: this.schedule.pomodorosOf(taskId),
    };
  }

  private applyResize(event: PointerEvent): void {
    const resize = this.resize;
    if (!resize) return;
    const step = this.schedule.focusMinutes() * this.pxPerMinute;
    const delta = Math.round((event.clientY - resize.startY) / Math.max(8, step));
    const next = Math.max(MIN_POMODOROS, Math.min(MAX_POMODOROS, resize.basePomodoros + delta));
    if (next !== this.schedule.pomodorosOf(resize.taskId)) {
      void this.schedule.setPomodoros(resize.taskId, next);
    }
  }
}
