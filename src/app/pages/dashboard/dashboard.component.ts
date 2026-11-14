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
  glyph: string;
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
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path
              d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"
            />
          </svg>
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
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              Pause
            </button>
          } @else {
            <button class="btn btn-primary btn-lg" type="button" (click)="startTimer()">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <polygon points="5,3 19,12 5,21" />
              </svg>
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="3" />
            </svg>
          </button>
          <button
            class="btn btn-ghost"
            type="button"
            (click)="skipTimer()"
            aria-label="Skip to the next phase"
            title="Skip to the next phase (S)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="5,4 15,12 5,20" />
              <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5" />
            </svg>
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
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span class="header-action-label">Commands</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button
            class="header-action icon-only"
            type="button"
            (click)="openShortcuts()"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.1 9a3 3 0 015.8 1c0 2-3 2.5-3 4" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
        </div>
      </header>

      <!-- Hero: clock + live rail -->
      <div class="main-row animate-fade-in-delay-1">
        <div class="timer-card">
          <div class="timer-card-inner">
            <div class="timer-ambient" aria-hidden="true"></div>

            <div class="card-actions">
              <button
                class="action-btn"
                type="button"
                title="Minimize to floating clock"
                aria-label="Minimize to the floating mini widget"
                (click)="toggleMiniMode()"
                appTooltip="Mini widget — shrinks DeepWork into a small floating clock that always stays above your other windows. The window's own minimise button does the same thing. Drag it anywhere on your desktop; click the play button to run the timer, or the expand arrow (or press Esc) to bring the full window back."
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <button
                #fullscreenActionBtn
                class="action-btn"
                type="button"
                title="Fullscreen"
                aria-label="Open fullscreen focus mode"
                (click)="toggleFullscreen()"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <polyline points="15,3 21,3 21,9" />
                  <polyline points="9,21 3,21 3,15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
            </div>

            <div class="timer-mode-row">
              <span class="mode-chip" [attr.data-mode]="timer.timerType()">
                <span class="mode-glyph" aria-hidden="true">{{ timerModeGlyph() }}</span>
                {{ timerModeLabel() }}
              </span>
              <span class="timer-state" [class.running]="timer.isRunning()">
                <span class="state-dot" aria-hidden="true"></span>
                {{ timer.isRunning() ? 'Running' : 'Ready' }}
              </span>
            </div>

            <app-animated-clock
              [displayTime]="timer.displayTime()"
              [progress]="timer.progress()"
              [timerType]="timer.timerType()"
            />

            @if (taskGroups().length > 0) {
              <div class="task-selector">
                <label class="task-selector-label" for="dashboard-task-select">Focus task</label>
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
                @if (selectedTaskId()) {
                  <span
                    class="selected-task-quadrant"
                    [class]="selectedTaskQuadrant()"
                    [attr.data-quadrant]="selectedTaskQuadrant()"
                  >
                    <span aria-hidden="true">{{ quadrantGlyph(selectedTaskQuadrant()) }}</span>
                    {{ quadrantFullLabel(selectedTaskQuadrant()) }}
                  </span>
                }
              </div>
            } @else {
              <div class="task-empty">
                <span class="task-empty-copy">No task linked to this session</span>
                <button class="task-empty-action" type="button" (click)="addTaskForToday()">
                  Add a task for today
                </button>
              </div>
            }

            <div class="timer-controls" role="group" aria-label="Timer controls">
              @if (timer.isRunning()) {
                <button class="btn btn-secondary btn-lg" type="button" (click)="timer.pause()">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                  Pause
                </button>
              } @else {
                <button class="btn btn-primary btn-lg" type="button" (click)="startTimer()">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
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
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <rect x="4" y="4" width="16" height="16" rx="3" />
                </svg>
              </button>
              <button
                class="btn btn-ghost"
                type="button"
                (click)="skipTimer()"
                aria-label="Skip to the next phase"
                title="Skip to the next phase (S)"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <polygon points="5,4 15,12 5,20" />
                  <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5" />
                </svg>
              </button>
            </div>

            <div class="timer-hints" aria-hidden="true">
              <span><kbd>?</kbd> keyboard shortcuts</span>
            </div>
          </div>
        </div>

        <aside class="focus-rail" aria-label="Today's focus status">
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
          </article>

          <article class="rail-card live-card" aria-labelledby="live-activity-title">
            <div class="insight-header">
              <div>
                <span class="eyebrow">Live activity</span>
                <h2 id="live-activity-title">Today's sessions</h2>
              </div>
              <span
                class="rail-count"
                [attr.aria-label]="todaySessions().length + ' sessions today'"
                >{{ todaySessions().length }}</span
              >
            </div>

            @if (sessionsLoading()) {
              <div class="live-loading" role="status" aria-live="polite">
                Loading today’s sessions…
              </div>
            } @else if (recentSessions().length > 0) {
              <ul class="activity-list" aria-label="Recent sessions">
                @for (session of recentSessions(); track session.id) {
                  <li class="activity-item">
                    <span
                      class="activity-glyph"
                      [attr.data-type]="session.type"
                      aria-hidden="true"
                      >{{ sessionGlyph(session.type) }}</span
                    >
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
                <p>No sessions yet. Your first focus block will appear here.</p>
                <button class="empty-action" type="button" (click)="startTimer()">
                  Start your first session
                </button>
              </div>
            }
          </article>
        </aside>
      </div>

      <!-- Focus insights -->
      <section class="insights-grid animate-fade-in-delay-2" aria-label="Focus insights">
        <article class="insight-card goal-card">
          <div class="insight-header">
            <div>
              <span class="eyebrow">Daily focus goal</span>
              <h2>{{ completedWorkSessions() }} of {{ dailyGoalTarget }} sessions</h2>
            </div>
            <span class="goal-percent">{{ dailyGoalPercentage() }}%</span>
          </div>
          <div
            class="goal-track"
            role="progressbar"
            aria-label="Daily focus goal"
            [attr.aria-valuenow]="dailyGoalPercentage()"
            [attr.aria-valuetext]="dailyGoalValueText()"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span [style.width.%]="dailyGoalPercentage()"></span>
          </div>
          <p>{{ dailyGoalMessage() }}</p>
        </article>

        <article class="insight-card task-card">
          <div class="insight-header">
            <div>
              <span class="eyebrow">Current focus</span>
              @if (activeTask(); as task) {
                <h2 [appTooltip]="task.title">{{ task.title }}</h2>
              } @else {
                <h2>Choose a task to give this session context</h2>
              }
            </div>
            @if (activeTask()?.quadrant; as quadrant) {
              <span class="task-priority" [attr.data-quadrant]="quadrant">
                <span aria-hidden="true">{{ quadrantGlyph(quadrant) }}</span>
                {{ quadrantFullLabel(quadrant) }}
              </span>
            }
          </div>
          <p>
            {{ openTodayTasks() }} open task{{ openTodayTasks() === 1 ? '' : 's' }} today ·
            {{ completedTodayTasks() }} completed
          </p>
          <div class="task-actions">
            <button
              class="insight-action"
              type="button"
              (click)="focusNextTask()"
              [disabled]="taskService.todayTasks().length === 0"
            >
              Focus next task
            </button>
            <button
              class="insight-action secondary"
              type="button"
              (click)="editActiveTask()"
              [disabled]="!activeTask()"
            >
              Edit task
            </button>
            <button
              class="insight-action secondary"
              type="button"
              (click)="clearFocusedTask()"
              [disabled]="!selectedTaskId()"
            >
              Clear task
            </button>
            <button class="insight-action secondary" type="button" (click)="addTaskForToday()">
              Add task
            </button>
          </div>
        </article>

        <article class="insight-card schedule-card">
          <div class="insight-header">
            <div>
              <span class="eyebrow">Today's schedule</span>
              <h2>{{ scheduleHeadline() }}</h2>
            </div>
          </div>
          <div class="schedule-stats">
            <span
              ><strong>{{ completedWorkSessions() }}</strong> focus blocks</span
            >
            <span
              ><strong>{{ completedBreakSessions() }}</strong> breaks</span
            >
            <span
              ><strong>{{ averageFocusTimeDisplay() }}</strong> average focus</span
            >
          </div>
          <p>{{ nextBreakMessage() }}</p>
        </article>
      </section>

      <section class="quick-actions animate-fade-in-delay-2" aria-label="Quick actions">
        <div class="quick-actions-copy">
          <span class="eyebrow">Quick actions</span>
          <h2>Keep the session moving</h2>
        </div>
        <div class="quick-action-list">
          <button
            class="quick-action primary"
            type="button"
            (click)="startTimer()"
            [disabled]="timer.isRunning()"
          >
            {{ quickStartLabel() }}
            <kbd>Space</kbd>
          </button>
          <button class="quick-action" type="button" (click)="skipTimer()">
            Skip {{ timer.timerType() === 'work' ? 'focus' : 'break' }}
          </button>
          <button class="quick-action" type="button" (click)="resetTimer()">Reset cycle</button>
        </div>
      </section>

      <!-- Today's progress -->
      <section class="progress-row animate-fade-in-delay-2" aria-label="Today's progress">
        <div class="progress-card" role="list">
          <div
            class="progress-item"
            role="listitem"
            appTooltip="Completed focus sessions today. Interrupted sessions are not counted."
          >
            <div class="progress-icon sessions-icon" aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                <polyline points="22,4 12,14.01 9,11.01" />
              </svg>
            </div>
            <div class="progress-info">
              <span class="progress-value">{{ completedWorkSessions() }}</span>
              <span class="progress-label">Sessions</span>
            </div>
          </div>
          <div class="progress-divider" aria-hidden="true"></div>
          <div
            class="progress-item"
            role="listitem"
            appTooltip="Total time spent in focus sessions today."
          >
            <div class="progress-icon focus-icon" aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
            </div>
            <div class="progress-info">
              <span class="progress-value">{{ focusTimeDisplay() }}</span>
              <span class="progress-label">Focus time</span>
            </div>
          </div>
          <div class="progress-divider" aria-hidden="true"></div>
          <div
            class="progress-item"
            role="listitem"
            appTooltip="Your current focus-session streak for today. It resets at the start of a new day."
          >
            <div class="progress-icon streak-icon" aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="13,2 3,14 12,14 11,22 21,10 12,10 13,2" />
              </svg>
            </div>
            <div class="progress-info">
              <span class="progress-value">{{ timer.sessionCount() }}</span>
              <span class="progress-label">Streak</span>
            </div>
          </div>
          <div class="progress-divider" aria-hidden="true"></div>
          <div
            class="progress-item"
            role="listitem"
            appTooltip="Today's target is 8 completed focus sessions. This shows your progress toward it."
          >
            <div class="progress-icon goal-icon" aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </div>
            <div class="progress-info">
              <span class="progress-value">{{ dailyGoalProgress() }}</span>
              <span class="progress-label">Daily goal</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Timeline -->
      <section class="activity-section animate-fade-in-delay-2" aria-labelledby="timeline-title">
        <div class="timeline-panel">
          <div class="timeline-panel-inner">
            <div class="panel-header">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
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
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
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
            @for (command of filteredCommands(); track command.id; let index = $index) {
              <li
                [id]="'dashboard-command-' + command.id"
                class="palette-item"
                role="option"
                [attr.aria-selected]="index === paletteIndex()"
                [class.is-active]="index === paletteIndex()"
                tabindex="-1"
                (click)="runCommand(command)"
                (keydown.enter)="runCommand(command)"
                (mouseenter)="paletteIndex.set(index)"
              >
                <span class="palette-glyph" aria-hidden="true">{{ command.glyph }}</span>
                <span class="palette-copy">
                  <span class="palette-label">{{ command.label }}</span>
                  <span class="palette-hint">{{ command.hint }}</span>
                </span>
                @if (command.shortcut) {
                  <kbd>{{ command.shortcut }}</kbd>
                }
              </li>
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
        --dash-radius: var(--radius-2xl);
        --dash-border: var(--glass-border);
        --dash-border-strong: rgba(139, 92, 246, 0.24);
        display: block;
        min-height: 100%;
        position: relative;
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
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-md);
        margin-bottom: var(--space-lg);
      }
      .dashboard-heading {
        min-width: 0;
      }
      .page-title {
        font-size: clamp(26px, 2.6vw, 34px);
        font-weight: 800;
        letter-spacing: -0.03em;
        line-height: 1.1;
        margin: 2px 0 0;
      }
      .page-subtitle {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        margin: 6px 0 0;
        color: var(--color-text-muted);
        font-size: var(--text-sm);
      }
      .header-live {
        color: var(--color-text-secondary);
      }
      .subtitle-separator {
        opacity: 0.6;
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
        gap: 8px;
        min-height: 40px;
        padding: 0 12px;
        border: 1px solid var(--dash-border);
        border-radius: var(--radius-md);
        background: var(--glass-bg);
        color: var(--color-text-secondary);
        font: 600 var(--text-sm) var(--font-sans);
        cursor: pointer;
        transition:
          background 0.18s ease,
          border-color 0.18s ease,
          color 0.18s ease;
      }
      .header-action:hover {
        background: var(--glass-bg-hover);
        border-color: var(--dash-border-strong);
        color: var(--color-text-primary);
      }
      .header-action.icon-only {
        width: 40px;
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

      /* ===== Hero row: clock + rail =====
         The two shape rules below are deliberately kept: the clock card is the
         anchor of the page and the rail is the column beside it. */
      .main-row {
        flex: 1 0 560px;
        display: grid;
        grid-template-columns: 7fr 3fr;
        gap: var(--space-md);
        min-height: 0;
      }

      /* ===== Timer card ===== */
      .timer-card {
        position: relative;
        border-radius: var(--dash-radius);
        overflow: hidden;
        border: 1px solid var(--dash-border);
        background:
          radial-gradient(900px circle at 20% 0%, rgba(139, 92, 246, 0.14), transparent 55%),
          radial-gradient(700px circle at 100% 100%, rgba(6, 182, 212, 0.09), transparent 55%),
          var(--glass-bg);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.05),
          0 18px 48px rgba(0, 0, 0, 0.22);
      }
      .timer-card-inner {
        position: relative;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--space-md);
        padding: var(--space-lg);
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
      }
      .timer-ambient {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: radial-gradient(
          circle at 50% 42%,
          rgba(139, 92, 246, 0.07) 0%,
          transparent 62%
        );
        pointer-events: none;
      }

      .card-actions {
        position: absolute;
        top: 12px;
        right: 12px;
        display: flex;
        gap: 6px;
        z-index: 3;
      }
      .action-btn {
        width: 36px;
        height: 36px;
        border-radius: var(--radius-sm);
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
        background: rgba(139, 92, 246, 0.12);
        border-color: var(--dash-border-strong);
        color: var(--color-text-primary);
      }

      /* Mode + state are text as well as colour: the glyph, the label and the
         dot all say the same thing, so colour is never the only cue. */
      .timer-mode-row {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: var(--space-sm);
        z-index: 1;
      }
      .mode-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-radius: var(--radius-pill);
        border: 1px solid var(--dash-border-strong);
        background: rgba(139, 92, 246, 0.1);
        color: var(--color-text-secondary);
        font-size: var(--text-xs);
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .mode-chip[data-mode='work'] {
        color: #c4b5fd;
        border-color: rgba(139, 92, 246, 0.4);
      }
      .mode-chip[data-mode='short-break'] {
        color: #67e8f9;
        border-color: rgba(6, 182, 212, 0.4);
        background: rgba(6, 182, 212, 0.1);
      }
      .mode-chip[data-mode='long-break'] {
        color: #6ee7b7;
        border-color: rgba(52, 211, 153, 0.4);
        background: rgba(52, 211, 153, 0.1);
      }
      .mode-glyph {
        font-size: 10px;
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
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--color-text-muted);
      }
      .timer-state.running .state-dot {
        background: var(--color-success);
        box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.16);
      }

      /* ===== Task selector ===== */
      .task-selector {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        z-index: 1;
        width: 100%;
        max-width: 340px;
      }
      .task-selector-label {
        font-size: var(--text-2xs);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .task-selector select {
        background: var(--control-bg);
        border: 1px solid rgba(139, 92, 246, 0.18);
        border-radius: var(--radius-sm);
        padding: 7px 12px;
        color: var(--color-text-primary);
        font-size: var(--text-sm);
        outline: none;
        cursor: pointer;
        width: 100%;
        max-width: 280px;
        min-width: 0;
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
        transition:
          border-color 0.18s ease,
          background 0.18s ease;
      }
      .task-selector select:hover {
        background: var(--glass-bg-hover);
      }
      .task-selector select:focus {
        border-color: rgba(139, 92, 246, 0.55);
      }
      .task-selector select option,
      .task-selector select optgroup {
        background: var(--color-bg-secondary);
      }
      .task-selector select optgroup {
        color: var(--color-text-muted);
        font-size: var(--text-2xs);
        font-weight: 700;
        letter-spacing: 0.03em;
      }
      .task-selector select optgroup option {
        font-weight: 400;
        color: var(--color-text-primary);
        padding-left: 8px;
      }
      .selected-task-quadrant,
      .task-priority {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: var(--text-2xs);
        font-weight: 700;
        padding: 3px 8px;
        border-radius: var(--radius-sm);
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
        gap: 8px;
        z-index: 1;
        color: var(--color-text-muted);
        font-size: var(--text-xs);
      }
      .task-empty-action {
        padding: 6px 10px;
        border-radius: var(--radius-sm);
        border: 1px dashed var(--dash-border-strong);
        background: transparent;
        color: var(--color-text-secondary);
        font: 600 var(--text-xs) var(--font-sans);
        cursor: pointer;
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
        gap: var(--space-sm);
        z-index: 1;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 44px;
        padding: 10px 20px;
        border-radius: var(--radius-lg);
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
        padding: 12px 28px;
        font-size: var(--text-md);
      }
      .btn-primary {
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 52%, #6d28d9 100%);
        color: #fff;
        box-shadow:
          0 8px 24px rgba(139, 92, 246, 0.28),
          inset 0 1px 0 rgba(255, 255, 255, 0.14);
      }
      .btn-primary:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow:
          0 12px 32px rgba(139, 92, 246, 0.4),
          inset 0 1px 0 rgba(255, 255, 255, 0.18);
      }
      .btn-primary:active:not(:disabled) {
        transform: translateY(0);
      }
      .btn-secondary {
        background: rgba(139, 92, 246, 0.12);
        border: 1px solid rgba(139, 92, 246, 0.28);
        color: var(--color-text-primary);
      }
      .btn-secondary:hover:not(:disabled) {
        background: rgba(139, 92, 246, 0.18);
        border-color: rgba(139, 92, 246, 0.45);
      }
      .btn-ghost {
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        color: var(--color-text-muted);
        padding: 10px;
        min-width: 44px;
        border-radius: var(--radius-md);
      }
      .btn-ghost:hover:not(:disabled) {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary);
      }
      .timer-hints {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 6px 14px;
        color: var(--color-text-muted);
        font-size: var(--text-2xs);
        z-index: 1;
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
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
        min-width: 0;
        min-height: 0;
      }
      .rail-card {
        padding: var(--space-md);
        border: 1px solid var(--dash-border);
        border-radius: var(--dash-radius);
        background: var(--glass-bg);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
        min-width: 0;
      }
      .cycle-card {
        flex: 0 0 auto;
      }
      .live-card {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
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
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .insight-header h2 {
        margin: 3px 0 0;
        font-size: var(--text-md);
        line-height: 1.35;
        color: var(--color-text-primary);
        overflow-wrap: anywhere;
      }
      .rail-card p,
      .insight-card p {
        margin: var(--space-sm) 0 0;
        color: var(--color-text-secondary);
        font-size: var(--text-sm);
        line-height: 1.5;
      }
      .cycle-status,
      .goal-percent {
        flex-shrink: 0;
        padding: 4px 8px;
        border-radius: var(--radius-xs);
        font-size: var(--text-2xs);
        font-weight: 700;
        background: rgba(139, 92, 246, 0.12);
        color: #a78bfa;
        border: 1px solid rgba(139, 92, 246, 0.25);
      }
      .cycle-status.break-ready {
        background: rgba(52, 211, 153, 0.12);
        color: #34d399;
        border-color: rgba(52, 211, 153, 0.3);
      }
      .cycle-dots {
        display: flex;
        gap: 6px;
        margin-top: var(--space-sm);
      }
      .cycle-dot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 1px solid var(--glass-border);
        color: var(--color-text-muted);
        font-size: var(--text-2xs);
        font-weight: 700;
      }
      .cycle-dot.done {
        background: rgba(139, 92, 246, 0.22);
        border-color: rgba(139, 92, 246, 0.45);
        color: #ddd6fe;
      }
      .cycle-dot.current {
        border-color: var(--color-accent-secondary);
        color: var(--color-text-primary);
        box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.18);
      }
      .cycle-progress,
      .goal-track {
        height: 6px;
        overflow: hidden;
        margin-top: var(--space-sm);
        border-radius: var(--radius-pill);
        background: rgba(255, 255, 255, 0.08);
      }
      .cycle-progress span,
      .goal-track span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #8b5cf6, #06b6d4);
        transition: width 0.3s ease;
      }

      .rail-count {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 26px;
        height: 24px;
        padding: 0 7px;
        border-radius: var(--radius-pill);
        background: var(--glass-bg-hover);
        border: 1px solid var(--glass-border);
        color: var(--color-text-secondary);
        font-size: var(--text-xs);
        font-weight: 700;
      }
      .activity-list {
        list-style: none;
        margin: var(--space-sm) 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
        overflow-y: auto;
        min-height: 0;
      }
      .activity-item {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 7px 8px;
        border-radius: var(--radius-sm);
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid transparent;
      }
      .activity-glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        flex-shrink: 0;
        border-radius: 8px;
        background: rgba(139, 92, 246, 0.12);
        color: #c4b5fd;
        font-size: 11px;
      }
      .activity-glyph[data-type='short-break'] {
        background: rgba(6, 182, 212, 0.12);
        color: #67e8f9;
      }
      .activity-glyph[data-type='long-break'] {
        background: rgba(52, 211, 153, 0.12);
        color: #6ee7b7;
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
        color: #fbbf24;
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
        padding: var(--space-md) var(--space-sm);
      }
      .live-empty p {
        margin: 0;
        max-width: 24ch;
      }
      .empty-action {
        min-height: 36px;
        padding: 6px 12px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--dash-border-strong);
        background: rgba(139, 92, 246, 0.1);
        color: var(--color-text-primary);
        font: 600 var(--text-xs) var(--font-sans);
        cursor: pointer;
      }
      .empty-action:hover {
        background: rgba(139, 92, 246, 0.18);
      }
      .live-loading {
        margin-top: var(--space-sm);
        color: var(--color-text-muted);
        font-size: var(--text-xs);
      }

      /* ===== Insight cards ===== */
      .insights-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: var(--space-md);
        margin-top: var(--space-md);
      }
      .insight-card,
      .quick-actions,
      .progress-card {
        padding: var(--space-md);
        border: 1px solid var(--dash-border);
        border-radius: var(--dash-radius);
        background: var(--glass-bg);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
      }
      .insight-card {
        display: flex;
        flex-direction: column;
      }
      .task-card h2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      .goal-track {
        margin-top: var(--space-sm);
      }
      .task-actions,
      .quick-action-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: var(--space-md);
      }
      .insight-action,
      .quick-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 36px;
        padding: 7px 11px;
        border: 1px solid rgba(139, 92, 246, 0.24);
        border-radius: var(--radius-sm);
        background: rgba(139, 92, 246, 0.09);
        color: var(--color-text-primary);
        font: 600 var(--text-xs) var(--font-sans);
        cursor: pointer;
        transition:
          background 0.18s ease,
          border-color 0.18s ease,
          color 0.18s ease;
      }
      .insight-action.secondary,
      .quick-action {
        background: transparent;
        color: var(--color-text-secondary);
      }
      .insight-action:hover:not(:disabled),
      .quick-action:hover:not(:disabled) {
        border-color: rgba(139, 92, 246, 0.5);
        background: rgba(139, 92, 246, 0.14);
        color: var(--color-text-primary);
      }
      .insight-action:disabled,
      .quick-action:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .schedule-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 14px;
        margin-top: var(--space-md);
        color: var(--color-text-muted);
        font-size: var(--text-xs);
      }
      .schedule-stats strong {
        color: var(--color-text-primary);
        font-variant-numeric: tabular-nums;
      }

      /* ===== Quick actions ===== */
      .quick-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-md);
        margin-top: var(--space-md);
      }
      .quick-actions-copy h2 {
        margin: 3px 0 0;
        font-size: var(--text-md);
        font-weight: 700;
        color: var(--color-text-primary);
      }
      .quick-action-list {
        margin-top: 0;
        justify-content: flex-end;
      }
      .quick-action.primary {
        background: linear-gradient(135deg, #8b5cf6, #6d28d9);
        border-color: transparent;
        color: #fff;
      }
      .quick-action.primary kbd {
        border-color: rgba(255, 255, 255, 0.25);
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
      }

      /* ===== Progress row ===== */
      .progress-row {
        margin-top: var(--space-md);
        flex-shrink: 0;
      }
      .progress-card {
        display: flex;
        align-items: center;
        justify-content: space-around;
        padding: 16px 24px;
      }
      .progress-item {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .progress-icon {
        width: 38px;
        height: 38px;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .sessions-icon {
        background: rgba(139, 92, 246, 0.12);
        color: #a78bfa;
      }
      .focus-icon {
        background: rgba(6, 182, 212, 0.12);
        color: #22d3ee;
      }
      .streak-icon {
        background: rgba(251, 191, 36, 0.12);
        color: #fbbf24;
      }
      .goal-icon {
        background: rgba(52, 211, 153, 0.12);
        color: #34d399;
      }
      .progress-info {
        display: flex;
        flex-direction: column;
      }
      .progress-value {
        font-size: var(--text-4xl);
        font-weight: 700;
        line-height: 1.1;
        font-variant-numeric: tabular-nums;
      }
      .progress-label {
        font-size: var(--text-2xs);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .progress-divider {
        width: 1px;
        height: 32px;
        background: var(--glass-border);
      }

      /* ===== Timeline ===== */
      .activity-section {
        margin-top: var(--space-md);
      }
      .timeline-panel {
        border-radius: var(--dash-radius);
        overflow: hidden;
        border: 1px solid var(--dash-border);
        background: var(--glass-bg);
      }
      .timeline-panel-inner {
        height: 380px;
        padding: var(--space-md);
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
        gap: 6px;
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
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: var(--space-md);
        margin-top: var(--space-md);
        align-items: stretch;
      }
      .wellness-grid > app-water-card,
      .wellness-grid > .dashboard-prefs {
        margin-top: var(--space-md);
      }
      .dashboard-prefs {
        padding: var(--space-md);
        background: var(--glass-bg);
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
        padding: max(10vh, var(--space-xl)) var(--space-md) var(--space-md);
        background: rgba(4, 2, 12, 0.64);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        overflow-y: auto;
      }
      .command-palette,
      .shortcuts-dialog {
        width: min(660px, 100%);
        max-height: min(72vh, 560px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid var(--glass-border-accent);
        border-radius: var(--radius-xl);
        background: var(--surface-float);
        box-shadow:
          0 30px 90px rgba(0, 0, 0, 0.5),
          0 0 0 1px rgba(255, 255, 255, 0.04) inset;
      }
      .shortcuts-dialog {
        width: min(540px, 100%);
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
        padding: 12px 14px;
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
        font: 500 var(--text-xl) var(--font-sans);
      }
      .palette-search input::placeholder {
        color: var(--color-text-muted);
      }
      .palette-close {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 32px;
        padding: 2px 6px;
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-sm);
        background: transparent;
        cursor: pointer;
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
      .palette-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 10px;
        border-radius: var(--radius-sm);
        border: 1px solid transparent;
        cursor: pointer;
      }
      .palette-item.is-active {
        background: rgba(139, 92, 246, 0.14);
        border-color: rgba(139, 92, 246, 0.3);
      }
      .palette-glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        flex-shrink: 0;
        border-radius: var(--radius-sm);
        border: 1px solid var(--glass-border);
        background: var(--glass-bg);
        color: var(--color-text-secondary);
        font-size: var(--text-xs);
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
        padding: 9px 14px;
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
        gap: 7px;
        margin: 0;
      }
      .shortcut-row {
        display: grid;
        grid-template-columns: 130px 1fr;
        align-items: center;
        gap: var(--space-sm);
        padding: 6px 0;
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
          radial-gradient(ellipse 60% 40% at 50% 50%, rgba(139, 92, 246, 0.08) 0%, transparent 60%),
          radial-gradient(circle 300px at 30% 70%, rgba(6, 182, 212, 0.04) 0%, transparent 100%);
        pointer-events: none;
      }
      .exit-fullscreen-btn {
        position: absolute;
        top: 24px;
        right: 24px;
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 44px;
        padding: 8px 16px;
        border-radius: var(--radius-md);
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
          gap: var(--space-lg);
          padding: var(--space-xl);
        }
      }

      @media (max-width: 1280px) {
        .main-row {
          grid-template-columns: 6fr 4fr;
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
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .progress-card {
          flex-wrap: wrap;
          gap: 12px;
          justify-content: center;
        }
        .progress-divider {
          display: none;
        }
        .timeline-panel-inner {
          height: 300px;
        }
      }

      @media (max-width: 760px) {
        .dashboard-header {
          flex-direction: column;
        }
        .header-actions {
          width: 100%;
        }
        .header-action.palette-trigger {
          flex: 1;
          justify-content: flex-start;
        }
        .focus-rail {
          grid-template-columns: 1fr;
        }
        .quick-actions {
          align-items: flex-start;
          flex-direction: column;
        }
        .quick-action-list {
          width: 100%;
          justify-content: flex-start;
        }
      }

      @media (max-width: 640px) {
        .page-title {
          font-size: 24px;
        }
        .timer-card-inner {
          gap: var(--space-sm);
          padding: var(--space-md);
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
        .task-selector select {
          min-height: 44px;
          max-width: 100%;
          font-size: var(--text-xl);
        }
        .progress-card {
          padding: 12px 16px;
        }
        .progress-icon {
          width: 30px;
          height: 30px;
        }
        .progress-value {
          font-size: var(--text-2xl);
        }
        .quick-action {
          flex: 1 1 auto;
        }
        .insight-action,
        .quick-action,
        .empty-action,
        .task-empty-action {
          min-height: 44px;
        }
        .shortcut-row {
          grid-template-columns: 1fr;
          gap: 2px;
        }
        .timeline-panel-inner {
          height: 260px;
        }
        .fullscreen-clock {
          --clock-size: clamp(160px, 45vmin, 280px);
          width: var(--clock-size);
          height: var(--clock-size);
        }
        .dialog-backdrop {
          padding: var(--space-md) var(--space-sm);
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
        .fullscreen-clock {
          --clock-size: clamp(420px, 40vmin, 720px);
          width: var(--clock-size);
          height: var(--clock-size);
        }
        .page-title {
          font-size: 34px;
        }
        .progress-value {
          font-size: var(--text-5xl);
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
        .cycle-progress span,
        .goal-track span {
          transition: none !important;
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
        .quick-actions,
        .progress-card,
        .timeline-panel,
        .dashboard-prefs {
          border-color: var(--color-text-secondary);
        }
        .page-subtitle,
        .rail-card p,
        .insight-card p,
        .activity-meta,
        .progress-label,
        .schedule-stats {
          color: var(--color-text-primary);
        }
      }

      @media (forced-colors: active) {
        .timer-card,
        .rail-card,
        .insight-card,
        .quick-actions,
        .progress-card,
        .timeline-panel,
        .dashboard-prefs,
        .command-palette,
        .shortcuts-dialog {
          border: 1px solid CanvasText;
          background: Canvas;
          box-shadow: none;
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
        .btn-primary {
          background: Highlight;
          color: HighlightText;
        }
        .palette-item.is-active {
          outline: 2px solid Highlight;
          outline-offset: -2px;
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
    // The picker shows the quadrant the day is working through — the same one
    // whose cards carry the start-focus button on every page. A task started
    // from elsewhere may not be on today's list, so it is added to the group
    // when the focused id names it; otherwise it would be selected but invisible.
    const quadrant = this.taskService.focusQuadrant();
    if (!quadrant) return [];
    const tasks = this.taskService.todayTasks().filter((task) => task.quadrant === quadrant);
    const selectedId = this.selectedTaskId();
    const selected = selectedId
      ? this.taskService.tasks().find((task) => task.id === selectedId)
      : null;
    if (
      selected &&
      selected.quadrant === quadrant &&
      !tasks.some((task) => task.id === selected.id)
    ) {
      tasks.push(selected);
    }
    return [
      {
        quadrant,
        label: `${QUADRANT_CONFIG[quadrant].emoji} ${QUADRANT_CONFIG[quadrant].label}`,
        tasks,
      },
    ];
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
  readonly activeTask = computed<Task | null>(() => {
    const selectedTaskId = this.selectedTaskId();
    if (!selectedTaskId) return null;
    // A task started from another page may not be on today's list; the card
    // names whatever is linked, not only today's subset.
    return this.taskService.tasks().find((task) => task.id === selectedTaskId) ?? null;
  });
  readonly openTodayTasks = computed(() => this.taskService.todayTasks().length);
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
  readonly timerModeGlyph = computed(() => {
    switch (this.timer.timerType()) {
      case 'short-break':
        return '◐';
      case 'long-break':
        return '◉';
      default:
        return '●';
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

  /** Newest first, four at most: the rail is a glance, not the timeline. */
  readonly recentSessions = computed(() =>
    [...this.todaySessions()]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, 4),
  );

  readonly commands = computed<DashboardCommand[]>(() => {
    const commands: DashboardCommand[] = [];
    if (this.timer.isRunning()) {
      commands.push({
        id: 'pause',
        label: 'Pause timer',
        hint: this.timerModeLabel(),
        keywords: 'stop hold break focus',
        glyph: '⏸',
        shortcut: 'Space',
        run: () => this.timer.pause(),
      });
    } else {
      commands.push({
        id: 'start',
        label: this.startLabel(),
        hint: `Begin a ${this.timerModeLabel().toLowerCase()}`,
        keywords: 'begin resume play focus break timer',
        glyph: '▶',
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
        glyph: '⏭',
        shortcut: 'S',
        run: () => this.skipTimer(),
      },
      {
        id: 'reset',
        label: 'Reset the session cycle',
        hint: 'Return the timer to the beginning',
        keywords: 'restart cycle timer',
        glyph: '↺',
        shortcut: 'R',
        run: () => this.resetTimer(),
      },
      {
        id: 'fullscreen',
        label: 'Toggle fullscreen focus',
        hint: 'A clock with nothing else around it',
        keywords: 'zen focus distraction timer',
        glyph: '⛶',
        shortcut: 'F',
        run: () => this.toggleFullscreen(),
      },
      {
        id: 'mini',
        label: 'Minimize to the mini widget',
        hint: 'Keep the clock above your other windows',
        keywords: 'floating small widget window',
        glyph: '▭',
        shortcut: 'M',
        run: () => void this.toggleMiniMode(),
      },
      {
        id: 'next-task',
        label: 'Focus the next task',
        hint: `${this.openTodayTasks()} open task${this.openTodayTasks() === 1 ? '' : 's'} today`,
        keywords: 'task next work today',
        glyph: '→',
        shortcut: 'N',
        run: () => this.focusNextTask(),
      },
      {
        id: 'add-task',
        label: 'Add a task for today',
        hint: 'Open the task form without leaving this page',
        keywords: 'new create task today',
        glyph: '+',
        shortcut: 'Ctrl N',
        run: () => this.addTaskForToday(),
      },
      {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        hint: 'Every key this page answers to',
        keywords: 'keys help accessibility',
        glyph: '?',
        shortcut: '?',
        run: () => this.openShortcuts(),
      },
      {
        id: 'settings',
        label: 'Open Settings',
        hint: 'Timers, reminders, appearance and accessibility',
        keywords: 'preferences options configure page',
        glyph: '⚙',
        run: () => this.openPage('/settings'),
      },
      {
        id: 'tasks',
        label: 'Open Tasks',
        hint: 'The board, filters and every task',
        keywords: 'board work page',
        glyph: '☰',
        run: () => this.openPage('/tasks'),
      },
      {
        id: 'analytics',
        label: 'Open Analytics',
        hint: 'Your focus, sessions and task flow',
        keywords: 'stats charts report page',
        glyph: '◎',
        run: () => this.openPage('/analytics'),
      },
      {
        id: 'today',
        label: 'Open Today',
        hint: 'The day’s board',
        keywords: 'today board page',
        glyph: '☀',
        run: () => this.openPage('/today'),
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
    const command = this.filteredCommands()[this.paletteIndex()];
    return command ? `dashboard-command-${command.id}` : null;
  });

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

  /** A glyph that says the same thing as the quadrant's colour. */
  quadrantGlyph(quadrant: string | null): string {
    switch (quadrant) {
      case 'urgent-important':
        return '▲';
      case 'important':
        return '◆';
      case 'urgent':
        return '●';
      case 'neither':
        return '○';
      default:
        return '–';
    }
  }

  sessionTypeLabel(type: TimerType): string {
    if (type === 'work') return 'Focus';
    return type === 'long-break' ? 'Long break' : 'Short break';
  }

  sessionGlyph(type: TimerType): string {
    if (type === 'work') return '▶';
    return type === 'long-break' ? '◉' : '◐';
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
        const list = this.filteredCommands();
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
        const command = this.filteredCommands()[this.paletteIndex()];
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
