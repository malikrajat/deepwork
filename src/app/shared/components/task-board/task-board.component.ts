import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { Task, TaskQuadrant, TaskStatus, taskActivityIso } from '../../../core/models/task.model';
import { isPinnedToToday } from '../../../core/utils/task-day.util';
import { localDayKey } from '../../../core/utils/nudge-schedule.util';
import {
  QUADRANT_CONFIG,
  STATUS_CONFIG,
  STATUS_CYCLE,
} from '../../../core/constants/theme.constants';
import { TooltipDirective } from '../../directives/tooltip.directive';
import { formatActivityLabel } from '../../../core/utils/task-activity.util';
import { BoardColumn, adjacentStatus, boardColumns, statusShortcut } from './task-board.view';

/**
 * Extra buttons a card can carry. Each page picks the ones that make sense
 * there, so the board itself stays free of page-specific behaviour.
 *
 * `edit` is the one every page wants: the card is where a task is read, so the
 * way to change it belongs on the card rather than only on the page that owns
 * the form. A page that has no form of its own answers the request by linking
 * to the Tasks page's editor (see `task-link.util.ts`).
 */
export type TaskCardAction = 'today' | 'focus' | 'edit' | 'delete';

/** A card that was dragged (or nudged with the keyboard) into a column. */
export interface BoardMove {
  task: Task;
  status: TaskStatus;
  /** Where in the target column it landed. */
  index: number;
}

/** A right-click menu asking the page to re-sort a task. */
export interface BoardQuadrantChange {
  task: Task;
  quadrant: TaskQuadrant | null;
}

const QUADRANT_IDS: readonly TaskQuadrant[] = [
  'urgent-important',
  'important',
  'urgent',
  'neither',
];

/** Secondary line shown next to each status inside the right-click menu. */
const STATUS_HINTS: Record<TaskStatus, string> = {
  todo: 'Not started',
  'in-progress': 'Working on it',
  done: 'Completed',
};

interface BoardContextMenu {
  task: Task;
  x: number;
  y: number;
}

/**
 * The Jira-style task board: one column per task status, cards dragged between
 * them to change status.
 *
 * Both the Tasks and the Today page render this component, which is what keeps
 * the columns, the drag behaviour and the card colours identical on both — a
 * card is tinted, accented and titled the same way for a given status wherever
 * it appears (see `STATUS_CONFIG.cardClass` and the tokens in `styles.css`).
 *
 * Cards keep the task's own details — deadline, quadrant, repeat, priority and
 * the last-changed stamp — so grouping by status costs the list nothing.
 * Sorting stays with the page (Tasks exposes a sort control, Today follows its
 * own daily sequence), so the board partitions whatever order it is given.
 */
@Component({
  selector: 'app-task-board',
  imports: [DragDropModule, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'closeContextMenu()',
    '(document:click)': 'closeContextMenu()',
    '(document:contextmenu)': 'closeContextMenu()',
    '(document:keydown.escape)': 'closeContextMenu()',
    '(window:blur)': 'closeContextMenu()',
    '(window:resize)': 'closeContextMenu()',
  },
  template: `
    <div class="board" cdkDropListGroup>
      @for (column of columns(); track column.status) {
        <section
          class="board-column"
          [class]="column.cardClass"
          [attr.aria-label]="column.label + ' column'"
        >
          <header class="column-header">
            <span class="column-dot" aria-hidden="true"></span>
            <h2 class="column-title">{{ column.label }}</h2>
            <span class="column-count">{{ column.tasks.length }}</span>
          </header>

          <div
            class="column-body"
            cdkDropList
            [cdkDropListData]="column.status"
            (cdkDropListDropped)="onDrop($event)"
          >
            @for (task of column.tasks; track task.id; let i = $index) {
              <article
                class="task-card"
                [class]="column.cardClass"
                cdkDrag
                [cdkDragData]="task"
                tabindex="0"
                [attr.aria-label]="cardLabel(task)"
                (click)="opened.emit(task)"
                (keydown)="onCardKeydown(task, $event)"
                (contextmenu)="openContextMenu(task, $event)"
              >
                <span class="card-accent" aria-hidden="true"></span>

                <span class="drag-grip" aria-hidden="true">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="9" cy="6" r="2" />
                    <circle cx="15" cy="6" r="2" />
                    <circle cx="9" cy="12" r="2" />
                    <circle cx="15" cy="12" r="2" />
                    <circle cx="9" cy="18" r="2" />
                    <circle cx="15" cy="18" r="2" />
                  </svg>
                </span>

                @if (showOrder()) {
                  <span class="order-num">{{ i + 1 }}</span>
                }

                <div class="card-body">
                  <span class="card-title" [appTooltip]="task.title">{{ task.title }}</span>
                  <div class="card-meta">
                    @if (task.deadline) {
                      <span class="meta-badge deadline" [class.overdue]="isOverdue(task)">
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12,6 12,12 16,14" />
                        </svg>
                        {{ formatDeadline(task.deadline) }}
                      </span>
                    }
                    @if (task.quadrant) {
                      <span class="meta-badge quadrant">{{ quadrantLabel(task.quadrant) }}</span>
                    }
                    @if (task.recurrence) {
                      <span class="meta-badge recurring">
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <path d="M17 2l4 4-4 4" />
                          <path d="M3 11V9a4 4 0 014-4h14" />
                          <path d="M7 22l-4-4 4-4" />
                          <path d="M21 13v2a4 4 0 01-4 4H3" />
                        </svg>
                        {{ task.recurrence.frequency }}
                      </span>
                    }
                    @if (completedLabel(task); as completed) {
                      <span class="meta-badge updated">{{ completed }}</span>
                    } @else {
                      <span
                        class="meta-badge updated"
                        [appTooltip]="'Last changed ' + activityLabel(task)"
                      >
                        {{ activityLabel(task) }}
                      </span>
                    }
                  </div>
                </div>

                <div class="card-actions">
                  <span
                    class="priority-badge p{{ task.priority }}"
                    appTooltip="Priority {{ task.priority }}"
                    >P{{ task.priority }}</span
                  >

                  @if (hasAction('today')) {
                    <button
                      class="icon-btn today-btn"
                      type="button"
                      [class.on]="pinnedToday(task)"
                      [appTooltip]="pinnedToday(task) ? 'Remove from Today' : 'Add to Today'"
                      (click)="todayToggled.emit(task); $event.stopPropagation()"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        [attr.fill]="pinnedToday(task) ? 'currentColor' : 'none'"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path
                          d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                        />
                      </svg>
                    </button>
                  }

                  @if (canStartFocus(task)) {
                    <button
                      class="icon-btn focus-btn"
                      type="button"
                      [class.on]="task.id === highlightedTaskId()"
                      appTooltip="Start focus on this task"
                      [attr.aria-label]="'Start focus on ' + task.title"
                      (click)="focusRequested.emit(task); $event.stopPropagation()"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  }

                  @if (hasAction('edit')) {
                    <button
                      class="icon-btn edit-btn"
                      type="button"
                      appTooltip="Edit task"
                      [attr.aria-label]="'Edit ' + task.title"
                      (click)="editRequested.emit(task); $event.stopPropagation()"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                  }

                  @if (hasAction('delete')) {
                    <button
                      class="icon-btn danger delete"
                      type="button"
                      appTooltip="Delete"
                      (click)="deleteRequested.emit(task); $event.stopPropagation()"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <polyline points="3,6 5,6 21,6" />
                        <path
                          d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"
                        />
                      </svg>
                    </button>
                  }
                </div>
              </article>
            } @empty {
              <p class="column-empty">{{ emptyText() }}</p>
            }
          </div>
        </section>
      }
    </div>

    @if (contextMenu(); as menu) {
      <div
        #contextMenu
        class="board-menu"
        role="menu"
        tabindex="-1"
        [attr.aria-label]="'Actions for ' + menu.task.title"
        [style.left.px]="menu.x"
        [style.top.px]="menu.y"
        (pointerdown)="$event.stopPropagation()"
        (click)="$event.stopPropagation()"
        (contextmenu)="$event.preventDefault(); $event.stopPropagation()"
        (keydown.escape)="closeContextMenu()"
      >
        <div class="menu-header">
          <span class="menu-title">{{ menu.task.title }}</span>
          <span class="menu-subtitle">{{ taskContextLabel(menu.task) }}</span>
        </div>

        <div class="menu-section">
          <button
            class="menu-option"
            type="button"
            role="menuitem"
            (click)="editFromMenu(menu.task)"
          >
            <span class="menu-dot edit"></span>
            <span class="menu-option-label">Edit task</span>
            <span class="menu-option-desc">Title, date, priority, repeat</span>
          </button>
          @if (canStartFocus(menu.task)) {
            <button
              class="menu-option"
              type="button"
              role="menuitem"
              (click)="focusFromMenu(menu.task)"
            >
              <span class="menu-dot focus"></span>
              <span class="menu-option-label">Start focus</span>
              <span class="menu-option-desc">Start timer on dashboard</span>
            </button>
          }
          @if (hasAction('today')) {
            <button
              class="menu-option"
              type="button"
              role="menuitem"
              (click)="toggleTodayFromMenu(menu.task)"
            >
              <span class="menu-dot today"></span>
              <span class="menu-option-label">{{
                pinnedToday(menu.task) ? 'Remove from Today' : 'Add to Today'
              }}</span>
              <span class="menu-option-desc">{{
                pinnedToday(menu.task) ? 'Take it off the day' : 'Work on it today'
              }}</span>
            </button>
          }
        </div>

        <div class="menu-section">
          <span class="menu-section-title">Move to quadrant</span>
          @for (q of quadrantOptions; track q.id) {
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
        min-height: 0;
      }

      .board {
        display: grid;
        grid-template-columns: repeat(3, minmax(240px, 1fr));
        gap: 14px;
        height: 100%;
        min-height: 0;
      }
      /* Narrow windows scroll the way a Jira board does: columns stay full width
       and the board moves sideways instead of squashing three into one. */
      @media (max-width: 960px) {
        .board {
          grid-template-columns: none;
          grid-auto-flow: column;
          grid-auto-columns: minmax(240px, 1fr);
          overflow-x: auto;
          padding-bottom: 4px;
        }
      }
      /* A phone has no room to scroll a board sideways and drag a card at the
       same time: the sideways scroll the 960px rule above asks for is what
       makes a column unreachable while a card is in the air, and a 240px
       column is wider than the page it would be read on. So the board becomes
       one column per row — the Jira board turned on its side — which keeps all
       three statuses on screen and every one of them a drop target.
       'grid-auto-flow: row' has to be stated here: the 960px rule set it to
       'column', and auto-placement is what decides whether the stack flows
       downward or sideways once there is only one grid track. */
      @media (max-width: 640px) {
        .board {
          grid-template-columns: minmax(0, 1fr);
          grid-auto-flow: row;
          grid-auto-columns: minmax(0, 1fr);
          overflow-x: auto;
          overflow-y: auto;
          gap: 10px;
          /* A flick that reaches the end of the board must not carry on into
             the page behind it. */
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }
      }

      /* A grid track sized '1fr' will not shrink below the smallest its item
       can be, and its item will not shrink below its own content's minimum —
       so the loop above asks for 'minmax(0, 1fr)' and the column says the same
       thing in its own terms here. Without both, one long title or one wide
       badge pushes the column, and with it the page, sideways. */
      .board-column {
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
        overflow: hidden;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        border-radius: 14px;
      }
      .column-header {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
        padding: 11px 14px;
        border-bottom: 1px solid var(--glass-border);
      }
      .column-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .column-title {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .column-count {
        margin-left: auto;
        font-size: 12px;
        padding: 1px 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: var(--color-text-muted);
        font-variant-numeric: tabular-nums;
      }

      .column-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px;
      }
      .column-body::-webkit-scrollbar {
        width: 4px;
      }
      .column-body::-webkit-scrollbar-thumb {
        background: rgba(139, 92, 246, 0.2);
        border-radius: 4px;
      }
      .column-empty {
        font-size: 13px;
        color: var(--color-text-muted);
        text-align: center;
        padding: 18px 8px;
        border: 1px dashed rgba(139, 92, 246, 0.16);
        border-radius: 10px;
      }

      /* Layout only — no background or border here on purpose. Those live in the
       shared status classes in styles.css, which is what makes a card's colour
       identical on Tasks, on Today and in the drag preview (an encapsulated
       copy of the same declaration would win and drift out of sync). */
      .task-card {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 9px 7px 14px;
        border-radius: 12px;
        cursor: grab;
        outline: none;
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease,
          border-color 0.15s ease;
      }
      .task-card:active {
        cursor: grabbing;
      }
      .task-card:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
      }
      /* A focus ring you can actually find, on a card whose background already
         carries the status tint. */
      .task-card:focus-visible {
        box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.75);
      }
      .card-accent {
        position: absolute;
        left: 0;
        top: 8px;
        bottom: 8px;
        width: 3px;
        border-radius: 0 2px 2px 0;
        background: var(--card-accent, var(--color-accent-primary));
      }
      .drag-grip {
        display: flex;
        flex-shrink: 0;
        color: var(--color-text-muted);
        opacity: 0.35;
      }
      .task-card:hover .drag-grip {
        opacity: 0.85;
      }
      .order-num {
        font-size: 12px;
        font-weight: 700;
        font-family: var(--font-mono);
        color: var(--color-text-muted);
        width: 14px;
        text-align: center;
        flex-shrink: 0;
      }

      .card-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .card-title {
        display: block;
        min-width: 0;
        font-size: 14px;
        font-weight: 500;
        line-height: 1.3;
        color: var(--color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .card-meta {
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
        gap: 4px;
        overflow: hidden;
      }
      .meta-badge {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 12px;
        padding: 0 5px;
        border-radius: 6px;
        white-space: nowrap;
        line-height: 1.55;
        flex-shrink: 0;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        color: var(--color-text-muted);
      }
      .meta-badge.updated {
        flex-shrink: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .meta-badge.deadline.overdue {
        color: #f87171;
        border-color: rgba(248, 113, 113, 0.3);
      }
      .meta-badge.quadrant {
        color: var(--color-text-secondary);
      }
      .meta-badge.recurring {
        color: rgb(167, 139, 250);
      }

      .card-actions {
        display: flex;
        align-items: center;
        gap: 2px;
        flex-shrink: 0;
      }
      .priority-badge {
        font-size: 12px;
        font-weight: 700;
        font-family: var(--font-mono);
        padding: 1px 5px;
        border-radius: 6px;
      }
      .priority-badge.p1 {
        background: var(--priority-p1-bg);
        color: var(--priority-p1-color);
      }
      .priority-badge.p2 {
        background: var(--priority-p2-bg);
        color: var(--priority-p2-color);
      }
      .priority-badge.p3 {
        background: var(--priority-p3-bg);
        color: var(--priority-p3-color);
      }
      .priority-badge.p4 {
        background: var(--priority-p4-bg);
        color: var(--priority-p4-color);
      }

      .icon-btn {
        width: 24px;
        height: 24px;
        border-radius: 6px;
        border: none;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-muted);
        cursor: pointer;
        transition: all 0.2s;
      }
      .icon-btn:hover {
        background: rgba(139, 92, 246, 0.1);
        color: var(--timer-work-color);
      }
      .icon-btn.on {
        color: var(--priority-p2-color);
      }
      .icon-btn.danger:hover {
        background: rgba(239, 68, 68, 0.1);
        color: #f87171;
      }

      .cdk-drag-placeholder {
        opacity: 0.3;
      }
      .cdk-drag-animating {
        transition: transform 200ms ease;
      }
      .column-body.cdk-drop-list-dragging .task-card:not(.cdk-drag-placeholder) {
        transition: transform 200ms ease;
      }

      /* Touch sizes for the things a finger has to hit. Nothing here is smaller
         than it is on the desktop: the 24px icons, the 10px grip and the 30px
         card all keep their look, they simply answer a tap over a larger area —
         which is the only way the today / edit / delete controls, and the card
         itself, are reachable at all. */
      @media (max-width: 640px) {
        .task-card {
          min-height: 44px;
          /* A card at 320px carries three 44px-tall buttons, a 10px title and up
             to four meta badges inside about 230px. Fitting them on one line is
             not possible without either cutting the badges off or letting the
             row push the card wider than the phone, so the card is allowed to
             take a second line instead. */
          flex-wrap: wrap;
        }
        .drag-grip {
          justify-content: center;
          width: 24px;
          min-height: 44px;
        }
        .icon-btn {
          width: 32px;
          height: 44px;
        }
        /* Tall enough that an empty column is still a comfortable thing to drop
           a card onto, since here the whole column is the target. */
        .board-column {
          min-height: 120px;
        }
        /* The column scrolls its own cards instead of stretching without limit:
           one column holding a hundred tasks would otherwise push the next
           status several screens down, and a status you cannot see is one you
           cannot drag a card onto. 'dvh' after 'vh' for the same reason the
           board's own section heights use it: the cap has to match the window
           the phone is actually showing, not the one it would show with its URL
           bar hidden. */
        .column-body {
          max-height: 60vh;
          max-height: 60dvh;
          overscroll-behavior-y: contain;
          -webkit-overflow-scrolling: touch;
        }
      }

      /* ===== Large screens =====

         The board above divides whatever width it is given into three equal
         columns, which is right for a window and wrong for a wall: on a 3840px
         screen each column reached about 680px, so a card held its title against
         one edge and its four controls against the other with half a metre of
         empty surface between them — a letterbox, read by moving the eye across
         it twice.

         The fix is the board's width rather than its columns'. Capping the board
         and centring it keeps the three tracks equal and the columns at about
         520px, which is the width a card was drawn for: a title, up to four meta
         badges and the priority chip plus three buttons all inside one glance.
         Nothing about the grid changes — the same three columns in the same
         order, still one drop target each — only how much room they are asked to
         share. */
      @media (min-width: 1920px) {
        .board {
          max-width: 1600px;
          margin-inline: auto;
        }
      }

      /* ===== Very large screens =====

         Past 2560px the board is read from across a room, which is the distance
         the type ladder in styles.css climbs for. The card title is what this
         page is read for, so it takes the ladder's 16px step and the badges
         around it take the 12px one; the column heading follows at 14px. Sizes
         are the published tokens rather than new numbers, so the board grows
         with every other page instead of on its own. */
      @media (min-width: 2560px) {
        .column-header {
          padding: 13px 16px;
        }
        .column-title {
          font-size: var(--text-sm);
        }
        .column-count,
        .meta-badge,
        .priority-badge,
        .order-num {
          font-size: var(--text-2xs);
        }
        .column-empty {
          font-size: var(--text-sm);
        }
        .card-title {
          font-size: var(--text-md);
        }
        /* Bigger type needs a bigger row around it, or a 16px title sits in the
           same 7px of padding it had at 13px and the card reads as cramped.
           The controls grow with it for the same reason. */
        .task-card {
          padding: 9px 11px 9px 16px;
        }
        .column-body {
          gap: 10px;
          padding: 12px;
        }
        .icon-btn {
          width: 28px;
          height: 28px;
        }
        /* The order number is two digits in a fixed 14px box, which a 10px
           monospace figure fits and a 12px one does not. */
        .order-num {
          width: 18px;
        }
      }

      /* Right-click menu: the same choices the Matrix offers, on a board card.
         It is fixed to the pointer so it can open over a column's own scroll
         area, and it shares the Matrix's panel look so the app has one menu. */
      .board-menu {
        position: fixed;
        z-index: 1200;
        width: 300px;
        max-width: calc(100vw - 16px);
        max-height: calc(100vh - 16px);
        max-height: calc(100dvh - 16px);
        overflow-y: auto;
        padding: 8px;
        background: var(--surface-float);
        backdrop-filter: blur(18px);
        border: 1px solid rgba(139, 92, 246, 0.28);
        border-radius: 14px;
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
        animation: board-menu-in 0.12s ease-out;
      }
      @keyframes board-menu-in {
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
        font-size: 13px;
        font-weight: 700;
        color: var(--color-text-primary);
      }
      .menu-subtitle {
        display: block;
        margin-top: 3px;
        font-size: 12px;
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
        font-size: 12px;
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
      .menu-dot.edit {
        background: var(--color-accent-primary);
      }
      .menu-dot.focus {
        background: #34d399;
      }
      .menu-dot.today {
        background: var(--priority-p2-color);
      }
      .menu-option-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text-primary);
        white-space: nowrap;
      }
      .menu-option-desc {
        margin-left: auto;
        font-size: 12px;
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
    `,
  ],
})
export class TaskBoardComponent {
  /** Tasks to spread over the status columns, in the order the page decided. */
  readonly tasks = input.required<readonly Task[]>();
  /** Which extra buttons each card shows. */
  readonly actions = input<readonly TaskCardAction[]>([]);
  /** Show "1, 2, 3…" inside each column (the Today board's daily sequence). */
  readonly showOrder = input(false);
  /** Task that is linked to the timer, so its focus button reads as active. */
  readonly highlightedTaskId = input<string | null>(null);
  /**
   * The quadrant the day is currently working through. Cards outside it keep
   * their edit and delete controls but do not offer "start focus": the matrix
   * order says Do First comes before the other quadrants.
   */
  readonly focusQuadrant = input<TaskQuadrant | null>(null);
  /** What an empty column says. */
  readonly emptyText = input('Nothing here yet');
  /**
   * Whether a card opens the right-click menu.
   *
   * The board is shared: Today and the Tasks page's today/future sections pass
   * `true`, while the Tasks page's past sections leave it off. A past card is a
   * record of work that has already slipped, not something to re-sort today.
   */
  readonly contextMenuEnabled = input(false);

  /** A card was dragged or nudged into another status column. */
  readonly moved = output<BoardMove>();
  /** A card was clicked or activated with Enter. */
  readonly opened = output<Task>();
  readonly todayToggled = output<Task>();
  readonly focusRequested = output<Task>();
  /** The card's pencil: the page opens its editor, or links to the one on Tasks. */
  readonly editRequested = output<Task>();
  readonly deleteRequested = output<Task>();
  /** The right-click menu's quadrant choice. */
  readonly quadrantRequested = output<BoardQuadrantChange>();

  /** The menu's live position and task; `null` when it is closed. */
  readonly contextMenu = signal<BoardContextMenu | null>(null);
  private readonly contextMenuRef = viewChild<ElementRef<HTMLElement>>('contextMenu');

  readonly quadrantOptions = QUADRANT_IDS.map((id) => ({
    id,
    color: QUADRANT_CONFIG[id].color,
    label: QUADRANT_CONFIG[id].label,
    desc: QUADRANT_CONFIG[id].description,
  }));

  readonly statusOptions = STATUS_CYCLE.map((status) => ({
    status,
    label: STATUS_CONFIG[status].label,
    hint: STATUS_HINTS[status],
    color: STATUS_CONFIG[status].color,
  }));

  readonly columns = computed<BoardColumn[]>(() => boardColumns(this.tasks()));

  hasAction(action: TaskCardAction): boolean {
    return this.actions().includes(action);
  }

  /**
   * The start button is for open work in the quadrant the day is on, and only
   * where the page asked for a focus control at all.
   */
  canStartFocus(task: Task): boolean {
    return (
      this.hasAction('focus') && task.status !== 'done' && task.quadrant === this.focusQuadrant()
    );
  }

  /** Whether the card's star is *today's*, not one left over from an earlier day. */
  pinnedToday(task: Task): boolean {
    return isPinnedToToday(task);
  }

  // ── Right-click menu ──────────────────────────────────────────────────────

  /**
   * Opens the card menu at the pointer, keeping it inside the viewport.
   *
   * A past section passes `contextMenuEnabled = false`, so the browser's own
   * menu stays available there and no task is re-written by accident.
   */
  openContextMenu(task: Task, event: MouseEvent): void {
    if (!this.contextMenuEnabled()) return;
    event.preventDefault();
    event.stopPropagation();
    this.openMenuAt(task, event.clientX, event.clientY);
  }

  closeContextMenu(): void {
    if (this.contextMenu()) this.contextMenu.set(null);
  }

  private openMenuAt(task: Task, clientX: number, clientY: number): void {
    const margin = 8;
    // A little taller than the Matrix's menu: a board card can also carry the
    // Today toggle and the status hints.
    const menuWidth = 300;
    const menuHeight = 510;
    const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
    const maxX = viewportWidth ? viewportWidth - menuWidth - margin : clientX;
    const maxY = viewportHeight ? viewportHeight - menuHeight - margin : clientY;

    this.contextMenu.set({
      task,
      x: Math.max(margin, Math.min(clientX, maxX)),
      y: Math.max(margin, Math.min(clientY, maxY)),
    });

    // Move keyboard focus into the menu so Tab/Enter work after a right-click.
    setTimeout(() => {
      const element = this.contextMenuRef()?.nativeElement;
      element?.querySelector<HTMLElement>('.menu-option')?.focus();
    });
  }

  editFromMenu(task: Task): void {
    this.closeContextMenu();
    this.editRequested.emit(task);
  }

  focusFromMenu(task: Task): void {
    this.closeContextMenu();
    this.focusRequested.emit(task);
  }

  toggleTodayFromMenu(task: Task): void {
    this.closeContextMenu();
    this.todayToggled.emit(task);
  }

  moveFromMenu(task: Task, quadrant: TaskQuadrant | null): void {
    this.closeContextMenu();
    if (task.quadrant === quadrant) return;
    this.quadrantRequested.emit({ task, quadrant });
  }

  setStatusFromMenu(task: Task, status: TaskStatus): void {
    this.closeContextMenu();
    if (task.status === status) return;
    this.moved.emit({ task, status, index: 0 });
  }

  taskContextLabel(task: Task): string {
    const quadrant = task.quadrant ? QUADRANT_CONFIG[task.quadrant].label : 'Unassigned';
    return `${quadrant} · ${STATUS_CONFIG[task.status].label}`;
  }

  /**
   * Dropping a card in another column is the status change; the index keeps
   * working for pages that remember a manual order (Today does, Tasks sorts).
   */
  onDrop(event: CdkDragDrop<TaskStatus>): void {
    const task = event.item.data as Task;
    this.moved.emit({ task, status: event.container.data, index: event.currentIndex });
  }

  /**
   * Drag & drop with the keyboard: `1`/`2`/`3` jump straight to a status and
   * the arrow keys walk the columns, so the status is still reachable without
   * a mouse (the board has no checkbox to click any more). `Enter` opens the
   * task where the page supports editing.
   */
  onCardKeydown(task: Task, event: KeyboardEvent): void {
    const direct = statusShortcut(event.key);
    if (direct) {
      event.preventDefault();
      if (direct !== task.status) this.moved.emit({ task, status: direct, index: 0 });
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const next = adjacentStatus(task.status, event.key === 'ArrowRight' ? 1 : -1);
      if (next) this.moved.emit({ task, status: next, index: 0 });
      return;
    }

    if (
      this.contextMenuEnabled() &&
      (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
    ) {
      event.preventDefault();
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      this.openMenuAt(task, rect.left + 16, rect.top + 16);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.opened.emit(task);
    }
  }

  cardLabel(task: Task): string {
    return `${task.title} — ${STATUS_CONFIG[task.status].label}. Press 1, 2 or 3 to move it to To Do, In Progress or Done, or use the arrow keys.`;
  }

  activityLabel(task: Task): string {
    return formatActivityLabel(taskActivityIso(task));
  }

  /** Done cards show when they were finished instead of the last-changed stamp. */
  completedLabel(task: Task): string | null {
    if (task.status !== 'done' || !task.completedAt) return null;
    return `Done ${new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  isOverdue(task: Task): boolean {
    if (!task.deadline) return false;
    // Deadlines are chosen as calendar dates, so "overdue" is a question about
    // the local day — the same day the rest of the app starts over at midnight.
    return new Date(task.deadline) < new Date(localDayKey(new Date()));
  }

  formatDeadline(deadline: string): string {
    return new Date(deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  quadrantLabel(quadrant: TaskQuadrant): string {
    return QUADRANT_CONFIG[quadrant].label;
  }
}
