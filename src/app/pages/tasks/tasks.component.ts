import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { TaskService } from '../../core/services/task.service';
import { DbService } from '../../core/services/db.service';
import { TaskAddPrefill, TaskEditorService } from '../../core/services/task-editor.service';
import { Task, taskActivityIso } from '../../core/models/task.model';
import { ImportCommitResult } from '../../core/models/task-import.model';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { TaskImportPanelComponent } from '../../shared/components/task-import-panel/task-import-panel.component';
import { TaskExportPanelComponent } from '../../shared/components/task-export-panel/task-export-panel.component';
import {
  BoardMove,
  TaskBoardComponent,
} from '../../shared/components/task-board/task-board.component';
import { SearchFormModel, createSearchFormDefaults } from '../../shared/models/form.models';
import { isPinnedToToday } from '../../core/utils/task-day.util';
import {
  TaskDateGroup,
  groupAddDate,
  groupTasksByDate,
  sectionKeyFor,
} from './task-date-groups.view';
import { TASK_LINK_PARAMS, parseTaskDeepLink } from '../../core/utils/task-link.util';

type SortKey = 'updated' | 'priority' | 'deadline' | 'newest';

@Component({
  selector: 'app-tasks',
  imports: [
    FormField,
    TooltipDirective,
    TaskImportPanelComponent,
    TaskExportPanelComponent,
    TaskBoardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tasks-layout">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <h1 class="gradient-text page-title">Tasks</h1>
          <span class="task-count">{{ filteredTasks().length }} tasks</span>
        </div>
        <div class="header-actions">
          <button
            class="btn btn-outline btn-sm"
            type="button"
            (click)="exportOpen.set(true)"
            appTooltip="Export the task list to CSV (Excel)"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
          <button
            class="btn btn-outline btn-sm"
            type="button"
            (click)="openImportPanel()"
            appTooltip="Import tasks from an Excel or CSV file"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 9 12 4 17 9" />
              <line x1="12" y1="4" x2="12" y2="16" />
            </svg>
            Import
          </button>
          <button class="btn btn-primary btn-sm" type="button" (click)="openAddPanel()">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Task
          </button>
        </div>
      </div>

      <!-- Search & sort. The columns are the status filter now: every task is on
           the board, so there are no filter pills to click. -->
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
          <input type="text" placeholder="Search all tasks..." [formField]="searchForm.query" />
          @if (searchQuery()) {
            <button
              class="clear-search"
              type="button"
              (click)="clearSearch()"
              appTooltip="Clear search"
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
        <label class="sort-control">
          <span>Sort</span>
          <select [value]="sortBy()" (change)="onSortChange($event)">
            <option value="updated">Recently updated</option>
            <option value="priority">Priority</option>
            <option value="deadline">Deadline</option>
            <option value="newest">Newest</option>
          </select>
        </label>
        <button
          class="btn btn-outline btn-sm"
          type="button"
          (click)="toggleAllGroups()"
          [appTooltip]="allExpanded() ? 'Fold every date section' : 'Open every date section'"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            [class.open]="allExpanded()"
          >
            <polyline points="9,6 15,12 9,18" />
          </svg>
          {{ allExpanded() ? 'Collapse all' : 'Expand all' }}
        </button>
        <span class="board-hint"
          >Drag a card into another column to change its status · <kbd>1</kbd> <kbd>2</kbd>
          <kbd>3</kbd> with a card focused</span
        >
      </div>

      <!-- Date sections: each one folds away, and holds the status board inside,
           so cards are still dragged between To Do / In Progress / Done. -->
      @if (filteredTasks().length === 0) {
        <div class="board-empty">
          <div class="empty-state">
            <p>
              {{
                searchQuery()
                  ? 'No tasks match this search.'
                  : 'No tasks yet. Add your first task to get started.'
              }}
            </p>
            @if (!searchQuery()) {
              <div class="empty-actions">
                <button class="btn btn-primary btn-sm" type="button" (click)="openAddPanel()">
                  Add your first task
                </button>
                <button class="btn btn-outline btn-sm" type="button" (click)="openImportPanel()">
                  Import from Excel
                </button>
              </div>
            }
          </div>
        </div>
      } @else {
        <div class="date-groups" [class.multi-open]="openGroups().length > 1">
          @for (group of taskGroups(); track group.key) {
            <section class="date-group" [class.open]="isGroupOpen(group.key)">
              <div class="group-header-row">
                <button
                  class="group-header"
                  type="button"
                  [attr.aria-expanded]="isGroupOpen(group.key)"
                  [attr.aria-controls]="'task-group-' + group.key"
                  (click)="toggleGroup(group.key)"
                >
                  <svg
                    class="chevron"
                    [class.open]="isGroupOpen(group.key)"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                  >
                    <polyline points="9,6 15,12 9,18" />
                  </svg>
                  <span class="group-label">{{ group.label }}</span>
                  <span class="group-count">{{ group.tasks.length }}</span>
                  @if (group.doneCount > 0) {
                    <span class="group-done">{{ group.doneCount }} done</span>
                  }
                </button>

                <!-- A section that is one day can be added to. "Today" and
                     "Tomorrow" write their own date onto the new task. -->
                @if (addDateFor(group.key); as due) {
                  <button
                    class="group-add"
                    type="button"
                    [appTooltip]="'Add a task for ' + group.label"
                    [attr.aria-label]="'Add a task for ' + group.label"
                    (click)="addTaskInGroup(due)"
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
                  </button>
                }
              </div>

              @if (isGroupOpen(group.key)) {
                <div class="group-board" [id]="'task-group-' + group.key">
                  <app-task-board
                    [tasks]="group.tasks"
                    [actions]="boardActions"
                    emptyText="Drop a task here"
                    (moved)="onMoved($event)"
                    (opened)="openEditPanel($event)"
                    (editRequested)="openEditPanel($event)"
                    (todayToggled)="toggleToday($event)"
                    (deleteRequested)="deleteTask($event.id)"
                  />
                </div>
              }
            </section>
          }
        </div>
      }

      <!-- The task form is the shell's panel (see TaskEditorPanelComponent), so
           this page owns none: a card's Edit control asks for it and the board
           underneath stays exactly where it was. -->

      <!-- Import from Excel -->
      @if (importOpen()) {
        <app-task-import-panel (closed)="closeImportPanel()" (imported)="onTasksImported($event)" />
      }

      <!-- Export to CSV -->
      @if (exportOpen()) {
        <app-task-export-panel (closed)="exportOpen.set(false)" />
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
      .tasks-layout {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        gap: 16px;
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
      .header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .page-title {
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -0.5px;
      }
      .task-count {
        font-size: 12px;
        color: var(--color-text-muted);
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
        background: var(--control-bg);
        border: 1px solid rgba(139, 92, 246, 0.12);
        border-radius: 8px;
        min-height: 36px;
        padding: 0 12px;
        flex: 1;
        max-width: 320px;
      }
      .search-box svg {
        color: var(--color-text-muted);
        flex-shrink: 0;
      }
      .search-box input {
        background: transparent;
        border: none;
        outline: none;
        color: var(--color-text-primary);
        font-size: 13px;
        width: 100%;
        height: 20px;
        min-height: 0;
        padding: 0;
        line-height: 1.4;
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
      .sort-control {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--color-text-muted);
        font-size: 11px;
      }
      .sort-control select {
        padding: 6px 8px;
        border: 1px solid rgba(139, 92, 246, 0.12);
        border-radius: 8px;
        background: var(--control-bg);
        color: var(--color-text-secondary);
        font: inherit;
        cursor: pointer;
      }
      .board-hint {
        margin-left: auto;
        font-size: 11px;
        color: var(--color-text-muted);
      }
      .board-hint kbd {
        font-family: var(--font-mono);
        font-size: 10px;
        padding: 1px 5px;
        border: 1px solid rgba(139, 92, 246, 0.25);
        border-radius: 4px;
        color: var(--color-text-secondary);
      }
      @media (max-width: 1100px) {
        .board-hint {
          display: none;
        }
      }
      /* The title, the three header buttons and the filter row are all single
         rows designed for a window: at 320px they add up to roughly twice the
         width of the page, and a row that cannot fit turns the whole page into
         a sideways-scrolling canvas — the fixed top bar slides away with it.
         Stacking is also the order the controls are used in: what the page is,
         then what it is filtered by. */
      @media (max-width: 640px) {
        .page-header {
          flex-direction: column;
          align-items: stretch;
          gap: 10px;
        }
        .header-left {
          flex-wrap: wrap;
        }
        /* 'wrap' and not a column: three buttons stacked one per row is three
           full-width bars of chrome above the board, and two per row still fit
           at 320px. 'flex: 1 1 auto' lets them share the row evenly instead of
           leaving the second one short. */
        .header-actions {
          flex-wrap: wrap;
        }
        .header-actions .btn {
          flex: 1 1 auto;
          justify-content: center;
        }
        .filters-bar {
          flex-direction: column;
          align-items: stretch;
          gap: 8px;
        }
        /* The 320px cap is a desktop idea — there, a search box that stretched
           the whole toolbar would dwarf the sort control beside it. Here the
           row is a column, so the field takes all of it. */
        .search-box {
          max-width: none;
          min-height: 44px;
        }
        .clear-search {
          min-width: 44px;
          min-height: 44px;
        }
        .sort-control {
          flex-wrap: wrap;
        }
        .sort-control select {
          flex: 1 1 160px;
          min-width: 0;
        }
        /* Everything a thumb has to hit is 44px tall here. The desktop sizes
           above are untouched: this only widens the target, it never shrinks
           what is already there. */
        .btn {
          min-height: 44px;
        }
        /* The target is the whole width of the section header rather than just
           the word "Collapse all", so the length of the label does not decide
           how easy the control is to hit. */
        .filters-bar .btn {
          justify-content: center;
        }
      }

      .board-empty {
        flex: 1;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Date sections — the page's scroll area, not the board's. */
      .date-groups {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-right: 4px;
      }
      .date-groups::-webkit-scrollbar {
        width: 6px;
      }
      .date-groups::-webkit-scrollbar-thumb {
        background: rgba(139, 92, 246, 0.2);
        border-radius: 2px;
      }

      .date-group {
        flex-shrink: 0;
        overflow: hidden;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        border-radius: 14px;
        transition: border-color 0.2s;
      }
      .date-group.open {
        display: flex;
        flex-direction: column;
        border-color: rgba(139, 92, 246, 0.28);
      }
      /*
     * A single open section fills the space left under the filters. As soon as
     * another one is opened — by hand or with "Expand all" — every open section
     * keeps its own full-height board and the date area scrolls instead of
     * squeezing the columns.
     */
      .date-groups:not(.multi-open) .date-group.open {
        flex: 1 1 0;
      }
      .date-groups.multi-open .date-group.open {
        flex: 0 0 auto;
      }
      /* The header is the section's own row now: the fold control and the
         "+" that adds a task to that day sit side by side, so the add button is
         never nested inside the button that folds the section. */
      .group-header-row {
        display: flex;
        align-items: center;
      }
      .group-header {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        min-width: 0;
        padding: 10px 14px;
        border: none;
        background: transparent;
        color: var(--color-text-secondary);
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .group-add {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 30px;
        height: 30px;
        margin-right: 10px;
        border: 1px solid rgba(139, 92, 246, 0.25);
        border-radius: 8px;
        background: transparent;
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all 0.2s;
      }
      .group-add:hover {
        border-color: rgba(139, 92, 246, 0.6);
        color: var(--color-text-primary);
        background: rgba(139, 92, 246, 0.1);
      }
      .group-add:focus-visible {
        outline: 2px solid var(--color-accent-glow);
        outline-offset: 1px;
      }
      .group-header:hover {
        color: var(--color-text-primary);
        background: rgba(139, 92, 246, 0.06);
      }
      .group-header:focus-visible {
        outline: 2px solid var(--color-accent-glow);
        outline-offset: -2px;
      }
      .chevron {
        flex-shrink: 0;
        color: var(--color-text-muted);
        transition: transform 0.2s ease;
      }
      .chevron.open {
        transform: rotate(90deg);
      }
      .group-label {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.01em;
      }
      .group-count {
        font-size: 10px;
        padding: 1px 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: var(--color-text-muted);
        font-variant-numeric: tabular-nums;
      }
      .group-done {
        margin-left: auto;
        font-size: 10px;
        color: #34d399;
      }
      /* Every open section gets a board of its own; the columns scroll inside it. */
      .group-board {
        flex: 1 1 0;
        min-height: 220px;
        height: auto;
        padding: 0 10px 10px;
      }
      .date-groups.multi-open .group-board {
        flex: 0 0 auto;
        /* 'dvh' and not 'vh': on a phone 'vh' is the height the window would
           have with the URL bar hidden, which is taller than what is on screen,
           so a section measured with it puts its last rows under the browser
           chrome. The 'vh' line stays first as the fallback for a browser that
           does not know 'dvh'. */
        height: calc(100vh - 220px);
        height: calc(100dvh - 220px);
        min-height: 320px;
      }
      .group-board app-task-board {
        display: block;
        height: 100%;
      }
      /* A phone stacks the board's three columns instead of scrolling them
         sideways (see task-board.component.ts), and a stack is as tall as its
         cards — it cannot be read through a fixed-height window. Both sizes
         above assume a board that fits in the room left under the filters: the
         open section takes the leftover space, and each one in a multi-open
         page is measured against the window with 'calc(100dvh - …)'. Neither
         leaves room for a stack, so the section is allowed to grow and the
         page's own scroll region ('.date-groups') carries the length. */
      @media (max-width: 640px) {
        .date-groups:not(.multi-open) .date-group.open,
        .date-groups.multi-open .date-group.open {
          flex: 0 0 auto;
        }
        .group-board,
        .date-groups.multi-open .group-board {
          flex: 0 0 auto;
          height: auto;
          min-height: 0;
        }
        .group-board app-task-board {
          height: auto;
        }
        /* The section header row is the fold control and the "+" side by side.
           Its own height lands just under a thumb at the body's line height —
           10px of padding above and below a 12px label — so the row is given
           the missing pixels instead, and the "+" beside it gets the same. */
        .group-header {
          min-height: 48px;
        }
        .group-add {
          width: 44px;
          height: 44px;
        }
      }

      .empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 12px;
        padding: 60px 20px;
        color: var(--color-text-muted);
        font-size: 14px;
      }
      .empty-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: center;
      }

      .btn {
        padding: 8px 18px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
      }
      .btn-primary {
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        color: white;
      }
      .btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(139, 92, 246, 0.3);
      }
      .btn-primary:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
      }
      .btn-outline {
        background: transparent;
        color: var(--color-text-secondary);
        border: 1px solid rgba(139, 92, 246, 0.3);
      }
      .btn-outline:hover {
        border-color: rgba(139, 92, 246, 0.6);
        color: var(--color-text-primary);
      }
      .btn-sm {
        padding: 6px 14px;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .btn-sm svg {
        transition: transform 0.2s ease;
      }
      .btn-sm svg.open {
        transform: rotate(90deg);
      }
      /* ===== Large screens =====

         Every rule above assumes a window, and a window has no upper bound: past
         1920px the page column keeps growing and each row built for it stretches
         with the column. On a 3840px screen that put the title and the three
         header buttons at opposite ends of a 2000px band with nothing between
         them, spread the toolbar the same way, and left an open date section a
         metre wide around three board columns of about 680px each.

         So the rows the page is made of — the header, the toolbar, and the date
         sections that hold the boards — stop at 1600px and centre themselves in
         the column. One width and therefore one pair of edges: the title, the
         search field and the first board column all start on the same line, and
         the page reads as a band that was placed in the window rather than as
         three rows that each happen to be as wide as the monitor. 1600px is the
         width the board wants (see task-board.component.ts): three columns of
         about 520px, which is what a card needs to hold a title, its badges and
         its controls in one glance. */
      @media (min-width: 1920px) {
        .page-header,
        .filters-bar,
        .date-groups {
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

         Past 2560px this page is the same picture read from three metres away —
         a sofa, a meeting room, a wall — which is the distance the ladder in
         styles.css climbs for. Every label below takes a step up that ladder
         rather than a new size of its own, so the section headings, the toolbar
         and the buttons stay in proportion with the board they sit above. */
      @media (min-width: 2560px) {
        .task-count,
        .group-label,
        .sort-control {
          font-size: var(--text-sm);
        }
        .group-count,
        .group-done {
          font-size: var(--text-2xs);
        }
        .group-count {
          padding: 2px 10px;
        }
        /* The one sentence on the page, and the only place the drag and keyboard
           shortcuts are written down: at 11px it is a grey line across a room.
           Raised, the toolbar still fits its band on one line — about 1375px of
           the 1600px it has. */
        .board-hint {
          font-size: var(--text-sm);
        }
        .board-hint kbd {
          font-size: var(--text-2xs);
        }
        /* The header's three buttons are how this page is used, and 12px was a
           caption size. The small-button rule is repeated after this one on
           purpose: both selectors are a single class, so among equal weights the
           later rule is what sizes a small button. */
        .btn {
          padding: 10px 20px;
          font-size: var(--text-base);
        }
        .btn-sm {
          padding: 8px 16px;
          font-size: var(--text-sm);
        }
        /* The ladder takes every form control to 18px past 2560px, and this
           field's box was drawn around a 13px line: the 20px height it pins the
           input to clips the taller text top and bottom. The input is allowed
           its own height instead, and the box widens and grows to sit level with
           the sort control beside it, which the ladder has just made taller. */
        .search-box {
          min-height: 40px;
          max-width: 400px;
        }
        .search-box input {
          height: auto;
          min-height: 26px;
        }
        .sort-control select {
          padding: 8px 10px;
        }
        /* The board inside a section now holds 16px cards, so the section's own
           frame grows to match and the sections get more air between them. */
        .group-board {
          padding: 0 16px 16px;
        }
        .date-groups {
          gap: 14px;
        }
        .tasks-layout {
          gap: 20px;
        }
        /* When there is no board the empty state is the whole page, so its line
           is read at the same distance as a card title. */
        .empty-state {
          font-size: var(--text-md);
        }
      }
    `,
  ],
})
export class TasksComponent implements OnInit {
  private taskService = inject(TaskService);
  private db = inject(DbService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  sortBy = signal<SortKey>('updated');
  importOpen = signal(false);
  exportOpen = signal(false);
  /** Task ids on the board when the import panel opened — see `onTasksImported`. */
  private idsBeforeImport = new Set<string>();

  /** The app's one task form, which this page opens rather than owns. */
  private readonly taskEditor = inject(TaskEditorService);
  /** The save this page has already answered — see the effect below. */
  private answeredSaveId = 0;

  constructor() {
    // A task added through the panel has to be reachable: its deadline decides
    // which date section it lands in, and a section left folded would read as a
    // task that vanished. The panel reports what it wrote, and the request id is
    // what keeps one save from being answered twice.
    effect(() => {
      const save = this.taskEditor.lastSave();
      if (!save || save.requestId === this.answeredSaveId) return;
      untracked(() => {
        this.answeredSaveId = save.requestId;
        if (save.created) this.openSectionsFor([save.task]);
      });
    });

    // Keep the open sections in step with what is on the page: the newest
    // section opens on first paint, a section that disappears (a search, an
    // edit, a delete) drops out of the list, and a search opens its matches.
    effect(() => {
      const groups = this.taskGroups();
      const keys = groups.map((group) => group.key);
      const searching = this.searchQuery().trim() !== '';
      const previous = untracked(() => this.openGroups());

      if (!keys.length) {
        if (previous.length) this.openGroups.set([]);
        return;
      }

      if (searching) {
        if (keys.some((key) => !previous.includes(key))) this.openGroups.set(keys);
        return;
      }

      if (!untracked(() => this.groupsInitialised)) {
        this.groupsInitialised = true;
        this.openGroups.set([this.defaultOpenKey(groups)]);
        return;
      }

      const surviving = previous.filter((key) => keys.includes(key));
      if (surviving.length !== previous.length) {
        this.openGroups.set(surviving.length ? surviving : [this.defaultOpenKey(groups)]);
      }
    });
  }

  /** Buttons every card on this page carries. */
  readonly boardActions = ['today', 'edit', 'delete'] as const;

  // Search form
  private readonly searchModel = signal<SearchFormModel>(createSearchFormDefaults());
  readonly searchForm = form(this.searchModel);
  readonly searchQuery = computed(() => this.searchModel().query);

  /**
   * The board is the list: search narrows it, the sort control orders every
   * column, and the columns themselves are the status filter — so no task is
   * ever hidden behind a pill. What survives is then filed into date sections.
   */
  filteredTasks = computed(() => {
    let tasks = this.taskService.tasks();
    const q = this.searchQuery().toLowerCase();
    if (q) {
      tasks = tasks.filter(
        (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
      );
    }
    return [...tasks].sort((a, b) => this.compareTasks(a, b, this.sortBy()));
  });

  // ── Date sections ──────────────────────────────────────────────────────────
  /** The tasks, filed by their own date — today first, then back through time. */
  readonly taskGroups = computed<TaskDateGroup[]>(() => groupTasksByDate(this.filteredTasks()));

  /** Sections the user has open. Today starts open; the rest are one click away. */
  readonly openGroups = signal<string[]>([]);
  private groupsInitialised = false;

  readonly allExpanded = computed(() => {
    const keys = this.taskGroups().map((group) => group.key);
    return keys.length > 0 && keys.every((key) => this.openGroups().includes(key));
  });

  isGroupOpen(key: string): boolean {
    return this.openGroups().includes(key);
  }

  /** Sections open independently, so yesterday can be read next to today. */
  toggleGroup(key: string): void {
    const open = this.openGroups();
    this.openGroups.set(open.includes(key) ? open.filter((k) => k !== key) : [...open, key]);
  }

  toggleAllGroups(): void {
    this.openGroups.set(this.allExpanded() ? [] : this.taskGroups().map((group) => group.key));
  }

  /**
   * Opens the sections the given tasks belong to, keeping the rest as they were.
   * Anything just added or imported should be visible, wherever its date puts it.
   */
  private openSectionsFor(tasks: readonly Task[]): void {
    if (!tasks.length) return;
    // Revealing a task settles which sections are open, so the "first paint
    // opens one section" branch below cannot overwrite it afterwards — the
    // imported tasks write into the list before this runs.
    this.groupsInitialised = true;
    const keys = new Set(this.openGroups());
    for (const task of tasks) keys.add(sectionKeyFor(task));
    this.openGroups.set([...keys]);
  }

  /** What to open for the user: today when it has tasks, otherwise the newest. */
  private defaultOpenKey(groups: TaskDateGroup[]): string {
    return (groups.find((group) => group.key === 'today') ?? groups[0]).key;
  }

  async ngOnInit(): Promise<void> {
    await this.db.init();
    await this.taskService.loadTasks();
    // The Tasks page is a deep link like any other, so it opens the day the same
    // way the boards do: expired work closed, quadrants re-asked, today's
    // recurring instances in place.
    await this.taskService.runDailyUpkeep();
    await this.answerDeepLink();
  }

  /**
   * Answers a `/tasks` link that names a task or an add form.
   *
   * Nothing in the app navigates like this any more — every Edit control opens
   * the shell's panel in place — but a link is an address, and one that was
   * bookmarked, shared or handed over from an older version still means what it
   * said: `?edit=<id>` opens that task, `?add=1` (with an optional `date`,
   * `quadrant` and `today`) opens the form already filled in.
   *
   * Both are one-shot instructions rather than page state, so they are cleared
   * out of the URL before the user can reload or bookmark a panel that has
   * since been closed. Only the parameters are rewritten; the page itself does
   * not move.
   */
  private async answerDeepLink(): Promise<void> {
    const link = parseTaskDeepLink((name) => this.route.snapshot.queryParamMap.get(name));

    if (link.editId) {
      // A link whose task is gone (deleted between the click and the load)
      // simply leaves the page as it is; the parameter is still cleared below.
      const task = this.taskService.tasks().find((candidate) => candidate.id === link.editId);
      if (task) this.openEditPanel(task);
    } else if (link.add) {
      this.openAddPanel({
        deadline: link.deadline,
        quadrant: link.quadrant,
        addToToday: link.addToToday,
      });
    }

    if (!link.present) return;
    const cleared: Record<string, null> = {};
    for (const name of TASK_LINK_PARAMS) cleared[name] = null;
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: cleared,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /**
   * Opens the Add Task form, optionally already decided.
   *
   * Defaults come from the panel — today's date, P3, no quadrant — and a caller
   * only overrides the one thing its button promised: the "+" in a date section
   * sets the day, the Matrix's per-quadrant "+" sets the quadrant, and the Today
   * page's button also asks for the new task to land on today's list.
   *
   * The form is the shell's panel, so asking for it never moves this page: the
   * board, the search and the open sections are still there behind it.
   */
  openAddPanel(prefill: TaskAddPrefill = {}): void {
    this.taskEditor.openAdd(prefill);
  }

  /** The day a section's "+" writes onto a new task, or '' when it has none. */
  addDateFor(groupKey: string): string {
    return groupAddDate(groupKey);
  }

  /** A task added from a date section's header belongs to that day. */
  addTaskInGroup(deadline: string): void {
    this.openAddPanel({ deadline });
  }

  /**
   * The import writes into the task list itself, so the ids that were there
   * before the panel opened are how the page tells what the file brought in.
   */
  openImportPanel(): void {
    this.idsBeforeImport = new Set(this.taskService.tasks().map((task) => task.id));
    this.importOpen.set(true);
  }

  /** Opens the app's one task form on `task`, without leaving this page. */
  openEditPanel(task: Task): void {
    this.taskEditor.openEdit(task);
  }

  closeImportPanel(): void {
    this.importOpen.set(false);
  }

  /** Called after the importer wrote tasks, so the board reflects the database. */
  async onTasksImported(result: ImportCommitResult): Promise<void> {
    if (result.created <= 0) return;
    await this.taskService.loadTasks();
    // A task with a deadline in another month lives in that month's section, and
    // a card that lands in a folded section reads as a task the import lost.
    this.openSectionsFor(
      this.taskService.tasks().filter((task) => !this.idsBeforeImport.has(task.id)),
    );
  }

  /**
   * Dropping a card in another column *is* the status change. Dropping inside
   * its own column changes nothing: the list is sorted, not hand-ordered.
   */
  async onMoved(move: BoardMove): Promise<void> {
    if (move.task.status === move.status) return;
    await this.taskService.setStatus(move.task, move.status);
  }

  async toggleToday(task: Task): Promise<void> {
    if (isPinnedToToday(task)) {
      await this.taskService.removeFromToday(task.id);
    } else {
      await this.taskService.addToToday(task.id);
    }
  }

  async deleteTask(id: string): Promise<void> {
    await this.taskService.deleteTask(id);
  }

  clearSearch(): void {
    this.searchModel.set(createSearchFormDefaults());
  }

  onSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as SortKey;
    if (value === 'updated' || value === 'priority' || value === 'deadline' || value === 'newest') {
      this.sortBy.set(value);
    }
  }

  private compareTasks(a: Task, b: Task, sortBy: SortKey): number {
    if (sortBy === 'updated') {
      // Newest activity first; ties keep the more important task on top.
      return taskActivityIso(b).localeCompare(taskActivityIso(a)) || a.priority - b.priority;
    }
    if (sortBy === 'priority') {
      return a.priority - b.priority || taskActivityIso(b).localeCompare(taskActivityIso(a));
    }
    if (sortBy === 'deadline') {
      const aDeadline = a.deadline ?? '9999-12-31';
      const bDeadline = b.deadline ?? '9999-12-31';
      return aDeadline.localeCompare(bDeadline) || a.priority - b.priority;
    }
    return b.createdAt.localeCompare(a.createdAt);
  }
}
