import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TaskService } from '../../core/services/task.service';
import { DbService } from '../../core/services/db.service';
import { Task } from '../../core/models/task.model';
import {
  BoardMove,
  TaskBoardComponent,
} from '../../shared/components/task-board/task-board.component';
import { sequenceAfterMove } from '../../shared/components/task-board/task-board.view';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { TaskEditorService } from '../../core/services/task-editor.service';
import { readFocusedTaskId, saveFocusedTaskId } from '../../core/utils/focus-task.util';

/**
 * Today is the same status board as the Tasks page, scoped to the day's list:
 * the columns are the plan, dragging a card between them moves the work along,
 * and the position inside a column is the order the user wants to work in.
 *
 * Because the board renders today's tasks in *every* status, a card dropped in
 * Done stays in Done (greyed out, struck through) instead of vanishing — the
 * dashboard's `todayTasks()` still only counts open work.
 */
@Component({
  selector: 'app-today',
  imports: [TaskBoardComponent, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="today-layout">
      <div class="page-header">
        <div class="header-left">
          <h1 class="gradient-text page-title">Today</h1>
          <span class="date-label">{{ todayLabel }}</span>
        </div>
        <div class="header-stats">
          <span class="stat">{{ completedCount() }}/{{ boardTasks().length }} done</span>
          <button
            class="btn-add"
            type="button"
            (click)="addTask()"
            appTooltip="Open the task form for today — the task lands on this board"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add task
          </button>
        </div>
      </div>

      <div class="filters-bar">
        <div class="search-box">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search today's tasks..."
            [value]="searchQuery()"
            (input)="onSearchInput($event)"
          />
          @if (searchQuery()) {
            <button
              class="clear-search"
              type="button"
              aria-label="Clear search"
              (click)="clearSearch()"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          }
        </div>
        @if (searchQuery()) {
          <span class="search-count"
            >{{ filteredBoardTasks().length }} of {{ boardTasks().length }}</span
          >
        }
      </div>

      @if (boardTasks().length === 0 && !searchQuery()) {
        <div class="empty-state">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(139,92,246,0.3)"
            stroke-width="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12,6 12,12 16,14" />
          </svg>
          <h3>No tasks for today</h3>
          <p>Create a task with today's date or set a deadline for today</p>
          <button class="btn-add" type="button" (click)="addTask()">Add a task for today</button>
        </div>
      } @else if (filteredBoardTasks().length === 0) {
        <div class="empty-state">
          <h3>No tasks match this search</h3>
          <p>Try a different word, or clear the search.</p>
        </div>
      } @else {
        <app-task-board
          [tasks]="filteredBoardTasks()"
          [actions]="boardActions"
          [showOrder]="true"
          [highlightedTaskId]="focusedTaskId()"
          emptyText="Nothing here today"
          (moved)="onMoved($event)"
          (editRequested)="editTask($event)"
          (focusRequested)="focusTask($event)"
          (deleteRequested)="deleteTask($event)"
        />
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow: hidden;
      }
      .today-layout {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        gap: 20px;
      }
      .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .header-left {
        display: flex;
        align-items: baseline;
        gap: 12px;
      }
      .page-title {
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -0.5px;
      }
      .date-label {
        font-size: 12px;
        color: var(--color-text-muted);
      }
      .stat {
        font-size: 12px;
        color: var(--color-text-muted);
        background: rgba(139, 92, 246, 0.08);
        padding: 4px 12px;
        border-radius: 20px;
      }
      .header-stats {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .btn-add {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        border: none;
        border-radius: 10px;
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        color: #fff;
        cursor: pointer;
        transition: all 0.2s;
      }
      .btn-add:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(139, 92, 246, 0.3);
      }
      .empty-state .btn-add {
        margin-top: 4px;
      }

      .filters-bar {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .search-box {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 36px;
        background: var(--control-bg);
        border: 1px solid rgba(139, 92, 246, 0.12);
        border-radius: 8px;
        padding: 0 12px;
        flex: 1;
        max-width: 320px;
      }
      .search-box svg {
        color: var(--color-text-muted);
        flex-shrink: 0;
      }
      .search-box input {
        width: 100%;
        height: 20px;
        min-height: 0;
        padding: 0;
        line-height: 1.4;
        background: transparent;
        border: none;
        outline: none;
        color: var(--color-text-primary);
        font-size: 13px;
      }
      .search-box input::placeholder {
        color: var(--color-text-muted);
      }
      .clear-search {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border: none;
        background: transparent;
        color: var(--color-text-muted);
        cursor: pointer;
        padding: 2px;
      }
      .clear-search:hover {
        color: var(--color-text-primary);
      }
      .search-count {
        font-size: 11px;
        color: var(--color-text-muted);
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        gap: 12px;
        text-align: center;
      }
      .empty-state h3 {
        font-size: 16px;
        font-weight: 600;
        color: var(--color-text-secondary);
      }
      .empty-state p {
        font-size: 13px;
        color: var(--color-text-muted);
      }

      /* ===== Phone: the page stops being a fixed canvas =====

         On a desktop this page is exactly as tall as the window and the board
         scrolls inside it, which is what keeps the column headers sitting under
         a header that never moves. A phone has roughly 400px of height to divide
         between that header, the search field and the board, and the board — the
         only part of the page that carries today's work — came out of the
         division with almost nothing left. Below 640px both heights go back to
         auto, so the board grows to the height of the cards it holds and the
         shell's own scroll region does the scrolling instead of a second one
         nested inside it. */
      @media (max-width: 640px) {
        :host,
        .today-layout {
          height: auto;
        }
        .today-layout {
          gap: 16px;
        }

        /* Title, date, the done count and the button are one row on the desktop.
           At 320px the four of them are wider than the column, and the row's
           space-between turned that into a horizontal scroll of the whole page;
           wrapping puts the count and the button under the title, which is the
           order they are read in anyway. */
        .page-header {
          flex-wrap: wrap;
          row-gap: 10px;
        }
        .header-left {
          flex-wrap: wrap;
          row-gap: 4px;
        }

        /* The 320px cap on the search field is there so it cannot sprawl across
           a wide window. A phone column is narrower than the cap, so at this
           width it only ever took away width the field could have used. */
        .filters-bar {
          flex-wrap: wrap;
        }
        .search-box {
          max-width: 100%;
          min-height: 44px;
        }
        /* The field's text is 16px on a phone instead of the 13px this 20px box
           was drawn for (see the input rule in styles.css), so the box has to
           grow with it or the taller line is clipped. The min-width is the
           second half of the same problem: an input carries an automatic
           minimum of its own default size, which lets the placeholder — not the
           column — decide how wide the search field is. */
        .search-box input {
          height: auto;
          min-height: 24px;
          min-width: 0;
        }
        /* A thumb is not a mouse: the clear button is a 16px cross on the
           desktop, which is a miss on a phone. */
        .clear-search {
          min-width: 44px;
          min-height: 44px;
        }
        .btn-add {
          min-height: 44px;
          padding: 10px 16px;
        }
      }

      /* ===== Large screens =====

         The same correction the Tasks page needs, because this page is the same
         shape: past 1920px a row drawn for a window stretches across the whole
         column, which left 'Today' and its date at one end of a 2072px band and
         the done count and 'Add task' at the other with nothing between them.
         The header and the toolbar stop at 1600px and centre themselves. The
         board below them is capped and centred by the board component itself, so
         the page keeps one band: the title, the search field and the first
         column share their left edge. */
      @media (min-width: 1920px) {
        .page-header,
        .filters-bar {
          width: 100%;
          max-width: 1600px;
          margin-inline: auto;
        }
        /* A page whose body is 1600px is not titled at the size a 1000px one
           was; the token takes it to 32px again past 2560px. */
        .page-title {
          font-size: var(--text-6xl);
        }
      }

      /* ===== Very large screens =====

         Past 2560px the page is read from across a room, which is the distance
         the ladder in styles.css climbs for — including the form controls, which
         it takes to 18px. Everything below takes a step up that ladder, and the
         search field's box grows with the taller text rather than clipping it. */
      @media (min-width: 2560px) {
        .date-label,
        .stat,
        .search-count,
        .btn-add {
          font-size: var(--text-sm);
        }
        .btn-add {
          padding: 9px 18px;
        }
        .search-box {
          min-height: 40px;
          max-width: 400px;
        }
        /* The 20px this input is pinned to was the line box of a 13px font; at
           the ladder's 18px the text is taller than the box it sits in. */
        .search-box input {
          height: auto;
          min-height: 26px;
        }
        .today-layout {
          gap: 28px;
        }
        /* With no tasks the empty state is the whole page, so its message is
           read at the distance a card title is. */
        .empty-state h3 {
          font-size: var(--text-2xl);
        }
        .empty-state p {
          font-size: var(--text-md);
        }
      }
    `,
  ],
})
export class TodayComponent implements OnInit {
  private readonly taskService = inject(TaskService);
  private readonly db = inject(DbService);
  private readonly router = inject(Router);
  private readonly taskEditor = inject(TaskEditorService);

  todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  /** Buttons every card on this page carries. */
  readonly boardActions = ['edit', 'focus', 'delete'] as const;

  /** Today's tasks in every status — the board shows Done as well. */
  readonly boardTasks = this.taskService.todayBoardTasks;
  readonly completedCount = computed(
    () => this.boardTasks().filter((t) => t.status === 'done').length,
  );
  readonly searchQuery = signal('');
  readonly filteredBoardTasks = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return this.boardTasks();
    return this.boardTasks().filter(
      (task) =>
        task.title.toLowerCase().includes(query) || task.description.toLowerCase().includes(query),
    );
  });

  private readonly focusedId = signal<string | null>(null);
  readonly focusedTaskId = this.focusedId.asReadonly();

  ngOnInit(): void {
    this.focusedId.set(readFocusedTaskId());
    this.initAsync();
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  private async initAsync(): Promise<void> {
    await this.db.init();
    await this.taskService.loadTasks();
    await this.taskService.runDailyUpkeep();
  }

  /**
   * Dragging is two writes: the card may have changed status, and it certainly
   * changed position in the day's sequence. The sequence is taken from the
   * board as it was *before* the move, so the card still sits in the column it
   * came from; quadrant priority keeps deciding the top of each column.
   */
  async onMoved(move: BoardMove): Promise<void> {
    const sequence = sequenceAfterMove(this.boardTasks(), move);
    if (move.task.status !== move.status) {
      await this.taskService.setStatus(move.task, move.status);
    }
    await this.taskService.reorderToday(sequence);
  }

  /** The delete control on a card removes the task, matching the Tasks board. */
  async deleteTask(task: Task): Promise<void> {
    await this.taskService.deleteTask(task.id);
  }

  focusTask(task: Task): void {
    saveFocusedTaskId(task.id);
    this.focusedId.set(task.id);
    this.router.navigate(['/dashboard']);
  }

  /**
   * A card's pencil, and the header's Add task button.
   *
   * This page is a view of the day, not an editor: it has no task form and the
   * app deliberately has only one. Both controls therefore open the shell's
   * panel over this page — editing on that task, adding on a form dated today
   * that also pins the result to today's list, which is what "Add task" here
   * promises. Neither one navigates: Today is still on screen when the panel
   * closes, with the card already corrected in place.
   */
  editTask(task: Task): void {
    this.taskEditor.openEdit(task);
  }

  addTask(): void {
    this.taskEditor.openAdd({ addToToday: true });
  }
}
