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
  imports: [TaskBoardComponent],
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
    `,
  ],
})
export class TodayComponent implements OnInit {
  private readonly taskService = inject(TaskService);
  private readonly db = inject(DbService);
  private readonly router = inject(Router);

  todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  /** Buttons every card on this page carries. */
  readonly boardActions = ['focus', 'delete'] as const;

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
    this.focusedId.set(localStorage.getItem('deepwork_focusTaskId'));
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
    localStorage.setItem('deepwork_focusTaskId', task.id);
    this.focusedId.set(task.id);
    this.router.navigate(['/dashboard']);
  }
}
