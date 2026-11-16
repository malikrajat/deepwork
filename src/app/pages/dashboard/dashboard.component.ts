import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { form, FormField } from '@angular/forms/signals';
import { AnimatedClockComponent } from '../../shared/components/animated-clock/animated-clock.component';
import { TimelineBarComponent } from '../../shared/components/timeline-bar/timeline-bar.component';
import { ConfettiComponent } from '../../shared/components/confetti/confetti.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { DesktopPrefsPanelComponent } from '../../shared/components/desktop-prefs-panel/desktop-prefs-panel.component';
import { WaterCardComponent } from '../../shared/components/water-card/water-card.component';
import { DeskHealthCardComponent } from '../../shared/components/desk-health-card/desk-health-card.component';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { TimerService } from '../../core/services/timer.service';
import { NotificationService } from '../../core/services/notification.service';
import { DbService } from '../../core/services/db.service';
import { TaskService } from '../../core/services/task.service';
import { SettingsService } from '../../core/services/settings.service';
import { UiService } from '../../core/services/ui.service';
import { PomodoroSession, TimerType } from '../../core/models/session.model';
import { Task, TaskQuadrant } from '../../core/models/task.model';
import { QUADRANT_CONFIG, TIMER_TYPE_CONFIG } from '../../core/constants/theme.constants';
import { TaskEditorService } from '../../core/services/task-editor.service';
import { readFocusedTaskId, saveFocusedTaskId } from '../../core/utils/focus-task.util';
import { localDayKey } from '../../core/utils/nudge-schedule.util';
import { TaskSelectFormModel, createTaskSelectFormDefaults } from '../../shared/models/form.models';

/** One row in the dashboard command palette. */
interface DashboardCommand {
  id: string;
  label: string;
  hint: string;
  keywords: string;
  group: 'Timer' | 'Tasks' | 'Pages' | 'Help';
  icon: IconName;
  shortcut?: string;
  run: () => void;
}

@Component({
  selector: 'app-dashboard',
  imports: [
    AnimatedClockComponent,
    TimelineBarComponent,
    ConfettiComponent,
    TooltipDirective,
    FormField,
    DesktopPrefsPanelComponent,
    WaterCardComponent,
    DeskHealthCardComponent,
    IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown)': 'onWindowKeydown($event)',
  },
  template: `
    <!-- ===== Fullscreen focus ===== -->
    @if (isFullscreen()) {
      <div
        class="fullscreen-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Focus timer fullscreen"
      >
        <div class="fullscreen-ambient" aria-hidden="true"></div>
        <button
          #exitFullscreenBtn
          class="exit-fullscreen-btn"
          type="button"
          (click)="toggleFullscreen()"
          aria-label="Exit fullscreen"
        >
          <app-icon name="contract" [size]="16" />
          Exit
        </button>
        <div class="fullscreen-clock">
          <app-animated-clock
            [displayTime]="timer.displayTime()"
            [progress]="timer.progress()"
            [timerType]="timer.timerType()"
          />
        </div>
        <div class="fullscreen-controls" role="group" aria-label="Timer controls">
          @if (timer.isRunning()) {
            <button class="btn btn-secondary btn-lg" type="button" (click)="timer.pause()">
              <app-icon name="pause" [size]="16" />
              Pause
            </button>
          } @else {
            <button class="btn btn-primary btn-lg" type="button" (click)="startTimer()">
              <app-icon name="play" [size]="16" />
              {{
                timer.remainingSeconds() < timer.totalDuration()
                  ? 'Resume'
                  : timer.timerType() === 'work'
                    ? 'Start Focus'
                    : 'Start Break'
              }}
            </button>
          }
          <button
            class="btn btn-ghost"
            type="button"
            (click)="stopTimer()"
            [disabled]="!timer.isRunning() && timer.remainingSeconds() === timer.totalDuration()"
            aria-label="Stop session"
            title="Stop session"
          >
            <app-icon name="stop" [size]="16" />
          </button>
          <button
            class="btn btn-ghost"
            type="button"
            (click)="skipTimer()"
            aria-label="Skip to the next phase"
            title="Skip to the next phase (S)"
          >
            <app-icon name="skip" [size]="16" />
          </button>
        </div>
      </div>
    }

    <!-- ===== Dashboard ===== -->
    <div class="dashboard-wrapper" [class.hidden]="isFullscreen() || ui.isNativeWidget()">
      <header class="dashboard-header animate-fade-in">
        <div class="dashboard-heading">
          <span class="eyebrow">{{ greeting() }}</span>
          <h1 class="page-title gradient-text">Dashboard</h1>
          <p class="page-subtitle">
            <time [attr.datetime]="todayKey()">{{ todayLabel() }}</time>
            <span class="subtitle-separator" aria-hidden="true">·</span>
            <span class="header-live" role="status" aria-live="polite">{{
              timerStateLabel()
            }}</span>
          </p>
        </div>
        <div class="header-actions">
          <button
            class="header-action palette-trigger"
            type="button"
            (click)="openPalette()"
            aria-label="Open the command palette"
            title="Command palette (Ctrl+K)"
          >
            <app-icon name="search" [size]="16" />
            <span class="header-action-label">Jump to anything</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button
            class="header-action icon-only"
            type="button"
            (click)="openShortcuts()"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            <app-icon name="help" [size]="17" />
          </button>
        </div>
      </header>

      <!-- Hero: clock + live rail -->
      <div class="main-row animate-fade-in-delay-1">
        <div class="timer-card">
          <div class="timer-card-inner">
            <div class="timer-ambient" aria-hidden="true"></div>

            <div class="timer-topbar">
              <div class="timer-mode-row">
                <span class="mode-chip" [attr.data-mode]="timer.timerType()">
                  <span class="mode-glyph" aria-hidden="true">
                    <app-icon [name]="timerModeIcon()" [size]="13" />
                  </span>
                  {{ timerModeLabel() }}
                </span>
                <span class="timer-state" [class.running]="timer.isRunning()">
                  <span class="state-dot" aria-hidden="true"></span>
                  {{ timer.isRunning() ? 'Running' : 'Ready' }}
                </span>
              </div>

              <div class="card-actions">
                <button
                  class="action-btn"
                  type="button"
                  title="Minimize to floating clock"
                  aria-label="Minimize to the floating mini widget"
                  (click)="toggleMiniMode()"
                  appTooltip="Mini widget — shrinks DeepWork into a small floating clock that always stays above your other windows. The window's own minimise button does the same thing. Drag it anywhere on your desktop; click the play button to run the timer, or the expand arrow (or press Esc) to bring the full window back."
                >
                  <app-icon name="mini" [size]="15" />
                </button>
                <button
                  #fullscreenActionBtn
                  class="action-btn"
                  type="button"
                  title="Fullscreen"
                  aria-label="Open fullscreen focus mode"
                  (click)="toggleFullscreen()"
                >
                  <app-icon name="fullscreen" [size]="15" />
                </button>
              </div>
            </div>

            <app-animated-clock
              [displayTime]="timer.displayTime()"
              [progress]="timer.progress()"
              [timerType]="timer.timerType()"
            />

            @if (taskGroups().length > 0) {
              <div class="task-selector">
                <div class="task-selector-pill">
                  <app-icon name="target" [size]="14" />
                  <label class="task-selector-label" for="dashboard-task-select">Focus task</label>
                  <div class="select-shell">
                    <select
                      id="dashboard-task-select"
                      [formField]="taskSelectForm.taskId"
                      (change)="onTaskSelect()"
                      [appTooltip]="selectedTaskFullTitle() || 'Link a task to this session'"
                    >
                      <option value="">No task linked</option>
                      @for (group of taskGroups(); track group.quadrant) {
                        <optgroup [label]="group.label">
                          @for (task of group.tasks; track task.id) {
                            <option [value]="task.id">{{ taskOptionLabel(task.title) }}</option>
                          }
                        </optgroup>
                      }
                    </select>
                    <app-icon class="select-chevron" name="chevron-down" [size]="14" />
                  </div>
                </div>
                @if (selectedTaskId() && selectedTaskQuadrant()) {
                  <span
                    class="selected-task-quadrant"
                    [class]="selectedTaskQuadrant()"
                    [attr.data-quadrant]="selectedTaskQuadrant()"
                  >
                    <app-icon [name]="quadrantIcon(selectedTaskQuadrant())" [size]="11" />
                    {{ quadrantFullLabel(selectedTaskQuadrant()) }}
                  </span>
                }
              </div>
            } @else {
              <div class="task-empty">
                <span class="task-empty-copy">
                  <app-icon name="target" [size]="14" />
                  No task linked to this session
                </span>
                <button class="task-empty-action" type="button" (click)="addTaskForToday()">
                  <app-icon name="plus" [size]="13" />
                  Add a task for today
                </button>
              </div>
            }

            <div class="timer-controls" role="group" aria-label="Timer controls">
              @if (timer.isRunning()) {
                <button class="btn btn-secondary btn-lg" type="button" (click)="timer.pause()">
                  <app-icon name="pause" [size]="16" />
                  Pause
                </button>
              } @else {
                <button class="btn btn-primary btn-lg" type="button" (click)="startTimer()">
                  <app-icon name="play" [size]="16" />
                  {{
                    timer.remainingSeconds() < timer.totalDuration()
                      ? 'Resume'
                      : timer.timerType() === 'work'
                        ? 'Start Focus'
                        : 'Start Break'
                  }}
                </button>
              }
              <button
                class="btn btn-ghost"
                type="button"
                (click)="stopTimer()"
                [disabled]="
                  !timer.isRunning() && timer.remainingSeconds() === timer.totalDuration()
                "
                aria-label="Stop session"
                title="Stop session"
              >
                <app-icon name="stop" [size]="16" />
              </button>
              <button
                class="btn btn-ghost"
                type="button"
                (click)="skipTimer()"
                aria-label="Skip to the next phase"
                title="Skip to the next phase (S)"
              >
                <app-icon name="skip" [size]="16" />
              </button>
            </div>

            <div class="timer-footer">
              <span class="cycle-caption">
                <strong>{{ cyclePosition() }}</strong> of {{ sessionsBeforeLongBreak() }} in this
                cycle
              </span>
              <div class="cycle-segments" aria-hidden="true">
                @for (step of cycleSteps(); track step.index) {
                  <span
                    class="cycle-segment"
                    [class.done]="step.done"
                    [class.current]="step.current"
                  ></span>
                }
              </div>
              <span class="timer-hints">
                <kbd>Space</kbd> start · <kbd>S</kbd> skip · <kbd>F</kbd> focus
              </span>
            </div>
          </div>
        </div>

        <aside class="focus-rail" aria-label="Today's focus status">
          <article class="rail-card goal-card">
            <div class="goal-main">
              <div
                class="goal-ring"
                role="progressbar"
                aria-label="Daily focus goal"
                [attr.aria-valuenow]="dailyGoalPercentage()"
                [attr.aria-valuetext]="dailyGoalValueText()"
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <defs>
                    <linearGradient id="goal-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#8b5cf6" />
                      <stop offset="100%" stop-color="#06b6d4" />
                    </linearGradient>
                  </defs>
                  <circle class="goal-ring-track" cx="60" cy="60" r="52" />
                  <circle
                    class="goal-ring-fill"
                    cx="60"
                    cy="60"
                    r="52"
                    [attr.stroke-dasharray]="goalRingCircumference"
                    [attr.stroke-dashoffset]="goalRingOffset()"
                  />
                </svg>
                <span class="goal-ring-label">
                  <strong>{{ completedWorkSessions() }}</strong>
                  <span>of {{ dailyGoalTarget }}</span>
                </span>
              </div>
              <div class="goal-copy">
                <span class="eyebrow">Daily focus goal</span>
                <h2>{{ dailyGoalMessage() }}</h2>
                <span class="goal-percent">{{ dailyGoalPercentage() }}% complete</span>
              </div>
            </div>
            <div class="goal-stats">
              <span class="goal-stat">
                <app-icon name="clock" [size]="13" />
                <span
                  ><strong>{{ focusTimeDisplay() }}</strong> focus</span
                >
              </span>
              <span class="goal-stat">
                <app-icon name="check" [size]="13" />
                <span
                  ><strong>{{ completedWorkSessions() }}</strong> sessions</span
                >
              </span>
              <span class="goal-stat">
                <app-icon name="coffee" [size]="13" />
                <span
                  ><strong>{{ completedBreakSessions() }}</strong> breaks</span
                >
              </span>
            </div>
          </article>

          <article class="rail-card cycle-card">
            <div class="insight-header">
              <div>
                <span class="eyebrow">Session cycle</span>
                <h2>Next long break</h2>
              </div>
              <span class="cycle-status" [class.break-ready]="timer.timerType() === 'long-break'">{{
                timer.timerType() === 'long-break' ? 'Long break ready' : 'In progress'
              }}</span>
            </div>
            <p>{{ nextBreakMessage() }}</p>
            <div class="cycle-row">
              <div class="cycle-dots" aria-hidden="true">
                @for (step of cycleSteps(); track step.index) {
                  <span class="cycle-dot" [class.done]="step.done" [class.current]="step.current">{{
                    step.index
                  }}</span>
                }
              </div>
              <div
                class="cycle-progress"
                role="progressbar"
                aria-label="Progress through the current session cycle"
                [attr.aria-valuenow]="cycleProgressPercent()"
                aria-valuemin="0"
                aria-valuemax="100"
                [attr.aria-valuetext]="
                  cyclePosition() + ' of ' + sessionsBeforeLongBreak() + ' sessions'
                "
              >
                <span [style.width.%]="cycleProgressPercent()"></span>
              </div>
            </div>
          </article>

          <article class="rail-card live-card" aria-labelledby="live-activity-title">
            <div class="insight-header">
              <div>
                <span class="eyebrow">Live activity</span>
                <h2 id="live-activity-title">Today's sessions</h2>
              </div>
              <span
                class="rail-count"
                [attr.aria-label]="
                  todaySessions().length + ' sessions today; scroll the list to see them all'
                "
              >
                {{ todaySessions().length }}
                @if (todaySessions().length > 3) {
                  <app-icon class="rail-count-cue" name="chevron-down" [size]="11" />
                }
              </span>
            </div>

            @if (sessionsLoading()) {
              <div class="live-loading" role="status" aria-live="polite">
                Loading today’s sessions…
              </div>
            } @else if (recentSessions().length > 0) {
              <ul class="activity-list" aria-label="Today's sessions, newest first" tabindex="0">
                @for (session of recentSessions(); track session.id) {
                  <li class="activity-item">
                    <span class="activity-glyph" [attr.data-type]="session.type" aria-hidden="true">
                      <app-icon [name]="sessionIcon(session.type)" [size]="13" />
                    </span>
                    <span class="activity-copy">
                      <span class="activity-title">{{ sessionTitle(session) }}</span>
                      <span class="activity-meta">
                        {{ sessionTypeLabel(session.type) }} · {{ sessionDuration(session) }}
                        @if (session.interrupted) {
                          <span class="activity-flag">Interrupted</span>
                        }
                      </span>
                    </span>
                    <time class="activity-time" [attr.datetime]="session.startedAt">{{
                      sessionClock(session)
                    }}</time>
                  </li>
                }
              </ul>
            } @else {
              <div class="live-empty">
                <span class="live-empty-icon" aria-hidden="true">
                  <app-icon name="sparkles" [size]="18" />
                </span>
                <p>No sessions yet. Your first focus block will appear here.</p>
                <button class="empty-action" type="button" (click)="startTimer()">
                  <app-icon name="play" [size]="12" />
                  Start your first session
                </button>
              </div>
            }
          </article>
        </aside>
      </div>

      <!-- Current task + one-tap actions -->
      <section class="focus-plan animate-fade-in-delay-2" aria-label="Focus plan and quick actions">
        <article class="insight-card task-card">
          <div class="task-head">
            <span class="card-icon" aria-hidden="true">
              <app-icon name="target" [size]="20" />
            </span>
            <div class="task-copy">
              <span class="eyebrow">Current focus</span>
              @if (activeTask(); as task) {
                <h2 [appTooltip]="task.title">{{ task.title }}</h2>
              } @else {
                <h2>Choose the one thing this session is for</h2>
              }
              <p class="task-meta">
                {{ openTodayTasks() }} open task{{ openTodayTasks() === 1 ? '' : 's' }} today ·
                {{ completedTodayTasks() }} completed
              </p>
            </div>
            @if (activeTask()?.quadrant; as quadrant) {
              <span class="task-priority" [attr.data-quadrant]="quadrant">
                <app-icon [name]="quadrantIcon(quadrant)" [size]="11" />
                {{ quadrantFullLabel(quadrant) }}
              </span>
            }
          </div>
          <div class="task-actions">
            <button
              class="insight-action"
              type="button"
              (click)="focusNextTask()"
              [disabled]="taskService.todayTasks().length === 0"
            >
              <app-icon name="arrow-right" [size]="14" />
              Focus next
            </button>
            <button class="insight-action secondary" type="button" (click)="addTaskForToday()">
              <app-icon name="plus" [size]="14" />
              Add task
            </button>
            <button
              class="icon-action"
              type="button"
              (click)="editActiveTask()"
              [disabled]="!activeTask()"
              aria-label="Edit the focused task"
              title="Edit task"
            >
              <app-icon name="edit" [size]="15" />
            </button>
            <button
              class="icon-action"
              type="button"
              (click)="clearFocusedTask()"
              [disabled]="!selectedTaskId()"
              aria-label="Clear the focused task"
              title="Clear task"
            >
              <app-icon name="x" [size]="15" />
            </button>
          </div>
          @if (!timer.isRunning() && focusQueue().length > 0) {
            <div class="task-queue" aria-label="Up next today">
              <span class="task-queue-label">Up next · one click to start</span>
              @for (task of focusQueue(); track task.id) {
                <button
                  class="queue-item"
                  type="button"
                  (click)="startTaskNow(task.id)"
                  [attr.aria-label]="'Start focus on ' + task.title"
                >
                  <span
                    class="queue-dot"
                    [attr.data-quadrant]="task.quadrant"
                    aria-hidden="true"
                  ></span>
                  <span class="queue-title">{{ task.title }}</span>
                  <app-icon name="play" [size]="12" />
                </button>
              }
            </div>
          }
        </article>

        <article class="quick-panel">
          <div class="quick-copy">
            <span class="eyebrow">Quick actions</span>
            <h2>One tap, straight back to focus</h2>
          </div>
          <div class="quick-action-list">
            @if (timer.isRunning()) {
              <button class="quick-action primary" type="button" (click)="timer.pause()">
                <app-icon name="pause" [size]="14" />
                Pause
                <kbd>Space</kbd>
              </button>
            } @else {
              <button class="quick-action primary" type="button" (click)="startTimer()">
                <app-icon name="play" [size]="14" />
                {{ quickStartLabel() }}
                <kbd>Space</kbd>
              </button>
            }
            <button class="quick-action" type="button" (click)="skipTimer()">
              <app-icon name="skip" [size]="13" />
              Skip {{ timer.timerType() === 'work' ? 'focus' : 'break' }}
            </button>
            <button class="quick-action" type="button" (click)="resetTimer()">
              <app-icon name="reset" [size]="13" />
              Reset
            </button>
          </div>
        </article>
      </section>

      <!-- Timeline -->
      <section class="activity-section animate-fade-in-delay-2" aria-labelledby="timeline-title">
        <div class="timeline-panel">
          <div class="timeline-panel-inner">
            <div class="panel-header">
              <app-icon name="clock" [size]="14" />
              <span id="timeline-title">Timeline</span>
              <span class="panel-meta"
                >{{ completedWorkSessions() }} focus · {{ completedBreakSessions() }} breaks</span
              >
            </div>
            <app-timeline-bar
              [sessions]="todaySessions()"
              [activeRunning]="timer.isRunning()"
              [activeType]="timer.timerType()"
              [activeStartedAt]="timer.activeStartedAt()"
              [activeElapsedSec]="activeElapsedSec()"
            />
          </div>
        </div>
      </section>

      <!-- Wellbeing and app behaviour -->
      <section
        class="wellness-grid animate-fade-in-delay-2"
        aria-label="Wellbeing and app behaviour"
      >
        <app-desk-health-card />
        <app-water-card />
        <div class="dashboard-prefs">
          <app-desktop-prefs-panel title="App Behaviour" />
        </div>
      </section>
    </div>

    <!-- ===== Command palette ===== -->
    @if (paletteOpen()) {
      <div
        class="dialog-backdrop"
        (click)="closePalette()"
        (keydown.escape)="closePalette()"
        tabindex="-1"
      >
        <div
          class="command-palette"
          role="dialog"
          aria-modal="true"
          aria-labelledby="palette-title"
          (click)="$event.stopPropagation()"
          (keydown)="onPaletteKeydown($event)"
        >
          <h2 id="palette-title" class="visually-hidden">Command palette</h2>
          <div class="palette-search">
            <app-icon name="search" [size]="18" />
            <input
              #paletteInput
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls="dashboard-command-list"
              [attr.aria-activedescendant]="activeCommandId()"
              [value]="paletteQuery()"
              (input)="onPaletteInput($event)"
              (keydown)="onPaletteKeydown($event)"
              placeholder="Search actions, pages and tasks…"
              aria-label="Search commands"
            />
            <button
              class="palette-close"
              type="button"
              (click)="closePalette()"
              aria-label="Close the command palette"
            >
              <kbd>Esc</kbd>
            </button>
          </div>
          <ul id="dashboard-command-list" class="palette-list" role="listbox" aria-label="Commands">
            @for (group of paletteGroups(); track group.group) {
              <li class="palette-group-label" role="presentation">{{ group.group }}</li>
              @for (entry of group.items; track entry.command.id) {
                <li
                  [id]="'dashboard-command-' + entry.command.id"
                  class="palette-item"
                  role="option"
                  [attr.aria-selected]="entry.index === paletteIndex()"
                  [class.is-active]="entry.index === paletteIndex()"
                  tabindex="-1"
                  (click)="runCommand(entry.command)"
                  (keydown.enter)="runCommand(entry.command)"
                  (mouseenter)="paletteIndex.set(entry.index)"
                >
                  <span class="palette-glyph" aria-hidden="true">
                    <app-icon [name]="entry.command.icon" [size]="15" />
                  </span>
                  <span class="palette-copy">
                    <span class="palette-label">{{ entry.command.label }}</span>
                    <span class="palette-hint">{{ entry.command.hint }}</span>
                  </span>
                  @if (entry.command.shortcut) {
                    <kbd>{{ entry.command.shortcut }}</kbd>
                  }
                </li>
              }
            } @empty {
              <li class="palette-empty" role="option" aria-selected="false" aria-disabled="true">
                No matching commands. Try “task”, “timer” or “settings”.
              </li>
            }
          </ul>
          <p class="palette-foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span><kbd>Enter</kbd> run</span>
            <span><kbd>Esc</kbd> close</span>
          </p>
        </div>
      </div>
    }

    <!-- ===== Keyboard shortcuts ===== -->
    @if (shortcutsOpen()) {
      <div
        class="dialog-backdrop"
        (click)="closeShortcuts()"
        (keydown.escape)="closeShortcuts()"
        tabindex="-1"
      >
        <div
          class="shortcuts-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          (click)="$event.stopPropagation()"
          (keydown)="onShortcutsKeydown($event)"
        >
          <div class="dialog-head">
            <div>
              <span class="eyebrow">Keyboard</span>
              <h2 id="shortcuts-title">Shortcuts</h2>
            </div>
            <button
              class="palette-close"
              type="button"
              (click)="closeShortcuts()"
              aria-label="Close keyboard shortcuts"
            >
              <kbd>Esc</kbd>
            </button>
          </div>
          <dl class="shortcut-list">
            @for (shortcut of shortcuts; track shortcut.keys) {
              <div class="shortcut-row">
                <dt>
                  <kbd>{{ shortcut.keys }}</kbd>
                </dt>
                <dd>{{ shortcut.label }}</dd>
              </div>
            }
          </dl>
          <p class="shortcut-note">
            Shortcuts work whenever you are not typing in a field. The timer’s Space shortcut works
            from any page.
          </p>
        </div>
      </div>
    }

    <!-- Confetti celebration -->
    <app-confetti [sessionsBeforeLongBreak]="sessionsBeforeLongBreak()" />
  `,
  styles: [
    `
      :host {
        --dash-radius: 22px;
        --dash-border: var(--glass-border);
        --dash-border-strong: rgba(139, 92, 246, 0.3);
        --dash-surface: var(--glass-bg);
        --dash-surface-hover: var(--glass-bg-hover);
        --dash-glow: rgba(139, 92, 246, 0.3);
        --dash-cyan: rgba(6, 182, 212, 0.18);
        --dash-ink: var(--color-text-primary);
        --dash-muted: var(--color-text-muted);
        display: block;
        min-height: 100%;
        position: relative;
      }

      /* The dashboard reads its own surfaces so the light theme can be warmer
         than the global grey glass without every rule needing a second copy. */
      :host-context(html.theme-light) {
        --dash-border-strong: rgba(124, 58, 237, 0.24);
        --dash-surface: rgba(255, 255, 255, 0.78);
        --dash-surface-hover: rgba(255, 255, 255, 0.95);
        --dash-glow: rgba(124, 58, 237, 0.16);
        --dash-cyan: rgba(8, 145, 178, 0.12);
      }

      /* ===== Main layout ===== */
      .dashboard-wrapper {
        min-height: 100%;
        display: flex;
        flex-direction: column;
        padding-bottom: var(--space-xl);
      }
      .dashboard-wrapper.hidden {
        display: none;
      }

      /* ===== Header ===== */
      .dashboard-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: var(--space-md);
        margin-bottom: 18px;
      }
      .dashboard-heading {
        min-width: 0;
      }
      .page-title {
        font-size: clamp(30px, 2.8vw, 40px);
        font-weight: 800;
        letter-spacing: -0.04em;
        line-height: 1;
        margin: 6px 0 0;
      }
      .page-subtitle {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        margin: 7px 0 0;
        color: var(--color-text-muted);
        font-size: var(--text-sm);
      }
      .header-live {
        color: var(--color-text-secondary);
        font-weight: 600;
      }
      .subtitle-separator {
        opacity: 0.5;
      }
      .header-actions {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        flex-shrink: 0;
      }
      .header-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        min-height: 42px;
        padding: 0 14px;
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-pill);
        background: var(--dash-surface);
        color: var(--color-text-secondary);
        font: 600 var(--text-sm) var(--font-sans);
        cursor: pointer;
        backdrop-filter: blur(var(--glass-blur));
        -webkit-backdrop-filter: blur(var(--glass-blur));
        transition:
          background 0.18s ease,
          border-color 0.18s ease,
          color 0.18s ease,
          box-shadow 0.18s ease;
      }
      .header-action:hover {
        background: var(--dash-surface-hover);
        border-color: var(--dash-border-strong);
        color: var(--color-text-primary);
        box-shadow: 0 6px 22px rgba(139, 92, 246, 0.16);
      }
      .palette-trigger {
        min-width: 246px;
        justify-content: flex-start;
      }
      .header-action-label {
        color: var(--color-text-secondary);
        font-size: var(--text-sm);
        font-weight: 600;
        white-space: nowrap;
      }
      .header-action kbd {
        margin-left: auto;
      }
      .header-action.icon-only {
        width: 42px;
        padding: 0;
      }
      .header-action kbd {
        display: none;
      }
      @media (min-width: 768px) {
        .header-action kbd {
          display: inline-block;
        }
      }

      /* ===== Hero row: clock + live rail ===== */
      .main-row {
        flex: 1 0 560px;
        display: grid;
        grid-template-columns: minmax(0, 1.9fr) minmax(320px, 1fr);
        gap: var(--space-md);
        min-height: 0;
      }

      /* ===== Timer card ===== */
      .timer-card {
        position: relative;
        isolation: isolate;
        border-radius: var(--dash-radius);
        overflow: hidden;
        border: 1px solid var(--glass-border);
        background:
          radial-gradient(120% 120% at 12% 0%, var(--dash-glow), transparent 56%),
          radial-gradient(110% 110% at 100% 100%, var(--dash-cyan), transparent 54%),
          linear-gradient(158deg, rgba(25, 17, 46, 0.94), rgba(9, 6, 18, 0.97));
        box-shadow:
          0 26px 64px rgba(0, 0, 0, 0.34),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
      }

      /* A slow travelling gradient on the rim. The mask leaves only a hairline,
         so the animated colour reads as a lit edge rather than a moving card. */
      .timer-card::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 2;
        padding: 1px;
        border-radius: inherit;
        background: conic-gradient(
          from var(--dash-angle, 0deg),
          rgba(139, 92, 246, 0.9),
          rgba(6, 182, 212, 0.65),
          rgba(236, 72, 153, 0.45),
          rgba(139, 92, 246, 0.9)
        );
        -webkit-mask:
          linear-gradient(#000 0 0) content-box,
          linear-gradient(#000 0 0);
        -webkit-mask-composite: xor;
        mask:
          linear-gradient(#000 0 0) content-box,
          linear-gradient(#000 0 0);
        mask-composite: exclude;
        opacity: 0.55;
        animation: dash-spin 14s linear infinite;
        pointer-events: none;
      }
      @property --dash-angle {
        syntax: '<angle>';
        inherits: false;
        initial-value: 0deg;
      }
      @keyframes dash-spin {
        to {
          --dash-angle: 360deg;
        }
      }

      :host-context(html.theme-light) .timer-card {
        background:
          radial-gradient(120% 120% at 10% 0%, rgba(124, 58, 237, 0.16), transparent 54%),
          radial-gradient(110% 110% at 100% 100%, rgba(8, 145, 178, 0.14), transparent 52%),
          linear-gradient(158deg, #ffffff 0%, #f7f2ff 58%, #edf7fb 100%);
        box-shadow:
          0 28px 70px rgba(63, 42, 120, 0.16),
          inset 0 1px 0 #fff;
        --clock-aura-opacity: 0.28;
      }

      .timer-card-inner {
        position: relative;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 14px;
        padding: 20px 24px 16px;
        background: transparent;
        border-radius: inherit;
        overflow: hidden;
      }
      .timer-card-inner app-animated-clock {
        flex: 1 1 auto;
        min-height: 0;
        max-height: min(340px, 35vmin);
        aspect-ratio: 1;
        width: auto;
        max-width: 100%;
        --clock-size: 100%;
        z-index: 1;
      }
      .timer-ambient {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background:
          radial-gradient(circle at 50% 40%, rgba(139, 92, 246, 0.1) 0%, transparent 62%),
          radial-gradient(circle at 82% 18%, rgba(6, 182, 212, 0.08) 0%, transparent 46%);
        pointer-events: none;
      }

      .timer-topbar {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-sm);
        z-index: 1;
      }
      .card-actions {
        display: flex;
        gap: 6px;
        z-index: 3;
      }
      .action-btn {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        color: var(--color-text-muted);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition:
          background 0.18s ease,
          border-color 0.18s ease,
          color 0.18s ease;
      }
      .action-btn:hover {
        background: rgba(139, 92, 246, 0.14);
        border-color: var(--dash-border-strong);
        color: var(--color-text-primary);
      }

      /* Mode + state are text as well as colour: the icon, the label and the dot
         all say the same thing, so colour is never the only cue. */
      .timer-mode-row {
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 1;
      }
      .mode-chip {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 6px 12px;
        border-radius: var(--radius-pill);
        border: 1px solid var(--dash-border-strong);
        background: rgba(139, 92, 246, 0.12);
        color: var(--color-text-secondary);
        font-size: var(--text-xs);
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .mode-chip[data-mode='work'] {
        color: #c4b5fd;
        border-color: rgba(139, 92, 246, 0.42);
        background: rgba(139, 92, 246, 0.16);
      }
      .mode-chip[data-mode='short-break'] {
        color: #67e8f9;
        border-color: rgba(6, 182, 212, 0.42);
        background: rgba(6, 182, 212, 0.14);
      }
      .mode-chip[data-mode='long-break'] {
        color: #6ee7b7;
        border-color: rgba(52, 211, 153, 0.42);
        background: rgba(52, 211, 153, 0.14);
      }
      :host-context(html.theme-light) .mode-chip[data-mode='work'] {
        color: #6d28d9;
        border-color: rgba(124, 58, 237, 0.3);
        background: rgba(124, 58, 237, 0.09);
      }
      :host-context(html.theme-light) .mode-chip[data-mode='short-break'] {
        color: #0e7490;
        border-color: rgba(8, 145, 178, 0.3);
        background: rgba(8, 145, 178, 0.08);
      }
      :host-context(html.theme-light) .mode-chip[data-mode='long-break'] {
        color: #047857;
        border-color: rgba(5, 150, 105, 0.3);
        background: rgba(5, 150, 105, 0.08);
      }
      .mode-glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .timer-state {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--color-text-muted);
        font-size: var(--text-xs);
        font-weight: 600;
      }
      .state-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--color-text-muted);
      }
      .timer-state.running .state-dot {
        background: var(--color-success);
        box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.16);
        animation: state-pulse 2s ease-in-out infinite;
      }
      @keyframes state-pulse {
        0%,
        100% {
          box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.14);
        }
        50% {
          box-shadow: 0 0 0 6px rgba(52, 211, 153, 0.05);
        }
      }

      /* ===== Task selector ===== */
      .task-selector {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 8px;
        z-index: 1;
        width: 100%;
        max-width: 540px;
      }
      .task-selector-pill {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 5px 6px 5px 12px;
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-pill);
        background: rgba(255, 255, 255, 0.045);
        color: var(--color-text-muted);
        transition: border-color 0.18s ease;
      }
      .task-selector-pill:focus-within {
        border-color: rgba(139, 92, 246, 0.55);
      }
      .task-selector-label {
        flex-shrink: 0;
        font-size: var(--text-2xs);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .select-shell {
        position: relative;
        display: flex;
        align-items: center;
        min-width: 0;
        flex: 1;
      }
      .select-shell select {
        appearance: none;
        -webkit-appearance: none;
        width: 100%;
        max-width: 268px;
        min-width: 0;
        padding: 6px 24px 6px 2px;
        border: 0;
        outline: none;
        background: transparent;
        color: var(--color-text-primary);
        font: 600 13px var(--font-sans);
        cursor: pointer;
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
      }
      .select-shell select option,
      .select-shell select optgroup {
        background: var(--color-bg-secondary);
        color: var(--color-text-primary);
      }
      .select-shell select optgroup {
        color: var(--color-text-muted);
        font-size: var(--text-2xs);
        font-weight: 700;
        letter-spacing: 0.03em;
      }
      .select-chevron {
        position: absolute;
        right: 5px;
        pointer-events: none;
        color: var(--color-text-muted);
      }
      .selected-task-quadrant,
      .task-priority {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: var(--text-2xs);
        font-weight: 700;
        padding: 4px 9px;
        border-radius: var(--radius-pill);
        letter-spacing: 0.03em;
        white-space: nowrap;
      }
      .selected-task-quadrant.urgent-important,
      .task-priority[data-quadrant='urgent-important'] {
        background: var(--quadrant-q1-bg);
        color: var(--quadrant-q1-color);
        border: 1px solid var(--quadrant-q1-border);
      }
      .selected-task-quadrant.important,
      .task-priority[data-quadrant='important'] {
        background: var(--quadrant-q2-bg);
        color: var(--quadrant-q2-color);
        border: 1px solid var(--quadrant-q2-border);
      }
      .selected-task-quadrant.urgent,
      .task-priority[data-quadrant='urgent'] {
        background: var(--quadrant-q3-bg);
        color: var(--quadrant-q3-color);
        border: 1px solid var(--quadrant-q3-border);
      }
      .selected-task-quadrant.neither,
      .task-priority[data-quadrant='neither'] {
        background: var(--quadrant-q4-bg);
        color: var(--quadrant-q4-color);
        border: 1px solid var(--quadrant-q4-border);
      }
      .task-empty {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        justify-content: center;
        gap: 10px;
        z-index: 1;
        color: var(--color-text-muted);
        font-size: var(--text-xs);
      }
      .task-empty-copy {
        display: inline-flex;
        align-items: center;
        gap: 7px;
      }
      .task-empty-action {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 12px;
        border-radius: var(--radius-pill);
        border: 1px dashed var(--dash-border-strong);
        background: transparent;
        color: var(--color-text-secondary);
        font: 600 var(--text-xs) var(--font-sans);
        cursor: pointer;
        transition:
          background 0.18s ease,
          color 0.18s ease;
      }
      .task-empty-action:hover {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary);
      }

      /* ===== Timer controls ===== */
      .timer-controls,
      .fullscreen-controls {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        z-index: 1;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 44px;
        padding: 10px 20px;
        border-radius: var(--radius-pill);
        font-size: var(--text-md);
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition:
          background 0.18s ease,
          border-color 0.18s ease,
          color 0.18s ease,
          transform 0.18s ease,
          box-shadow 0.18s ease;
        font-family: var(--font-sans);
      }
      .btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .btn-lg {
        min-height: 48px;
        padding: 12px 30px;
        font-size: var(--text-md);
        letter-spacing: 0.01em;
      }
      .btn-primary {
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 52%, #6d28d9 100%);
        color: #fff;
        box-shadow:
          0 10px 28px rgba(139, 92, 246, 0.34),
          inset 0 1px 0 rgba(255, 255, 255, 0.16);
      }
      .btn-primary:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow:
          0 14px 36px rgba(139, 92, 246, 0.46),
          inset 0 1px 0 rgba(255, 255, 255, 0.2);
      }
      .btn-primary:active:not(:disabled) {
        transform: translateY(0);
      }
      .btn-secondary {
        background: rgba(139, 92, 246, 0.16);
        border: 1px solid rgba(139, 92, 246, 0.32);
        color: var(--color-text-primary);
      }
      .btn-secondary:hover:not(:disabled) {
        background: rgba(139, 92, 246, 0.24);
        border-color: rgba(139, 92, 246, 0.48);
      }
      .btn-ghost {
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        color: var(--color-text-muted);
        padding: 10px;
        min-width: 46px;
        min-height: 46px;
        border-radius: 50%;
      }
      .btn-ghost:hover:not(:disabled) {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary);
      }
      .timer-footer {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 12px;
        padding-top: 11px;
        border-top: 1px solid var(--glass-border);
        z-index: 1;
      }
      .cycle-caption {
        flex-shrink: 0;
        font-size: var(--text-2xs);
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--color-text-muted);
        white-space: nowrap;
      }
      .cycle-caption strong {
        color: var(--color-text-primary);
        font-size: var(--text-xs);
      }
      .cycle-segments {
        display: flex;
        gap: 4px;
        flex: 1;
        min-width: 0;
      }
      .cycle-segment {
        height: 4px;
        flex: 1;
        border-radius: var(--radius-pill);
        background: rgba(255, 255, 255, 0.11);
      }
      .cycle-segment.done {
        background: linear-gradient(90deg, #8b5cf6, #06b6d4);
      }
      .cycle-segment.current {
        background: rgba(139, 92, 246, 0.55);
        box-shadow: 0 0 10px rgba(139, 92, 246, 0.5);
      }
      .timer-hints {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 4px;
        color: var(--color-text-muted);
        font-size: var(--text-2xs);
        white-space: nowrap;
      }
      kbd {
        display: inline-block;
        padding: 2px 6px;
        border: 1px solid var(--glass-border);
        border-bottom-width: 2px;
        border-radius: var(--radius-xs);
        background: var(--glass-bg);
        color: var(--color-text-secondary);
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
        line-height: 1.4;
      }

      /* ===== Focus rail ===== */
      .focus-rail {
        display: grid;
        grid-template-rows: auto auto minmax(0, 1fr);
        gap: 12px;
        min-width: 0;
        min-height: 0;
      }
      .rail-card {
        padding: 15px 16px;
        border: 1px solid var(--glass-border);
        border-radius: var(--dash-radius);
        background: var(--dash-surface);
        backdrop-filter: blur(var(--glass-blur));
        -webkit-backdrop-filter: blur(var(--glass-blur));
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        min-width: 0;
      }
      .insight-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-sm);
      }
      .eyebrow {
        display: block;
        font-size: var(--text-2xs);
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .insight-header h2 {
        margin: 3px 0 0;
        font-size: var(--text-md);
        line-height: 1.3;
        color: var(--color-text-primary);
        overflow-wrap: anywhere;
      }
      .rail-card p {
        margin: 7px 0 0;
        color: var(--color-text-secondary);
        font-size: var(--text-sm);
        line-height: 1.45;
      }

      /* ===== Daily goal ring ===== */
      .goal-card {
        background:
          linear-gradient(150deg, rgba(139, 92, 246, 0.16), rgba(6, 182, 212, 0.06)),
          var(--dash-surface);
      }
      :host-context(html.theme-light) .goal-card {
        background:
          linear-gradient(150deg, rgba(124, 58, 237, 0.1), rgba(8, 145, 178, 0.06)), #ffffff;
      }
      .goal-main {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .goal-ring {
        position: relative;
        width: 92px;
        height: 92px;
        flex-shrink: 0;
      }
      .goal-ring svg {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }
      .goal-ring-track {
        fill: none;
        stroke: rgba(255, 255, 255, 0.09);
        stroke-width: 9;
      }
      .goal-ring-fill {
        fill: none;
        stroke: url(#goal-ring-grad);
        stroke-width: 9;
        stroke-linecap: round;
        transition: stroke-dashoffset 0.5s ease;
        filter: drop-shadow(0 0 6px rgba(139, 92, 246, 0.45));
      }
      :host-context(html.theme-light) .goal-ring-track {
        stroke: rgba(60, 40, 110, 0.1);
      }
      .goal-ring-label {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0;
        text-align: center;
      }
      .goal-ring-label strong {
        font-size: 25px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.03em;
        color: var(--color-text-primary);
        font-variant-numeric: tabular-nums;
      }
      .goal-ring-label span {
        margin-top: 2px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .goal-copy {
        min-width: 0;
      }
      .goal-copy h2 {
        margin: 3px 0 0;
        font-size: var(--text-sm);
        font-weight: 600;
        line-height: 1.35;
        color: var(--color-text-primary);
      }
      .goal-percent {
        display: inline-block;
        margin-top: 6px;
        padding: 3px 9px;
        border-radius: var(--radius-pill);
        background: rgba(139, 92, 246, 0.14);
        color: #a78bfa;
        border: 1px solid rgba(139, 92, 246, 0.28);
        font-size: var(--text-2xs);
        font-weight: 700;
      }
      :host-context(html.theme-light) .goal-percent,
      :host-context(html.theme-light) .cycle-status {
        color: #6d28d9;
        background: rgba(124, 58, 237, 0.08);
        border-color: rgba(124, 58, 237, 0.26);
      }
      :host-context(html.theme-light) .cycle-status.break-ready {
        color: #047857;
        background: rgba(5, 150, 105, 0.09);
        border-color: rgba(5, 150, 105, 0.26);
      }
      .goal-stats {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid var(--glass-border);
      }
      .goal-stat {
        display: flex;
        align-items: center;
        gap: 5px;
        flex: 1;
        min-width: 0;
        color: var(--color-text-muted);
        font-size: var(--text-2xs);
        white-space: nowrap;
      }
      .goal-stat strong {
        display: block;
        color: var(--color-text-primary);
        font-size: var(--text-xs);
        font-variant-numeric: tabular-nums;
      }

      /* ===== Session cycle ===== */
      .cycle-card {
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
      .cycle-status {
        flex-shrink: 0;
        padding: 4px 9px;
        border-radius: var(--radius-pill);
        font-size: var(--text-2xs);
        font-weight: 700;
        background: rgba(139, 92, 246, 0.14);
        color: #a78bfa;
        border: 1px solid rgba(139, 92, 246, 0.28);
      }
      .cycle-status.break-ready {
        background: rgba(52, 211, 153, 0.14);
        color: var(--color-success);
        border-color: rgba(52, 211, 153, 0.3);
      }
      .cycle-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 10px;
      }
      .cycle-dots {
        display: flex;
        gap: 4px;
        flex-shrink: 0;
      }
      .cycle-dot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 1px solid var(--glass-border);
        color: var(--color-text-muted);
        font-size: 12px;
        font-weight: 700;
      }
      .cycle-dot.done {
        background: rgba(139, 92, 246, 0.24);
        border-color: rgba(139, 92, 246, 0.46);
        color: #ddd6fe;
      }
      :host-context(html.theme-light) .cycle-dot.done {
        color: #5b21b6;
        background: rgba(124, 58, 237, 0.16);
        border-color: rgba(124, 58, 237, 0.36);
      }
      .cycle-dot.current {
        border-color: var(--color-accent-secondary);
        color: var(--color-text-primary);
        box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.18);
      }
      .cycle-progress {
        flex: 1;
        height: 4px;
        overflow: hidden;
        border-radius: var(--radius-pill);
        background: rgba(255, 255, 255, 0.08);
      }
      .cycle-progress span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #8b5cf6, #06b6d4);
        transition: width 0.3s ease;
      }

      /* ===== Live activity ===== */
      .live-card {
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
      }
      .rail-count {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 2px;
        min-width: 26px;
        height: 24px;
        padding: 0 8px;
        border-radius: var(--radius-pill);
        background: var(--glass-bg-hover);
        border: 1px solid var(--glass-border);
        color: var(--color-text-secondary);
        font-size: var(--text-xs);
        font-weight: 700;
      }
      .rail-count-cue {
        opacity: 0.65;
      }
      .activity-list {
        list-style: none;
        margin: 8px 0 0;
        padding: 0 4px 0 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
        overflow-y: auto;
        min-height: 0;
        /* The rail shows what fits and scrolls the rest; the cap keeps twenty
           sessions from stretching the hero row to the height of the whole day. */
        max-height: clamp(150px, 20vh, 240px);
        overscroll-behavior: contain;
        scrollbar-gutter: stable;
        scrollbar-width: thin;
        scrollbar-color: rgba(139, 92, 246, 0.45) transparent;
      }
      .activity-list::-webkit-scrollbar {
        width: 6px;
      }
      .activity-list::-webkit-scrollbar-thumb {
        border-radius: var(--radius-pill);
        background: rgba(139, 92, 246, 0.4);
      }
      .activity-list:focus-visible {
        outline: 2px solid rgba(139, 92, 246, 0.7);
        outline-offset: 3px;
        border-radius: var(--radius-sm);
      }
      .activity-item {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 4px 7px;
        border-radius: var(--radius-sm);
        background: rgba(255, 255, 255, 0.028);
        border: 1px solid transparent;
      }
      :host-context(html.theme-light) .activity-item {
        background: rgba(76, 45, 140, 0.04);
      }
      .activity-glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        flex-shrink: 0;
        border-radius: 8px;
        background: rgba(139, 92, 246, 0.14);
        color: #c4b5fd;
      }
      .activity-glyph[data-type='short-break'] {
        background: rgba(6, 182, 212, 0.14);
        color: #67e8f9;
      }
      .activity-glyph[data-type='long-break'] {
        background: rgba(52, 211, 153, 0.14);
        color: #6ee7b7;
      }
      :host-context(html.theme-light) .activity-glyph {
        color: #6d28d9;
      }
      :host-context(html.theme-light) .activity-glyph[data-type='short-break'] {
        color: #0e7490;
      }
      :host-context(html.theme-light) .activity-glyph[data-type='long-break'] {
        color: #047857;
      }
      .activity-copy {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .activity-title {
        font-size: var(--text-xs);
        font-weight: 600;
        color: var(--color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .activity-meta {
        font-size: var(--text-2xs);
        color: var(--color-text-muted);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .activity-flag {
        padding: 1px 5px;
        border-radius: var(--radius-xs);
        border: 1px solid rgba(251, 191, 36, 0.35);
        color: var(--color-warning);
        font-size: var(--text-2xs);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .activity-time {
        flex-shrink: 0;
        color: var(--color-text-muted);
        font-family: var(--font-mono);
        font-size: var(--text-2xs);
      }
      .live-empty {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        text-align: center;
        padding: 10px 6px;
      }
      .live-empty-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        border-radius: 13px;
        background: rgba(139, 92, 246, 0.14);
        border: 1px solid rgba(139, 92, 246, 0.24);
        color: #c4b5fd;
      }
      :host-context(html.theme-light) .live-empty-icon,
      :host-context(html.theme-light) .palette-item.is-active .palette-glyph {
        color: #6d28d9;
      }
      .live-empty p {
        margin: 0;
        max-width: 26ch;
      }
      .empty-action {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 34px;
        padding: 6px 13px;
        border-radius: var(--radius-pill);
        border: 1px solid var(--dash-border-strong);
        background: rgba(139, 92, 246, 0.12);
        color: var(--color-text-primary);
        font: 600 var(--text-xs) var(--font-sans);
        cursor: pointer;
        transition: background 0.18s ease;
      }
      .empty-action:hover {
        background: rgba(139, 92, 246, 0.2);
      }
      .live-loading {
        margin-top: 8px;
        color: var(--color-text-muted);
        font-size: var(--text-xs);
      }

      /* ===== Focus plan ===== */
      .focus-plan {
        display: grid;
        /* The same tracks as the hero row, so the vertical edge between the
           focus card and the quick panel lines up with the rail above it. */
        grid-template-columns: minmax(0, 1.9fr) minmax(320px, 1fr);
        gap: var(--space-md);
        margin-top: var(--space-md);
      }
      .insight-card,
      .quick-panel {
        padding: 16px 18px;
        border: 1px solid var(--glass-border);
        border-radius: var(--dash-radius);
        background: var(--dash-surface);
        backdrop-filter: blur(var(--glass-blur));
        -webkit-backdrop-filter: blur(var(--glass-blur));
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }
      .task-card {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 14px;
      }
      .task-head {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        min-width: 0;
      }
      .card-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        flex-shrink: 0;
        border-radius: 14px;
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.32), rgba(6, 182, 212, 0.16));
        border: 1px solid rgba(139, 92, 246, 0.28);
        color: #c4b5fd;
      }
      :host-context(html.theme-light) .card-icon {
        color: #7c3aed;
        background: linear-gradient(135deg, rgba(124, 58, 237, 0.16), rgba(8, 145, 178, 0.1));
      }
      .task-copy {
        min-width: 0;
        flex: 1;
      }
      .task-copy h2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
        margin: 3px 0 0;
        font-size: 17px;
        line-height: 1.3;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--color-text-primary);
      }
      .task-meta {
        margin: 5px 0 0;
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }
      .task-priority {
        margin-left: auto;
      }
      .task-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .insight-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 36px;
        padding: 7px 13px;
        border: 1px solid rgba(139, 92, 246, 0.28);
        border-radius: var(--radius-pill);
        background: rgba(139, 92, 246, 0.12);
        color: var(--color-text-primary);
        font: 600 var(--text-xs) var(--font-sans);
        cursor: pointer;
        transition:
          background 0.18s ease,
          border-color 0.18s ease,
          color 0.18s ease;
      }
      .insight-action.secondary {
        background: transparent;
        color: var(--color-text-secondary);
      }
      .insight-action:hover:not(:disabled) {
        border-color: rgba(139, 92, 246, 0.5);
        background: rgba(139, 92, 246, 0.18);
        color: var(--color-text-primary);
      }
      .insight-action:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .icon-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 1px solid var(--glass-border);
        background: transparent;
        color: var(--color-text-muted);
        cursor: pointer;
        transition:
          background 0.18s ease,
          border-color 0.18s ease,
          color 0.18s ease;
      }
      .task-actions .icon-action:first-of-type {
        margin-left: auto;
      }
      .icon-action:hover:not(:disabled) {
        background: var(--glass-bg-hover);
        border-color: var(--dash-border-strong);
        color: var(--color-text-primary);
      }
      .icon-action:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .task-queue {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding-top: 10px;
        border-top: 1px solid var(--glass-border);
      }
      .task-queue-label {
        flex-basis: 100%;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .queue-item {
        display: flex;
        align-items: center;
        gap: 7px;
        min-height: 30px;
        max-width: 100%;
        padding: 4px 10px;
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-pill);
        background: rgba(255, 255, 255, 0.03);
        color: var(--color-text-secondary);
        font: 600 var(--text-xs) var(--font-sans);
        text-align: left;
        cursor: pointer;
        transition:
          background 0.18s ease,
          border-color 0.18s ease,
          color 0.18s ease;
      }
      :host-context(html.theme-light) .queue-item {
        background: rgba(76, 45, 140, 0.04);
      }
      .queue-item:hover {
        background: rgba(139, 92, 246, 0.13);
        border-color: rgba(139, 92, 246, 0.3);
        color: var(--color-text-primary);
      }
      .queue-dot {
        width: 6px;
        height: 6px;
        flex-shrink: 0;
        border-radius: 50%;
        background: var(--color-text-muted);
      }
      .queue-dot[data-quadrant='urgent-important'] {
        background: var(--quadrant-q1-color);
      }
      .queue-dot[data-quadrant='important'] {
        background: var(--quadrant-q2-color);
      }
      .queue-dot[data-quadrant='urgent'] {
        background: var(--quadrant-q3-color);
      }
      .queue-dot[data-quadrant='neither'] {
        background: var(--quadrant-q4-color);
      }
      .queue-title {
        flex: 1;
        min-width: 0;
        max-width: 24ch;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* ===== Quick actions ===== */
      .quick-panel {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 16px;
        background:
          linear-gradient(145deg, rgba(139, 92, 246, 0.18), rgba(6, 182, 212, 0.07)),
          var(--dash-surface);
      }
      :host-context(html.theme-light) .quick-panel {
        background:
          linear-gradient(145deg, rgba(124, 58, 237, 0.1), rgba(8, 145, 178, 0.06)), #ffffff;
      }
      .quick-copy h2 {
        margin: 3px 0 0;
        font-size: 16px;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--color-text-primary);
      }
      .quick-action-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .quick-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 36px;
        padding: 7px 12px;
        border: 1px solid rgba(139, 92, 246, 0.24);
        border-radius: var(--radius-pill);
        background: transparent;
        color: var(--color-text-secondary);
        font: 600 var(--text-xs) var(--font-sans);
        cursor: pointer;
        transition:
          background 0.18s ease,
          border-color 0.18s ease,
          color 0.18s ease;
      }
      .quick-action:hover:not(:disabled) {
        border-color: rgba(139, 92, 246, 0.5);
        background: rgba(139, 92, 246, 0.14);
        color: var(--color-text-primary);
      }
      .quick-action:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .quick-action.primary {
        background: linear-gradient(135deg, #8b5cf6, #6d28d9);
        border-color: transparent;
        color: #fff;
        box-shadow: 0 8px 22px rgba(139, 92, 246, 0.28);
      }
      .quick-action.primary kbd {
        border-color: rgba(255, 255, 255, 0.25);
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
      }

      /* ===== Timeline ===== */
      .activity-section {
        margin-top: var(--space-md);
      }
      .timeline-panel {
        border-radius: var(--dash-radius);
        overflow: hidden;
        border: 1px solid var(--glass-border);
        background: var(--dash-surface);
      }
      .timeline-panel-inner {
        height: 250px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .timeline-panel-inner app-timeline-bar {
        flex: 1;
        min-height: 0;
        display: block;
        overflow: hidden;
      }
      .panel-header {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: var(--text-xs);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--color-text-muted);
        margin-bottom: var(--space-sm);
        padding-bottom: 8px;
        border-bottom: 1px solid var(--glass-border);
        flex-shrink: 0;
      }
      .panel-meta {
        margin-left: auto;
        letter-spacing: 0;
        text-transform: none;
        font-size: var(--text-2xs);
      }

      /* ===== Wellbeing ===== */
      .wellness-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: var(--space-md);
        margin-top: var(--space-md);
        align-items: start;
      }
      .wellness-grid > app-desk-health-card,
      .wellness-grid > app-water-card {
        display: block;
        margin-top: calc(-1 * var(--space-md));
      }
      .dashboard-prefs {
        padding: var(--space-md);
        background: var(--dash-surface);
        border: 1px solid var(--glass-border);
        border-radius: var(--glass-radius-sm);
        min-width: 0;
      }

      /* ===== Shared dialog shell ===== */
      .dialog-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1200;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: max(9vh, var(--space-xl)) var(--space-md) var(--space-md);
        background: rgba(4, 2, 12, 0.66);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        overflow-y: auto;
      }
      .command-palette,
      .shortcuts-dialog {
        width: min(620px, 100%);
        max-height: min(84vh, 800px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid var(--glass-border-accent);
        border-radius: var(--radius-xl);
        background: var(--surface-float);
        box-shadow:
          0 32px 100px rgba(0, 0, 0, 0.52),
          0 0 0 1px rgba(255, 255, 255, 0.04) inset;
      }
      .command-palette::before {
        content: '';
        height: 2px;
        flex-shrink: 0;
        background: var(--color-accent-gradient);
      }
      .shortcuts-dialog {
        width: min(520px, 100%);
        max-height: none;
        padding: var(--space-lg);
      }
      .dialog-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-md);
        margin-bottom: var(--space-md);
      }
      .dialog-head h2 {
        margin: 3px 0 0;
        font-size: var(--text-2xl);
        color: var(--color-text-primary);
      }
      .palette-search {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 11px 15px;
        border-bottom: 1px solid var(--glass-border);
        color: var(--color-text-muted);
      }
      .palette-search input {
        flex: 1;
        min-width: 0;
        padding: 0;
        border: none;
        outline: none;
        background: transparent;
        color: var(--color-text-primary);
        font: 500 15px var(--font-sans);
        letter-spacing: -0.005em;
      }
      .palette-search input::placeholder {
        color: var(--color-text-muted);
      }
      .palette-close {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 30px;
        padding: 2px 6px;
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-sm);
        background: transparent;
        cursor: pointer;
        transition: background 0.18s ease;
      }
      .palette-close:hover {
        background: var(--glass-bg-hover);
      }
      .palette-list {
        list-style: none;
        margin: 0;
        padding: 6px;
        overflow-y: auto;
        min-height: 0;
      }
      .palette-group-label {
        padding: 6px 10px 2px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .palette-group-label:first-child {
        padding-top: 2px;
      }
      .palette-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 3px 10px;
        border-radius: var(--radius-sm);
        border: 1px solid transparent;
        cursor: pointer;
      }
      .palette-item.is-active {
        background: rgba(139, 92, 246, 0.14);
        border-color: rgba(139, 92, 246, 0.3);
        box-shadow: inset 2px 0 0 var(--color-accent-primary);
      }
      :host-context(html.theme-light) .palette-item.is-active {
        background: rgba(124, 58, 237, 0.09);
      }
      .palette-glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        flex-shrink: 0;
        border-radius: 9px;
        border: 1px solid var(--glass-border);
        background: var(--glass-bg);
        color: var(--color-text-secondary);
      }
      .palette-item.is-active .palette-glyph {
        color: #c4b5fd;
        border-color: rgba(139, 92, 246, 0.34);
        background: rgba(139, 92, 246, 0.14);
      }
      .palette-copy {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .palette-label {
        font-size: var(--text-base);
        font-weight: 600;
        color: var(--color-text-primary);
      }
      .palette-hint {
        font-size: var(--text-2xs);
        color: var(--color-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .palette-empty {
        padding: var(--space-lg) var(--space-md);
        text-align: center;
        color: var(--color-text-muted);
        font-size: var(--text-sm);
      }
      .palette-foot {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-md);
        margin: 0;
        padding: 9px 15px;
        border-top: 1px solid var(--glass-border);
        color: var(--color-text-muted);
        font-size: var(--text-2xs);
      }
      .palette-foot kbd {
        margin-right: 3px;
      }

      /* ===== Shortcuts ===== */
      .shortcut-list {
        display: grid;
        gap: 6px;
        margin: 0;
      }
      .shortcut-row {
        display: grid;
        grid-template-columns: 132px 1fr;
        align-items: center;
        gap: var(--space-sm);
        padding: 7px 0;
        border-bottom: 1px solid var(--glass-border);
      }
      .shortcut-row:last-child {
        border-bottom: none;
      }
      .shortcut-row dt {
        margin: 0;
      }
      .shortcut-row dd {
        margin: 0;
        color: var(--color-text-secondary);
        font-size: var(--text-sm);
      }
      .shortcut-note {
        margin: var(--space-md) 0 0;
        color: var(--color-text-muted);
        font-size: var(--text-xs);
        line-height: 1.5;
      }

      /* ===== Fullscreen ===== */
      .fullscreen-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: var(--color-bg-primary);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--space-xl);
      }
      .fullscreen-ambient {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse 60% 40% at 50% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 60%),
          radial-gradient(circle 300px at 30% 70%, rgba(6, 182, 212, 0.05) 0%, transparent 100%);
        pointer-events: none;
      }
      .exit-fullscreen-btn {
        position: absolute;
        top: 24px;
        right: 24px;
        display: flex;
        align-items: center;
        gap: 7px;
        min-height: 44px;
        padding: 8px 16px;
        border-radius: var(--radius-pill);
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        color: var(--color-text-secondary);
        cursor: pointer;
        font-size: var(--text-base);
        font-family: var(--font-sans);
        transition:
          background 0.18s ease,
          color 0.18s ease;
        z-index: 1;
      }
      .exit-fullscreen-btn:hover {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary);
      }
      .fullscreen-clock {
        z-index: 1;
        --clock-size: clamp(220px, 50vmin, 500px);
        width: var(--clock-size);
        height: var(--clock-size);
      }

      /* ===== Screen-reader only ===== */
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      /* ===== Responsive ===== */
      @media (min-width: 1600px) {
        .main-row {
          flex-basis: 640px;
        }
        .timer-card-inner {
          gap: var(--space-md);
          padding: var(--space-lg);
        }
      }

      @media (max-width: 1280px) {
        .main-row,
        .focus-plan {
          grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr);
        }
      }

      @media (max-width: 1024px) {
        .main-row {
          flex-basis: 680px;
          grid-template-columns: 1fr;
          grid-template-rows: auto auto;
        }
        .timer-card {
          min-height: 520px;
        }
        .focus-rail {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: auto auto;
        }
        .live-card {
          grid-column: 1 / -1;
        }
        .timeline-panel-inner {
          height: 220px;
        }
        .focus-plan {
          grid-template-columns: 1fr 1fr;
        }
      }

      @media (max-width: 760px) {
        .dashboard-header {
          align-items: flex-start;
          flex-direction: column;
        }
        .header-actions {
          width: 100%;
        }
        .header-action.palette-trigger {
          flex: 1;
          min-width: 0;
          justify-content: flex-start;
        }
        .focus-rail {
          grid-template-columns: 1fr;
        }
        .live-card {
          grid-column: auto;
        }
        .focus-plan {
          grid-template-columns: 1fr;
        }
        .timer-footer {
          flex-wrap: wrap;
          justify-content: center;
        }
        .cycle-segments {
          order: 3;
          flex-basis: 100%;
        }
      }

      @media (max-width: 640px) {
        .page-title {
          font-size: 28px;
        }
        .timer-card-inner {
          gap: var(--space-sm);
          padding: var(--space-md);
        }
        .timer-card-inner app-animated-clock {
          max-height: min(260px, 64vw);
        }
        .timer-hints {
          display: none;
        }
        .timer-controls,
        .fullscreen-controls {
          width: 100%;
          flex-wrap: wrap;
        }
        .timer-controls .btn-lg {
          flex: 1 1 100%;
        }
        .action-btn {
          width: 44px;
          height: 44px;
        }
        .task-selector-pill {
          width: 100%;
          max-width: 100%;
        }
        .select-shell select {
          max-width: none;
          min-height: 34px;
          font-size: var(--text-md);
        }
        .insight-action,
        .quick-action,
        .empty-action,
        .task-empty-action {
          min-height: 44px;
        }
        .quick-action {
          flex: 1 1 auto;
        }
        .shortcut-row {
          grid-template-columns: 1fr;
          gap: 2px;
        }
        .timeline-panel-inner {
          height: 200px;
        }
        .fullscreen-clock {
          --clock-size: clamp(160px, 45vmin, 280px);
          width: var(--clock-size);
          height: var(--clock-size);
        }
        .dialog-backdrop {
          padding: var(--space-md) var(--space-sm);
        }
        .goal-ring {
          width: 80px;
          height: 80px;
        }
        .goal-ring-label strong {
          font-size: 22px;
        }
      }

      @media (min-width: 2560px) {
        .dashboard-wrapper {
          max-width: 1440px;
          margin-inline: auto;
        }
        .main-row {
          max-width: 1360px;
          margin-inline: auto;
          grid-template-columns: minmax(0, 900px) minmax(0, 440px);
          justify-content: center;
        }
        .focus-plan {
          max-width: 1360px;
          margin-inline: auto;
          grid-template-columns: minmax(0, 900px) minmax(0, 440px);
          justify-content: center;
        }
        .fullscreen-clock {
          --clock-size: clamp(420px, 40vmin, 720px);
          width: var(--clock-size);
          height: var(--clock-size);
        }
        .page-title {
          font-size: 42px;
        }
      }

      /* ===== Accessibility preferences =====
         The operating system's own answers, not a separate setting: a user who
         has already told every other app how they want motion, contrast or
         forced colours to behave should not have to say it again here. */
      @media (prefers-reduced-motion: reduce) {
        .animate-fade-in,
        .animate-fade-in-delay-1,
        .animate-fade-in-delay-2 {
          animation: none !important;
        }
        .btn,
        .header-action,
        .action-btn,
        .insight-action,
        .quick-action,
        .empty-action,
        .task-empty-action,
        .icon-action,
        .cycle-progress span {
          transition: none !important;
          animation: none !important;
        }
        .timer-card::before,
        .timer-state.running .state-dot {
          animation: none !important;
        }
        .btn-primary:hover:not(:disabled) {
          transform: none;
        }
      }

      @media (prefers-contrast: more) {
        .timer-card,
        .rail-card,
        .insight-card,
        .quick-panel,
        .timeline-panel,
        .dashboard-prefs {
          border-color: var(--color-text-secondary);
        }
        .page-subtitle,
        .rail-card p,
        .task-meta,
        .activity-meta,
        .goal-stat,
        .panel-meta {
          color: var(--color-text-primary);
        }
      }

      @media (forced-colors: active) {
        .timer-card,
        .rail-card,
        .insight-card,
        .quick-panel,
        .timeline-panel,
        .dashboard-prefs,
        .command-palette,
        .shortcuts-dialog {
          border: 1px solid CanvasText;
          background: Canvas;
          box-shadow: none;
        }
        .timer-card::before,
        .timer-ambient,
        .timer-ambient::after {
          display: none;
        }
        .mode-chip,
        .cycle-status,
        .goal-percent,
        .task-priority,
        .selected-task-quadrant,
        .activity-flag {
          border: 1px solid CanvasText;
          background: Canvas;
          color: CanvasText;
        }
        .cycle-dot.done,
        .btn-primary,
        .quick-action.primary {
          background: Highlight;
          color: HighlightText;
        }
        .palette-item.is-active {
          outline: 2px solid Highlight;
          outline-offset: -2px;
        }
        .goal-ring-track {
          stroke: CanvasText;
        }
        .goal-ring-fill {
          stroke: Highlight;
          filter: none;
        }
      }
    `,
  ],
})
export class DashboardComponent implements OnInit, OnDestroy {
  readonly timer = inject(TimerService);
  private readonly notifications = inject(NotificationService);
  private readonly db = inject(DbService);
  readonly taskService = inject(TaskService);
  private readonly settingsService = inject(SettingsService);
  readonly ui = inject(UiService);
  private readonly taskEditor = inject(TaskEditorService);
  private readonly router = inject(Router);

  readonly confetti = viewChild(ConfettiComponent);

  /** The three surfaces a keyboard user can be inside. */
  readonly paletteInput = viewChild<ElementRef<HTMLInputElement>>('paletteInput');
  readonly exitFullscreenBtn = viewChild<ElementRef<HTMLButtonElement>>('exitFullscreenBtn');
  readonly fullscreenActionBtn = viewChild<ElementRef<HTMLButtonElement>>('fullscreenActionBtn');

  readonly todaySessions = signal<PomodoroSession[]>([]);
  readonly sessionsLoading = signal(true);
  readonly isFullscreen = signal(false);
  readonly selectedTaskId = signal<string>('');

  /** Command palette state. */
  readonly paletteOpen = signal(false);
  readonly paletteQuery = signal('');
  readonly paletteIndex = signal(0);
  private paletteReturnFocus: HTMLElement | null = null;

  /** Keyboard shortcut dialog state. */
  readonly shortcutsOpen = signal(false);
  private shortcutsReturnFocus: HTMLElement | null = null;

  private readonly taskSelectModel = signal<TaskSelectFormModel>(createTaskSelectFormDefaults());
  readonly taskSelectForm = form(this.taskSelectModel);

  readonly shortcuts = [
    { keys: 'Space', label: 'Start or pause the timer' },
    { keys: 'S', label: 'Skip to the next phase' },
    { keys: 'R', label: 'Reset the session cycle' },
    { keys: 'F', label: 'Toggle fullscreen focus' },
    { keys: 'N', label: 'Focus the next task on today’s list' },
    { keys: 'E', label: 'Edit the linked task' },
    { keys: 'M', label: 'Minimize to the mini widget' },
    { keys: 'Ctrl / ⌘ + K', label: 'Open the command palette' },
    { keys: '?', label: 'Show this shortcut list' },
    { keys: 'Esc', label: 'Close a dialog or leave fullscreen' },
  ];

  readonly selectedTaskQuadrant = computed(() => {
    const id = this.selectedTaskId();
    if (!id) return '';
    // The picker can name a task that was started from the Tasks page and is not
    // on today's list, so the badge reads the task itself rather than today's
    // subset.
    const task = this.taskService.tasks().find((t) => t.id === id);
    return task?.quadrant ?? '';
  });
  readonly taskGroups = computed(() => {
    // Every open task with a quadrant is offered, grouped in the same priority
    // order the board uses. The old picker showed only the quadrant the day was
    // working through, which left a task chosen elsewhere (a persisted focus, or
    // one started from Today) selected but not listed — the select then read as
    // blank even though the session was linked.
    const tasks = [...this.taskService.todayTasks()];
    const selectedId = this.selectedTaskId();
    const selected = selectedId
      ? this.taskService.tasks().find((task) => task.id === selectedId)
      : null;
    if (selected && !tasks.some((task) => task.id === selected.id)) {
      tasks.push(selected);
    }

    const groups: Array<{ quadrant: string; label: string; tasks: Task[] }> = [];
    for (const quadrant of Object.keys(QUADRANT_CONFIG) as TaskQuadrant[]) {
      const quadrantTasks = tasks.filter((task) => task.quadrant === quadrant);
      if (quadrantTasks.length) {
        groups.push({
          quadrant,
          label: `${QUADRANT_CONFIG[quadrant].emoji} ${QUADRANT_CONFIG[quadrant].label}`,
          tasks: quadrantTasks,
        });
      }
    }
    const unassigned = tasks.filter((task) => !task.quadrant);
    if (unassigned.length) {
      groups.push({ quadrant: 'unassigned', label: 'Unassigned', tasks: unassigned });
    }
    return groups;
  });
  private confettiTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Watches for midnight so the page's "today" counters start the day at zero. */
  private dayIntervalId: ReturnType<typeof setInterval> | null = null;

  readonly sessionsBeforeLongBreak = computed(
    () => this.settingsService.settings().sessionsBeforeLongBreak,
  );

  /**
   * Task titles are shown inside a native <select>, which sizes itself to the
   * longest option — trim long titles so the picker stays compact. The full
   * title is still available from the picker's tooltip.
   */
  taskOptionLabel(title: string, max = 42): string {
    const trimmed = title.trim();
    return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
  }

  /** Full title of the linked task, for the picker's tooltip. */
  selectedTaskFullTitle(): string {
    const id = this.selectedTaskId();
    if (!id) return '';
    return this.taskService.tasks().find((task) => task.id === id)?.title ?? '';
  }

  /** Current position within the configured session cycle, resets after each cycle. */
  readonly cyclePosition = computed(() => {
    // The timer's own cycle counter: skip is a deliberate "not this block" and
    // advances the cycle even though it records no completed session, which is
    // what the full-cycle test (and the user's expectation of a Pomodoro cycle)
    // depends on. It is restored from the timer's saved state, so it survives a
    // reload within the same day.
    const count = this.timer.sessionCount();
    if (count === 0) return 0;
    const sessionsBeforeLongBreak = this.sessionsBeforeLongBreak();
    const pos = count % sessionsBeforeLongBreak;
    return pos === 0 ? sessionsBeforeLongBreak : pos;
  });

  readonly cycleSteps = computed(() => {
    const total = this.sessionsBeforeLongBreak();
    const position = this.cyclePosition();
    return Array.from({ length: total }, (_, index) => ({
      index: index + 1,
      done: index < position,
      current: index === position,
    }));
  });

  readonly cycleProgressPercent = computed(() =>
    Math.min(100, Math.round((this.cyclePosition() / this.sessionsBeforeLongBreak()) * 100)),
  );

  /** Elapsed seconds for the active running session (wall-clock since start/resume) */
  readonly activeElapsedSec = computed(() => {
    if (!this.timer.isRunning()) return 0;
    const started = this.timer.activeStartedAt();
    if (!started) return 0;
    // Read remainingSeconds as a reactive trigger (updates every second)
    this.timer.remainingSeconds();
    return Math.max(0, Math.floor((Date.now() - new Date(started).getTime()) / 1000));
  });

  readonly completedWorkSessions = computed(
    () => this.todaySessions().filter((s) => s.type === 'work' && !s.interrupted).length,
  );
  readonly completedBreakSessions = computed(
    () => this.todaySessions().filter((s) => s.type !== 'work' && !s.interrupted).length,
  );

  readonly focusTimeDisplay = computed(() => {
    const totalSec = this.todaySessions()
      .filter((s) => s.type === 'work')
      .reduce((sum, s) => sum + s.durationActual, 0);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  });

  readonly dailyGoalTarget = 8;
  readonly dailyGoalProgress = computed(
    () => `${this.completedWorkSessions()}/${this.dailyGoalTarget}`,
  );
  readonly dailyGoalPercentage = computed(() =>
    Math.min(100, Math.round((this.completedWorkSessions() / this.dailyGoalTarget) * 100)),
  );
  readonly dailyGoalValueText = computed(
    () =>
      `${this.completedWorkSessions()} of ${this.dailyGoalTarget} focus sessions completed today`,
  );
  readonly dailyGoalMessage = computed(() => {
    const remaining = Math.max(0, this.dailyGoalTarget - this.completedWorkSessions());
    return remaining === 0
      ? 'Daily focus goal achieved. Great work.'
      : `${remaining} more focus session${remaining === 1 ? '' : 's'} to reach today's goal.`;
  });
  /** Circumference of the daily-goal ring (r = 52 in a 120×120 viewBox). */
  readonly goalRingCircumference = 2 * Math.PI * 52;
  readonly goalRingOffset = computed(
    () => this.goalRingCircumference * (1 - this.dailyGoalPercentage() / 100),
  );
  readonly activeTask = computed<Task | null>(() => {
    const selectedTaskId = this.selectedTaskId();
    if (!selectedTaskId) return null;
    // A task started from another page may not be on today's list; the card
    // names whatever is linked, not only today's subset.
    return this.taskService.tasks().find((task) => task.id === selectedTaskId) ?? null;
  });
  readonly openTodayTasks = computed(() => this.taskService.todayTasks().length);
  /** A short "up next" row: open work other than the linked task, best first. */
  readonly focusQueue = computed(() =>
    this.taskService
      .todayTasks()
      .filter((task) => task.id !== this.selectedTaskId())
      .slice(0, 3),
  );
  /** The local day the page's counters belong to; rolled by the day watcher. */
  readonly todayKey = signal(localDayKey(new Date()));
  readonly completedTodayTasks = computed(() => {
    const today = this.todayKey();
    return this.taskService
      .tasks()
      .filter((task) => task.completedAt && localDayKey(new Date(task.completedAt)) === today)
      .length;
  });
  readonly averageFocusTimeDisplay = computed(() => {
    const focusSessions = this.todaySessions().filter(
      (session) => session.type === 'work' && !session.interrupted,
    );
    if (!focusSessions.length) return '0m';
    const averageSeconds =
      focusSessions.reduce((total, session) => total + session.durationActual, 0) /
      focusSessions.length;
    return this.formatDuration(averageSeconds);
  });
  readonly nextBreakMessage = computed(() => {
    if (this.timer.timerType() === 'long-break')
      return 'Long break is ready. Recharge before beginning the next cycle.';
    if (this.timer.timerType() === 'short-break')
      return 'Short break is ready. Return refreshed for the next focus session.';
    const position = this.cyclePosition();
    const remaining =
      position === this.sessionsBeforeLongBreak()
        ? this.sessionsBeforeLongBreak()
        : this.sessionsBeforeLongBreak() - position;
    return `${remaining} more focus session${remaining === 1 ? '' : 's'} until your next long break.`;
  });
  readonly scheduleHeadline = computed(() => {
    const type = this.timer.timerType();
    if (this.timer.isRunning())
      return `Current ${type === 'work' ? 'focus' : type.replace('-', ' ')} block is in progress`;
    return type === 'work'
      ? 'Ready for your next focus block'
      : `Next up: ${type.replace('-', ' ')}`;
  });

  /** The mode name, said once so the chip and screen reader agree. */
  readonly timerModeLabel = computed(() => TIMER_TYPE_CONFIG[this.timer.timerType()].label);
  readonly timerModeIcon = computed<IconName>(() => {
    switch (this.timer.timerType()) {
      case 'short-break':
        return 'coffee';
      case 'long-break':
        return 'moon';
      default:
        return 'target';
    }
  });
  /** Changes only when the timer's state changes, never on a tick. */
  readonly timerStateLabel = computed(() =>
    this.timer.isRunning()
      ? `${this.timerModeLabel()} in progress`
      : `${this.timerModeLabel()} ready`,
  );

  /** The label a start/resume button would show right now. */
  readonly startLabel = computed(() => {
    const type = this.timer.timerType();
    return this.timer.remainingSeconds() < this.timer.totalDuration()
      ? 'Resume'
      : type === 'work'
        ? 'Start Focus'
        : 'Start Break';
  });
  readonly quickStartLabel = computed(() => {
    const label = this.startLabel();
    if (label === 'Resume') return 'Resume timer';
    return label === 'Start Focus' ? 'Start focus' : 'Start break';
  });

  readonly todayLabel = computed(() => {
    this.todayKey();
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(new Date());
  });
  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  });

  /** Newest first. The card scrolls, so the badge and the list always agree. */
  readonly recentSessions = computed(() =>
    [...this.todaySessions()].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    ),
  );

  readonly commands = computed<DashboardCommand[]>(() => {
    const commands: DashboardCommand[] = [];
    if (this.timer.isRunning()) {
      commands.push({
        id: 'pause',
        label: 'Pause timer',
        hint: this.timerModeLabel(),
        keywords: 'stop hold break focus',
        group: 'Timer',
        icon: 'pause',
        shortcut: 'Space',
        run: () => this.timer.pause(),
      });
    } else {
      commands.push({
        id: 'start',
        label: this.startLabel(),
        hint: `Begin a ${this.timerModeLabel().toLowerCase()}`,
        keywords: 'begin resume play focus break timer',
        group: 'Timer',
        icon: 'play',
        shortcut: 'Space',
        run: () => this.startTimer(),
      });
    }
    commands.push(
      {
        id: 'skip',
        label: 'Skip to the next phase',
        hint: 'Move on to the break or focus block that follows',
        keywords: 'next advance break focus timer',
        group: 'Timer',
        icon: 'skip',
        shortcut: 'S',
        run: () => this.skipTimer(),
      },
      {
        id: 'reset',
        label: 'Reset the session cycle',
        hint: 'Return the timer to the beginning',
        keywords: 'restart cycle timer',
        group: 'Timer',
        icon: 'reset',
        shortcut: 'R',
        run: () => this.resetTimer(),
      },
      {
        id: 'fullscreen',
        label: 'Toggle fullscreen focus',
        hint: 'A clock with nothing else around it',
        keywords: 'zen focus distraction timer',
        group: 'Timer',
        icon: 'fullscreen',
        shortcut: 'F',
        run: () => this.toggleFullscreen(),
      },
      {
        id: 'mini',
        label: 'Minimize to the mini widget',
        hint: 'Keep the clock above your other windows',
        keywords: 'floating small widget window',
        group: 'Timer',
        icon: 'mini',
        shortcut: 'M',
        run: () => void this.toggleMiniMode(),
      },
      {
        id: 'next-task',
        label: 'Focus the next task',
        hint: `${this.openTodayTasks()} open task${this.openTodayTasks() === 1 ? '' : 's'} today`,
        keywords: 'task next work today',
        group: 'Tasks',
        icon: 'target',
        shortcut: 'N',
        run: () => this.focusNextTask(),
      },
      {
        id: 'add-task',
        label: 'Add a task for today',
        hint: 'Open the task form without leaving this page',
        keywords: 'new create task today',
        group: 'Tasks',
        icon: 'plus',
        shortcut: 'Ctrl N',
        run: () => this.addTaskForToday(),
      },
      {
        id: 'settings',
        label: 'Open Settings',
        hint: 'Timers, reminders, appearance and accessibility',
        keywords: 'preferences options configure page',
        group: 'Pages',
        icon: 'settings',
        run: () => this.openPage('/settings'),
      },
      {
        id: 'tasks',
        label: 'Open Tasks',
        hint: 'The board, filters and every task',
        keywords: 'board work page',
        group: 'Pages',
        icon: 'tasks',
        run: () => this.openPage('/tasks'),
      },
      {
        id: 'analytics',
        label: 'Open Analytics',
        hint: 'Your focus, sessions and task flow',
        keywords: 'stats charts report page',
        group: 'Pages',
        icon: 'chart',
        run: () => this.openPage('/analytics'),
      },
      {
        id: 'today',
        label: 'Open Today',
        hint: 'The day’s board',
        keywords: 'today board page',
        group: 'Pages',
        icon: 'sun',
        run: () => this.openPage('/today'),
      },
      {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        hint: 'Every key this page answers to',
        keywords: 'keys help accessibility',
        group: 'Help',
        icon: 'keyboard',
        shortcut: '?',
        run: () => this.openShortcuts(),
      },
    );
    return commands;
  });

  readonly filteredCommands = computed(() => {
    const query = this.paletteQuery().trim().toLowerCase();
    const commands = this.commands();
    if (!query) return commands;

    /** Lower is better: a name match always outranks a hint's mention. */
    const score = (command: DashboardCommand): number => {
      const label = command.label.toLowerCase();
      if (label === query) return 0;
      if (label.startsWith(query)) return 1;
      if (label.includes(query)) return 2;
      if (command.keywords.toLowerCase().includes(query)) return 3;
      if (command.hint.toLowerCase().includes(query)) return 4;
      return Number.POSITIVE_INFINITY;
    };

    return commands
      .map((command) => ({ command, rank: score(command) }))
      .filter((entry) => Number.isFinite(entry.rank))
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => entry.command);
  });

  readonly activeCommandId = computed(() => {
    const command = this.paletteCommands()[this.paletteIndex()];
    return command ? `dashboard-command-${command.id}` : null;
  });

  /**
   * The filtered commands in the order the palette paints them, split into
   * labelled groups. `index` is the row's position in that painted order, because
   * that is what the arrow keys move through — the headings are presentation.
   */
  readonly paletteGroups = computed(() => {
    const flat = this.filteredCommands();
    const order: DashboardCommand['group'][] = [];
    for (const command of flat) {
      if (!order.includes(command.group)) order.push(command.group);
    }
    let index = 0;
    return order
      .map((group) => ({
        group,
        items: flat
          .filter((command) => command.group === group)
          .map((command) => ({ command, index: index++ })),
      }))
      .filter((group) => group.items.length > 0);
  });

  /** The same rows as `paletteGroups`, flattened for keyboard navigation. */
  readonly paletteCommands = computed(() =>
    this.paletteGroups().flatMap((group) => group.items.map((entry) => entry.command)),
  );

  constructor() {
    // Move focus into the palette the moment it is rendered. The signal view
    // query is the only reliable way to reach it: the dialog does not exist
    // until the `@if` above resolves.
    effect(() => {
      if (!this.paletteOpen()) return;
      const input = this.paletteInput();
      if (input) input.nativeElement.focus();
    });
  }

  ngOnInit(): void {
    this.initAsync();
  }

  private async initAsync(): Promise<void> {
    await this.timer.init();
    await this.settingsService.loadSettings();
    await this.taskService.loadTasks();
    await this.taskService.runDailyUpkeep();

    // Restore the focused task, but only if it was chosen today: a task picked
    // yesterday is not this morning's task, and the dashboard used to link the
    // timer to it anyway (see CHANGELOG).
    const focusId = readFocusedTaskId();
    if (focusId) {
      this.selectedTaskId.set(focusId);
      this.taskSelectModel.update((m) => ({ ...m, taskId: focusId }));
    }

    // What this page does when a session ends — and only what this page can do.
    // The alert itself (tone, card, system notification) is raised by
    // `TimerService`, which is always alive: this callback only exists while the
    // Dashboard is mounted, and a session that ended on another page used to
    // finish in silence because the ring hung off it (see the CHANGELOG).
    this.timer.onComplete((completedType) => {
      this.loadTodaySessions();
      // Fire confetti when the configured number of focus sessions completes.
      if (
        completedType === 'work' &&
        this.timer.sessionCount() % this.sessionsBeforeLongBreak() === 0
      ) {
        this.confettiTimeout = setTimeout(() => this.confetti()?.fire(), 300);
      }
    });

    this.loadTodaySessions();
    this.watchDay();
  }

  /**
   * Starts the page's counters over when the local day turns while it is open.
   *
   * The timer service starts its own cycle over at midnight; this is the other
   * half — the session list, the daily goal and the completed-task count read
   * from the database, and without a reload they would keep showing yesterday's
   * numbers until the page was left and opened again.
   */
  private watchDay(): void {
    if (this.dayIntervalId) return;
    this.dayIntervalId = setInterval(() => {
      const day = localDayKey(new Date());
      if (day === this.todayKey()) return;
      this.todayKey.set(day);
      // A focused task is a choice for one day, so the new day starts without
      // one — the same rule `readFocusedTaskId` applies on the next launch.
      this.selectTask('');
      void this.loadTodaySessions();
    }, 60_000);
  }

  startTimer(): void {
    this.notifications.dismiss();
    const taskId = this.selectedTaskId() || null;
    this.timer.linkTask(taskId, this.linkedTaskTitle(taskId));
    this.timer.start();
    this.loadTodaySessions();
  }

  stopTimer(): void {
    this.timer.stop();
    this.loadTodaySessions();
  }

  skipTimer(): void {
    this.timer.skip();
    this.loadTodaySessions();
  }

  resetTimer(): void {
    this.timer.reset();
    this.loadTodaySessions();
  }

  focusNextTask(): void {
    const quadrant = this.taskService.focusQuadrant();
    const nextTask = this.taskService
      .todayTasks()
      .find((task) => task.quadrant === quadrant && task.id !== this.selectedTaskId());
    if (nextTask) this.selectTask(nextTask.id);
  }

  clearFocusedTask(): void {
    this.selectTask('');
  }

  /** One click on an "up next" row: link the task and start the block. */
  startTaskNow(taskId: string): void {
    this.selectTask(taskId);
    this.startTimer();
  }

  addTaskForToday(): void {
    this.taskEditor.openAdd({ addToToday: true });
  }

  /**
   * The task the timer is running against can be corrected from here.
   *
   * The dashboard says which task the session is for and how much of the day is
   * done; a wrong title or a deadline that has moved is fixed in the app's one
   * task form, which opens over this page — the clock, the session and the
   * dashboard itself stay exactly as they were, and so does the route.
   */
  editActiveTask(): void {
    const task = this.activeTask();
    if (!task) return;
    this.taskEditor.openEdit(task);
  }

  selectTask(taskId: string): void {
    this.selectedTaskId.set(taskId);
    this.taskSelectModel.update((m) => ({ ...m, taskId }));
    saveFocusedTaskId(taskId);
    this.timer.linkTask(taskId || null, this.linkedTaskTitle(taskId || null));
  }

  onTaskSelect(): void {
    const taskId = this.taskSelectModel().taskId;
    this.selectedTaskId.set(taskId);
    saveFocusedTaskId(taskId);
    this.timer.linkTask(taskId || null, this.linkedTaskTitle(taskId || null));
  }

  /** The title travels with the id so a session keeps its work's name. */
  private linkedTaskTitle(taskId: string | null): string | null {
    return taskId
      ? (this.taskService.tasks().find((task) => task.id === taskId)?.title ?? null)
      : null;
  }

  quadrantFullLabel(quadrant: string | null): string {
    if (!quadrant) return 'Unassigned';
    return QUADRANT_CONFIG[quadrant as TaskQuadrant]?.fullLabel ?? 'Unassigned';
  }

  /** An icon that says the same thing as the quadrant's colour. */
  quadrantIcon(quadrant: string | null): IconName {
    switch (quadrant) {
      case 'urgent-important':
        return 'flame';
      case 'important':
        return 'target';
      case 'urgent':
        return 'clock';
      case 'neither':
        return 'moon';
      default:
        return 'x';
    }
  }

  sessionTypeLabel(type: TimerType): string {
    if (type === 'work') return 'Focus';
    return type === 'long-break' ? 'Long break' : 'Short break';
  }

  sessionIcon(type: TimerType): IconName {
    if (type === 'work') return 'target';
    return type === 'long-break' ? 'moon' : 'coffee';
  }

  sessionTitle(session: PomodoroSession): string {
    const title = session.taskTitle?.trim();
    return title && title.length > 0 ? title : this.sessionTypeLabel(session.type);
  }

  sessionDuration(session: PomodoroSession): string {
    if (session.durationActual < 60) return `${Math.max(0, session.durationActual)}s`;
    return this.formatDuration(session.durationActual);
  }

  sessionClock(session: PomodoroSession): string {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(session.startedAt));
  }

  private formatDuration(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
  }

  // ===== Command palette =====

  openPalette(): void {
    this.paletteReturnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.paletteQuery.set('');
    this.paletteIndex.set(0);
    this.paletteOpen.set(true);
  }

  closePalette(): void {
    if (!this.paletteOpen()) return;
    this.paletteOpen.set(false);
    this.paletteQuery.set('');
    this.paletteIndex.set(0);
    this.restoreFocus(this.paletteReturnFocus);
    this.paletteReturnFocus = null;
  }

  onPaletteInput(event: Event): void {
    this.paletteQuery.set((event.target as HTMLInputElement).value);
    this.paletteIndex.set(0);
  }

  onPaletteKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.closePalette();
        return;
      case 'Tab':
        this.trapTab(event);
        return;
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End': {
        const list = this.paletteCommands();
        if (!list.length) return;
        event.preventDefault();
        event.stopPropagation();
        let index = this.paletteIndex();
        if (event.key === 'ArrowDown') index = (index + 1) % list.length;
        if (event.key === 'ArrowUp') index = (index - 1 + list.length) % list.length;
        if (event.key === 'Home') index = 0;
        if (event.key === 'End') index = list.length - 1;
        this.paletteIndex.set(index);
        return;
      }
      case 'Enter': {
        const command = this.paletteCommands()[this.paletteIndex()];
        if (!command) return;
        event.preventDefault();
        event.stopPropagation();
        this.runCommand(command);
        return;
      }
      default:
        return;
    }
  }

  runCommand(command: DashboardCommand): void {
    const restore = this.paletteReturnFocus;
    this.paletteOpen.set(false);
    this.paletteQuery.set('');
    this.paletteIndex.set(0);
    this.paletteReturnFocus = null;
    setTimeout(() => {
      command.run();
      if (!this.paletteOpen() && !this.shortcutsOpen()) this.restoreFocus(restore);
    }, 0);
  }

  // ===== Shortcuts dialog =====

  openShortcuts(): void {
    this.shortcutsReturnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.shortcutsOpen.set(true);
    setTimeout(() => this.focusFirstInShortcuts(), 0);
  }

  closeShortcuts(): void {
    if (!this.shortcutsOpen()) return;
    this.shortcutsOpen.set(false);
    this.restoreFocus(this.shortcutsReturnFocus);
    this.shortcutsReturnFocus = null;
  }

  onShortcutsKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closeShortcuts();
      return;
    }
    if (event.key === 'Tab') this.trapTab(event);
  }

  private focusFirstInShortcuts(): void {
    const panel = document.querySelector<HTMLElement>('.shortcuts-dialog');
    panel?.querySelector<HTMLElement>('button')?.focus();
  }

  // ===== Keyboard =====

  onWindowKeydown(event: KeyboardEvent): void {
    if (this.paletteOpen() || this.shortcutsOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (this.paletteOpen()) this.closePalette();
        else this.closeShortcuts();
      }
      return;
    }
    if (event.key === 'Escape' && this.isFullscreen()) {
      event.preventDefault();
      this.toggleFullscreen();
      return;
    }
    if (event.defaultPrevented) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.openPalette();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (this.isTypingTarget(event.target)) return;

    // `?` is Shift+/ on most layouts, but the reported key is not guaranteed on
    // every one; both spellings open the same dialog.
    if (event.key === '?' || (event.shiftKey && event.code === 'Slash')) {
      event.preventDefault();
      this.openShortcuts();
      return;
    }

    switch (event.key.toLowerCase()) {
      case 's':
        event.preventDefault();
        this.skipTimer();
        return;
      case 'r':
        event.preventDefault();
        this.resetTimer();
        return;
      case 'f':
        event.preventDefault();
        this.toggleFullscreen();
        return;
      case 'n':
        event.preventDefault();
        this.focusNextTask();
        return;
      case 'e':
        event.preventDefault();
        this.editActiveTask();
        return;
      case 'm':
        event.preventDefault();
        void this.toggleMiniMode();
        return;
      default:
        return;
    }
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      target.isContentEditable ||
      target.getAttribute('role') === 'textbox' ||
      target.getAttribute('role') === 'combobox'
    );
  }

  private trapTab(event: KeyboardEvent): void {
    const panel = event.currentTarget as HTMLElement | null;
    if (!panel) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private restoreFocus(element: HTMLElement | null): void {
    if (element?.isConnected) element.focus();
  }

  openPage(path: string): void {
    void this.router.navigate([path]);
  }

  toggleFullscreen(): void {
    const opening = !this.isFullscreen();
    this.isFullscreen.set(opening);
    setTimeout(() => {
      if (opening) this.exitFullscreenBtn()?.nativeElement.focus();
      else this.fullscreenActionBtn()?.nativeElement.focus();
    }, 0);
  }

  async toggleMiniMode(): Promise<void> {
    if (this.ui.isMiniMode()) {
      await this.ui.exitMiniMode();
    } else {
      await this.ui.enterMiniMode();
    }
  }

  ngOnDestroy(): void {
    if (this.confettiTimeout) {
      clearTimeout(this.confettiTimeout);
      this.confettiTimeout = null;
    }
    if (this.dayIntervalId) {
      clearInterval(this.dayIntervalId);
      this.dayIntervalId = null;
    }
    this.timer.onComplete(null);
  }

  private async loadTodaySessions(): Promise<void> {
    const sessions = await this.db.getTodaySessions();
    this.todaySessions.set(sessions);
    this.sessionsLoading.set(false);
  }
}
