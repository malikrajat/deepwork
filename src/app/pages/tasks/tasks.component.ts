import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { form, FormField, required, validate, maxLength, submit } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { TaskService } from '../../core/services/task.service';
import { DbService } from '../../core/services/db.service';
import {
  Task,
  TaskQuadrant,
  RecurrenceConfig,
  taskActivityIso,
} from '../../core/models/task.model';
import { ImportCommitResult } from '../../core/models/task-import.model';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { FormFieldWrapperComponent } from '../../shared/components/form-field/form-field-wrapper.component';
import { TaskImportPanelComponent } from '../../shared/components/task-import-panel/task-import-panel.component';
import { TaskExportPanelComponent } from '../../shared/components/task-export-panel/task-export-panel.component';
import {
  BoardMove,
  TaskBoardComponent,
} from '../../shared/components/task-board/task-board.component';
import { QUADRANT_CONFIG } from '../../core/constants/theme.constants';
import {
  TaskFormModel,
  SearchFormModel,
  createTaskFormDefaults,
  createSearchFormDefaults,
} from '../../shared/models/form.models';
import { noXss, trimmedRequired, futureDate } from '../../shared/validators/form-validators';
import { TaskDateGroup, groupTasksByDate, sectionKeyFor } from './task-date-groups.view';
import { TASK_DESCRIPTION_MAX_LENGTH, TASK_TITLE_MAX_LENGTH } from '../../core/models/task.model';

type SortKey = 'updated' | 'priority' | 'deadline' | 'newest';

/** Readable names for the priority options, used in the defaults summary. */
const PRIORITY_LABELS: Record<string, string> = {
  '1': 'P1 Critical',
  '2': 'P2 High',
  '3': 'P3 Medium',
  '4': 'P4 Low',
};

@Component({
  selector: 'app-tasks',
  imports: [
    FormField,
    TooltipDirective,
    FormFieldWrapperComponent,
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

              @if (isGroupOpen(group.key)) {
                <div class="group-board" [id]="'task-group-' + group.key">
                  <app-task-board
                    [tasks]="group.tasks"
                    [actions]="boardActions"
                    emptyText="Drop a task here"
                    (moved)="onMoved($event)"
                    (opened)="openEditPanel($event)"
                    (todayToggled)="toggleToday($event)"
                    (deleteRequested)="deleteTask($event.id)"
                  />
                </div>
              }
            </section>
          }
        </div>
      }

      <!-- Slide-in Panel -->
      @if (panelOpen()) {
        <div class="panel-backdrop" (click)="closePanel()"></div>
        <div class="slide-panel">
          <div class="panel-header">
            <h2>{{ editingTask() ? 'Edit Task' : 'New Task' }}</h2>
            <button class="icon-btn" (click)="closePanel()">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <form class="panel-form" (submit)="onSubmitTask($event)">
            <app-form-field label="Title" [fieldState]="taskForm.title()" [hint]="titleHint()">
              <input
                #taskTitleInput
                type="text"
                [formField]="taskForm.title"
                placeholder="What needs to be done?"
              />
            </app-form-field>

            <!-- A title is enough: state plainly what the hidden fields will be -->
            <p class="defaults-note">
              Only a title is needed. It is saved with <strong>{{ advancedSummary() }}</strong
              >.
              <span
                >Title up to {{ titleMax }} characters · description up to
                {{ descriptionMax }} characters.</span
              >
            </p>

            <button
              class="advanced-toggle"
              type="button"
              [attr.aria-expanded]="advancedOpen()"
              (click)="advancedOpen.set(!advancedOpen())"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                [class.open]="advancedOpen()"
              >
                <polyline points="9,6 15,12 9,18" />
              </svg>
              {{ advancedOpen() ? 'Hide advanced options' : 'Advanced options' }}
            </button>

            @if (advancedOpen()) {
              <div class="advanced-fields">
                <app-form-field
                  label="Description"
                  [fieldState]="taskForm.description()"
                  [hint]="descriptionHint()"
                >
                  <textarea
                    [formField]="taskForm.description"
                    rows="3"
                    placeholder="Optional details..."
                  ></textarea>
                </app-form-field>
                <div class="form-row">
                  <app-form-field label="Priority" [fieldState]="taskForm.priority()">
                    <select [formField]="taskForm.priority">
                      <option value="1">P1 — Critical</option>
                      <option value="2">P2 — High</option>
                      <option value="3">P3 — Medium</option>
                      <option value="4">P4 — Low</option>
                    </select>
                  </app-form-field>
                  <app-form-field label="Quadrant" [fieldState]="taskForm.quadrant()">
                    <select [formField]="taskForm.quadrant">
                      <option value="">Unassigned</option>
                      <option value="urgent-important">Urgent + Important</option>
                      <option value="important">Important</option>
                      <option value="urgent">Urgent</option>
                      <option value="neither">Neither</option>
                    </select>
                  </app-form-field>
                </div>
                <app-form-field
                  label="Deadline"
                  [fieldState]="taskForm.deadline()"
                  hint="Starts on today — move it to any later day, or clear it for no deadline"
                >
                  <input type="date" [formField]="taskForm.deadline" />
                </app-form-field>
                <!-- Recurrence config -->
                <app-form-field label="Repeat" [fieldState]="taskForm.recurFrequency()">
                  <select [formField]="taskForm.recurFrequency">
                    <option value="">No repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </app-form-field>
                @if (taskFormModel().recurFrequency) {
                  <div class="recurrence-options">
                    @if (taskFormModel().recurFrequency === 'weekly') {
                      <div class="form-group">
                        <label>Days</label>
                        <div class="day-picker">
                          @for (d of weekDays; track d.value) {
                            <button
                              type="button"
                              class="day-btn"
                              [class.active]="formRecurDays.includes(d.value)"
                              (click)="toggleDay(d.value)"
                            >
                              {{ d.label }}
                            </button>
                          }
                        </div>
                      </div>
                    }
                    <app-form-field
                      label="End date (optional)"
                      [fieldState]="taskForm.recurEndDate()"
                    >
                      <input type="date" [formField]="taskForm.recurEndDate" />
                    </app-form-field>
                  </div>
                }
              </div>
            }
            <div class="form-actions">
              <button type="button" class="btn btn-ghost" (click)="closePanel()">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="taskForm().invalid()">
                {{ editingTask() ? 'Save Changes' : 'Create Task' }}
              </button>
            </div>
          </form>
        </div>
      }
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
      .group-header {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 10px 14px;
        border: none;
        background: transparent;
        color: var(--color-text-secondary);
        font: inherit;
        text-align: left;
        cursor: pointer;
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
        height: calc(100vh - 220px);
        min-height: 320px;
      }
      .group-board app-task-board {
        display: block;
        height: 100%;
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

      /* Slide Panel */
      .panel-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 100;
        backdrop-filter: blur(2px);
      }
      .slide-panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 420px;
        max-width: 90vw;
        background: var(--color-bg-secondary);
        border-left: 1px solid rgba(139, 92, 246, 0.15);
        z-index: 101;
        display: flex;
        flex-direction: column;
        padding: 24px;
        animation: slide-in 0.2s ease-out;
      }
      @keyframes slide-in {
        from {
          transform: translateX(100%);
        }
        to {
          transform: translateX(0);
        }
      }
      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 24px;
      }
      .panel-header h2 {
        font-size: 18px;
        font-weight: 700;
      }
      .panel-form {
        display: flex;
        flex-direction: column;
        gap: 18px;
        flex: 1;
      }
      .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .form-group label {
        font-size: 12px;
        font-weight: 600;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .form-group input,
      .form-group textarea,
      .form-group select {
        background: var(--control-bg);
        border: 1px solid rgba(139, 92, 246, 0.12);
        border-radius: 10px;
        padding: 10px 14px;
        color: var(--color-text-primary);
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }
      .form-group input:focus,
      .form-group textarea:focus,
      .form-group select:focus {
        border-color: rgba(139, 92, 246, 0.4);
      }
      .form-group textarea {
        resize: vertical;
        min-height: 80px;
      }
      .form-group select {
        cursor: pointer;
      }
      .form-group select option {
        background: var(--color-bg-secondary);
      }
      .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .form-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        margin-top: auto;
        padding-top: 16px;
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
      .btn-ghost {
        background: transparent;
        color: var(--color-text-muted);
      }
      .btn-ghost:hover {
        color: var(--color-text-primary);
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
      .icon-btn {
        width: 28px;
        height: 28px;
        border-radius: 8px;
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
      .recurrence-options {
        padding: 8px 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .defaults-note {
        margin: -6px 0 0;
        padding: 9px 12px;
        border-radius: 10px;
        font-size: 12px;
        line-height: 1.5;
        color: var(--color-text-muted);
        background: rgba(139, 92, 246, 0.07);
        border: 1px solid rgba(139, 92, 246, 0.16);
      }
      .defaults-note strong {
        color: var(--color-text-secondary);
      }
      .defaults-note span {
        display: block;
        margin-top: 3px;
        opacity: 0.85;
      }
      .advanced-toggle {
        display: flex;
        align-items: center;
        gap: 7px;
        align-self: flex-start;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--color-text-secondary);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .advanced-toggle:hover {
        color: var(--color-text-primary);
      }
      .advanced-toggle svg {
        transition: transform 0.2s ease;
        color: var(--color-text-muted);
      }
      .advanced-toggle svg.open {
        transform: rotate(90deg);
      }
      .advanced-fields {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .day-picker {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }
      .day-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 1px solid rgba(139, 92, 246, 0.3);
        background: transparent;
        color: var(--color-text-muted);
        cursor: pointer;
        font-size: 11px;
        transition: all 0.2s;
      }
      .day-btn.active {
        background: rgba(139, 92, 246, 0.3);
        border-color: rgba(139, 92, 246, 0.7);
        color: var(--color-text-primary);
      }
      .day-btn:hover {
        border-color: rgba(139, 92, 246, 0.6);
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
  panelOpen = signal(false);
  editingTask = signal<Task | null>(null);
  /** The rest of the form, folded away behind "Advanced options". */
  readonly advancedOpen = signal(false);
  importOpen = signal(false);
  exportOpen = signal(false);
  /** Task ids on the board when the import panel opened — see `onTasksImported`. */
  private idsBeforeImport = new Set<string>();

  /** The panel's title field — focused as soon as the panel opens. */
  private readonly taskTitleInput = viewChild<ElementRef<HTMLInputElement>>('taskTitleInput');

  constructor() {
    // `autofocus` does nothing for markup the browser first sees when the panel
    // is opened, so the title is focused here — the same way the quick-add
    // dialog does it. Adding a task asks for a title, so that is where the
    // cursor belongs; editing starts there too.
    effect(() => {
      if (!this.panelOpen()) return;
      this.taskTitleInput()?.nativeElement.focus();
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
  readonly boardActions = ['today', 'delete'] as const;

  // Search form
  private readonly searchModel = signal<SearchFormModel>(createSearchFormDefaults());
  readonly searchForm = form(this.searchModel);
  readonly searchQuery = computed(() => this.searchModel().query);

  // Task add/edit form with validation schema
  readonly taskFormModel = signal<TaskFormModel>(createTaskFormDefaults());
  readonly taskForm = form(this.taskFormModel, (s) => {
    // Title is required and must be safe
    required(s.title, { message: 'Task title is required' });
    validate(s.title, trimmedRequired);
    validate(s.title, noXss);
    maxLength(s.title, TASK_TITLE_MAX_LENGTH, {
      message: `Title must be ${TASK_TITLE_MAX_LENGTH} characters or fewer`,
    });

    // Description security
    validate(s.description, noXss);
    maxLength(s.description, TASK_DESCRIPTION_MAX_LENGTH, {
      message: `Description must be ${TASK_DESCRIPTION_MAX_LENGTH} characters or fewer`,
    });

    // Priority is required
    required(s.priority, { message: 'Priority is required' });

    // Deadline must be future if set
    validate(s.deadline, futureDate);
  });
  formRecurDays: number[] = [];

  /**
   * Shared task limits. `maxLength()` on the form schema also writes the native
   * `maxlength` attribute, so the input stops at the cap while typing; these
   * hints just make the cap visible.
   */
  readonly titleMax = TASK_TITLE_MAX_LENGTH;
  readonly descriptionMax = TASK_DESCRIPTION_MAX_LENGTH;
  readonly titleHint = computed(
    () => `${this.taskFormModel().title.trim().length}/${TASK_TITLE_MAX_LENGTH} characters`,
  );
  readonly descriptionHint = computed(
    () =>
      `${this.taskFormModel().description.trim().length}/${TASK_DESCRIPTION_MAX_LENGTH} characters`,
  );

  /**
   * What the folded-away fields will be, in plain words — so the Add form can be
   * a single title field without anyone having to guess what gets saved.
   */
  readonly advancedSummary = computed(() => {
    const model = this.taskFormModel();
    const priority = PRIORITY_LABELS[model.priority] ?? 'P3 Medium';
    const today = createTaskFormDefaults().deadline;
    const due = !model.deadline
      ? 'no deadline'
      : model.deadline === today
        ? 'due today'
        : `due ${new Date(`${model.deadline}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
    const quadrant = model.quadrant
      ? QUADRANT_CONFIG[model.quadrant as TaskQuadrant].label
      : 'no quadrant';
    const repeat = model.recurFrequency ? `repeats ${model.recurFrequency}` : 'no repeat';
    return `${priority} · ${due} · ${quadrant} · ${repeat}`;
  });

  weekDays = [
    { label: 'Sun', value: 0 },
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
  ];

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
    if (this.route.snapshot.queryParamMap.get('add') === '1') {
      this.openAddPanel();
      await this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { add: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  openAddPanel(): void {
    this.editingTask.set(null);
    // `reset` clears touched/dirty on the whole field tree, so a previously
    // submitted form cannot reopen with its validation messages already shown.
    this.taskForm().reset(createTaskFormDefaults());
    this.formRecurDays = [];
    // Adding a task asks for a title; everything else keeps its default until
    // the user opens Advanced options.
    this.advancedOpen.set(false);
    this.panelOpen.set(true);
  }

  /**
   * The import writes into the task list itself, so the ids that were there
   * before the panel opened are how the page tells what the file brought in.
   */
  openImportPanel(): void {
    this.idsBeforeImport = new Set(this.taskService.tasks().map((task) => task.id));
    this.importOpen.set(true);
  }

  openEditPanel(task: Task): void {
    this.editingTask.set(task);
    this.taskForm().reset({
      title: task.title,
      description: task.description,
      priority: String(task.priority),
      quadrant: task.quadrant ?? '',
      deadline: task.deadline ?? '',
      recurFrequency: task.recurrence?.frequency ?? '',
      recurEndDate: task.recurrence?.endDate ?? '',
    });
    this.formRecurDays = task.recurrence?.days ? [...task.recurrence.days] : [];
    // Editing shows the whole form: the values are the point of the edit.
    this.advancedOpen.set(true);
    this.panelOpen.set(true);
  }

  closePanel(): void {
    this.panelOpen.set(false);
    this.editingTask.set(null);
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

  onSubmitTask(event: Event): void {
    event.preventDefault();
    submit(this.taskForm, async () => {
      const formData = this.taskFormModel();
      const recurrence: RecurrenceConfig | null = formData.recurFrequency
        ? {
            frequency: formData.recurFrequency as 'daily' | 'weekly' | 'monthly',
            interval: 1,
            days: this.formRecurDays.length > 0 ? this.formRecurDays : undefined,
            endDate: formData.recurEndDate || undefined,
          }
        : null;
      const existing = this.editingTask();
      if (existing) {
        await this.taskService.updateTask({
          ...existing,
          title: formData.title.trim(),
          description: formData.description.trim(),
          priority: Number(formData.priority) as 1 | 2 | 3 | 4,
          quadrant: (formData.quadrant || null) as TaskQuadrant | null,
          deadline: formData.deadline || null,
          recurrence,
        });
      } else {
        const created = await this.taskService.createTask({
          title: formData.title.trim(),
          description: formData.description.trim(),
          priority: Number(formData.priority) as 1 | 2 | 3 | 4,
          quadrant: (formData.quadrant || null) as TaskQuadrant | null,
          deadline: formData.deadline || null,
          recurrence,
        });
        // Its deadline decides the section, so a task for another month opens
        // that month instead of disappearing into a folded header.
        this.openSectionsFor([created]);
      }
      this.closePanel();
    });
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
    if (task.todayOrder !== null) {
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

  toggleDay(day: number): void {
    const idx = this.formRecurDays.indexOf(day);
    if (idx >= 0) {
      this.formRecurDays.splice(idx, 1);
    } else {
      this.formRecurDays.push(day);
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
