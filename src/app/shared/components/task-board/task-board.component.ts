import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { Task, TaskQuadrant, TaskStatus, taskActivityIso } from '../../../core/models/task.model';
import { isPinnedToToday } from '../../../core/utils/task-day.util';
import { localDayKey } from '../../../core/utils/nudge-schedule.util';
import { QUADRANT_CONFIG, STATUS_CONFIG } from '../../../core/constants/theme.constants';
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

                  @if (hasAction('focus')) {
                    <button
                      class="icon-btn focus-btn"
                      type="button"
                      [class.on]="task.id === highlightedTaskId()"
                      appTooltip="Focus & go to timer"
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
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .column-count {
        margin-left: auto;
        font-size: 10px;
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
        font-size: 12px;
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
        font-size: 10px;
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
        font-size: 13px;
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
        font-size: 10px;
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
        font-size: 10px;
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
  /** What an empty column says. */
  readonly emptyText = input('Nothing here yet');

  /** A card was dragged or nudged into another status column. */
  readonly moved = output<BoardMove>();
  /** A card was clicked or activated with Enter. */
  readonly opened = output<Task>();
  readonly todayToggled = output<Task>();
  readonly focusRequested = output<Task>();
  /** The card's pencil: the page opens its editor, or links to the one on Tasks. */
  readonly editRequested = output<Task>();
  readonly deleteRequested = output<Task>();

  readonly columns = computed<BoardColumn[]>(() => boardColumns(this.tasks()));

  hasAction(action: TaskCardAction): boolean {
    return this.actions().includes(action);
  }

  /** Whether the card's star is *today's*, not one left over from an earlier day. */
  pinnedToday(task: Task): boolean {
    return isPinnedToToday(task);
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
