import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  computed,
  signal,
  ViewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
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
import { PomodoroSession } from '../../core/models/session.model';
import { Task, TaskQuadrant } from '../../core/models/task.model';
import { QUADRANT_CONFIG } from '../../core/constants/theme.constants';
import { TaskEditorService } from '../../core/services/task-editor.service';
import { readFocusedTaskId, saveFocusedTaskId } from '../../core/utils/focus-task.util';
import { localDayKey } from '../../core/utils/nudge-schedule.util';
import { TaskSelectFormModel, createTaskSelectFormDefaults } from '../../shared/models/form.models';

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
    '(window:keydown.escape)': 'onEscape()',
  },
  template: `
    <!-- Fullscreen overlay -->
    @if (isFullscreen()) {
      <div class="fullscreen-overlay">
        <div class="fullscreen-ambient"></div>
        <button class="exit-fullscreen-btn" (click)="toggleFullscreen()">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
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
        <div class="fullscreen-controls">
          @if (timer.isRunning()) {
            <button class="btn btn-secondary btn-lg" (click)="timer.pause()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              Pause
            </button>
          } @else {
            <button class="btn btn-primary btn-lg" (click)="startTimer()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
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
            (click)="stopTimer()"
            [disabled]="!timer.isRunning() && timer.remainingSeconds() === timer.totalDuration()"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="3" />
            </svg>
          </button>
          <button class="btn btn-ghost" (click)="skipTimer()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,4 15,12 5,20" />
              <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5" />
            </svg>
          </button>
        </div>
      </div>
    }

    <!-- Main dashboard -->
    <div class="dashboard-wrapper" [class.hidden]="isFullscreen() || ui.isNativeWidget()">
      <!-- Main row: Clock (80%) | Timeline (20%) -->
      <div class="main-row animate-fade-in-delay-1">
        <div class="timer-card">
          <div class="timer-card-inner">
            <div class="timer-ambient"></div>
            <!-- Action buttons top-right -->
            <div class="card-actions">
              <button
                class="action-btn"
                title="Minimize to floating clock"
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
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <button class="action-btn" title="Fullscreen" (click)="toggleFullscreen()">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="15,3 21,3 21,9" />
                  <polyline points="9,21 3,21 3,15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
            </div>

            <app-animated-clock
              [displayTime]="timer.displayTime()"
              [progress]="timer.progress()"
              [timerType]="timer.timerType()"
            />
            <!-- Task selector -->
            @if (taskService.todayTasks().length > 0) {
              <div class="task-selector">
                <select
                  [formField]="taskSelectForm.taskId"
                  (change)="onTaskSelect()"
                  [appTooltip]="selectedTaskFullTitle()"
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
                  <span class="selected-task-quadrant" [class]="selectedTaskQuadrant()">
                    {{ quadrantFullLabel(selectedTaskQuadrant()) }}
                  </span>
                }
              </div>
            }
            <div class="timer-controls">
              @if (timer.isRunning()) {
                <button class="btn btn-secondary btn-lg" (click)="timer.pause()">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                  Pause
                </button>
              } @else {
                <button class="btn btn-primary btn-lg" (click)="startTimer()">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
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
                (click)="stopTimer()"
                [disabled]="
                  !timer.isRunning() && timer.remainingSeconds() === timer.totalDuration()
                "
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="3" />
                </svg>
              </button>
              <button class="btn btn-ghost" (click)="skipTimer()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,4 15,12 5,20" />
                  <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Vertical Timeline -->
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
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
              <span>Timeline</span>
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
      </div>

      <!-- Focus insights and actions -->
      <section class="insights-grid animate-fade-in-delay-2" aria-label="Focus insights">
        <article class="insight-card">
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
            [attr.aria-valuenow]="dailyGoalPercentage()"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span [style.width.%]="dailyGoalPercentage()"></span>
          </div>
          <p>{{ dailyGoalMessage() }}</p>
        </article>

        <article class="insight-card cycle-card">
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
        </article>

        <article class="insight-card task-card">
          <div class="insight-header">
            <div>
              <span class="eyebrow">Current focus</span>
              <h2 [appTooltip]="activeTask()?.title ?? ''">
                {{ activeTask()?.title ?? 'Choose a task to give this session context' }}
              </h2>
            </div>
            @if (activeTask()?.quadrant; as quadrant) {
              <span class="task-priority">{{ quadrantFullLabel(quadrant) }}</span>
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
          </div>
        </article>

        <article class="insight-card">
          <div class="insight-header">
            <div>
              <span class="eyebrow">Today&apos;s schedule</span>
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
        <span class="eyebrow">Quick actions</span>
        <div class="quick-action-list">
          <button
            class="quick-action primary"
            type="button"
            (click)="startTimer()"
            [disabled]="timer.isRunning()"
          >
            {{
              timer.remainingSeconds() < timer.totalDuration()
                ? 'Resume timer'
                : timer.timerType() === 'work'
                  ? 'Start focus'
                  : 'Start break'
            }}
          </button>
          <button class="quick-action" type="button" (click)="skipTimer()">
            Skip {{ timer.timerType() === 'work' ? 'focus' : 'break' }}
          </button>
          <button class="quick-action" type="button" (click)="resetTimer()">Reset cycle</button>
        </div>
      </section>

      <!-- Bottom row: Today's Progress -->
      <div class="progress-row animate-fade-in-delay-2">
        <div class="progress-card">
          <div
            class="progress-item"
            appTooltip="Completed focus sessions today. Interrupted sessions are not counted."
          >
            <div class="progress-icon sessions-icon">
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
          <div class="progress-divider"></div>
          <div class="progress-item" appTooltip="Total time spent in focus sessions today.">
            <div class="progress-icon focus-icon">
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
              <span class="progress-label">Focus Time</span>
            </div>
          </div>
          <div class="progress-divider"></div>
          <div
            class="progress-item"
            appTooltip="Your current focus-session streak for today. It resets at the start of a new day."
          >
            <div class="progress-icon streak-icon">
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
          <div class="progress-divider"></div>
          <div
            class="progress-item"
            appTooltip="Today's target is 8 completed focus sessions. This shows your progress toward it."
          >
            <div class="progress-icon goal-icon">
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
              <span class="progress-label">Daily Goal</span>
            </div>
          </div>
        </div>
      </div>

      <!-- The two health reminders, one click from here: the same switches as
           Settings, without walking to the Settings page to turn one off. -->
      <app-desk-health-card class="animate-fade-in-delay-2" />

      <!-- Today's water: what has been drunk, and one tap to add a glass -->
      <app-water-card class="animate-fade-in-delay-2" />

      <!-- Desktop behaviour: the same switches as Settings, one click away -->
      <div class="dashboard-prefs animate-fade-in-delay-2">
        <app-desktop-prefs-panel title="App Behaviour" />
      </div>
    </div>

    <!-- Confetti celebration -->
    <app-confetti [sessionsBeforeLongBreak]="sessionsBeforeLongBreak()" />
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100%;
        position: relative;
      }

      /* ===== Main Layout ===== */
      .dashboard-wrapper {
        min-height: 100%;
        display: flex;
        flex-direction: column;
        padding-bottom: var(--space-xl);
      }
      .dashboard-wrapper.hidden {
        display: none;
      }
      /* Desktop switches: same glass card as the other dashboard panels. */
      .dashboard-prefs {
        margin-top: var(--space-md);
        max-width: 560px;
        background: var(--glass-bg);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(139, 92, 246, 0.08);
        border-radius: 16px;
        padding: var(--space-lg);
        transition: border-color 0.3s;
      }
      .dashboard-prefs:hover {
        border-color: rgba(139, 92, 246, 0.15);
      }
      .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-lg);
      }
      .page-title {
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -0.5px;
      }
      .page-subtitle {
        color: var(--color-text-muted);
        margin-top: 2px;
        font-size: 13px;
      }

      /* ===== Main Row: Clock 70% | Timeline 30% ===== */
      .main-row {
        /* Tall enough for the dial, the task row and the controls together: the
         clock card must never have to choose between them (and so never
         scroll). See the breakpoint overrides for the larger paddings and the
         stacked layout. */
        flex: 1 0 560px;
        display: grid;
        grid-template-columns: 7fr 3fr;
        gap: var(--space-md);
        min-height: 0;
      }

      /* Timer Card */
      .timer-card {
        position: relative;
        border-radius: var(--glass-radius);
        overflow: hidden;
      }
      /*
     * The card the clock lives in is a fixed shape, so it never scrolls: a
     * scrollbar down the side of a timer face is worse than a slightly smaller
     * dial. Nothing in it is sized from the window either — the dial takes the
     * height left over by the task row and the controls, so a short card shrinks
     * it and a tall one fills the space instead of leaving it empty.
     */
      .timer-card-inner {
        position: relative;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--space-lg);
        padding: var(--space-xl);
        background: var(--glass-bg);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(139, 92, 246, 0.08);
        border-radius: var(--glass-radius);
        overflow: hidden;
      }
      .timer-card-inner app-animated-clock {
        /* Whatever height the card has left after the task row and the controls,
         as a square — up to its design size, which is what the card was built
         around. It only shrinks when the card genuinely cannot hold it. */
        flex: 1 1 auto;
        min-height: 0;
        max-height: min(340px, 35vmin);
        aspect-ratio: 1;
        width: auto;
        max-width: 100%;
        /* The dial's own clamp (180-360px) is not wanted here: the card decides
         the size and the component fills the box it is given. */
        --clock-size: 100%;
      }
      .timer-ambient {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: radial-gradient(
          circle at 50% 40%,
          rgba(139, 92, 246, 0.06) 0%,
          transparent 60%
        );
        pointer-events: none;
      }

      /* Card action buttons */
      .card-actions {
        position: absolute;
        top: 16px;
        right: 16px;
        display: flex;
        gap: 6px;
        z-index: 3;
      }
      .action-btn {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        color: var(--color-text-muted);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      .action-btn:hover {
        background: rgba(139, 92, 246, 0.1);
        border-color: rgba(139, 92, 246, 0.3);
        color: var(--color-text-primary);
      }

      /* Timer controls */
      .timer-controls {
        display: flex;
        align-items: center;
        gap: var(--space-md);
        z-index: 1;
      }

      /* Task Selector */
      .task-selector {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        margin-bottom: 8px;
        z-index: 1;
        width: 100%;
        max-width: 320px;
      }
      .task-selector select {
        background: var(--control-bg);
        border: 1px solid rgba(139, 92, 246, 0.15);
        border-radius: 8px;
        padding: 6px 12px;
        color: var(--color-text-primary);
        font-size: 12px;
        outline: none;
        cursor: pointer;
        width: 100%;
        max-width: 260px;
        min-width: 0;
        /* A native select widens to its longest option — keep it bounded. */
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
        transition: border-color 0.2s;
      }
      .task-selector select:focus {
        border-color: rgba(139, 92, 246, 0.4);
      }
      .task-selector select option {
        background: var(--color-bg-secondary);
      }
      .task-selector select optgroup {
        background: var(--color-bg-secondary);
        color: var(--color-text-muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.03em;
      }
      .task-selector select optgroup option {
        font-weight: 400;
        color: var(--color-text-primary);
        padding-left: 8px;
      }
      .selected-task-quadrant {
        font-size: 10px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 8px;
        letter-spacing: 0.03em;
      }
      .selected-task-quadrant.urgent-important {
        background: var(--quadrant-q1-bg);
        color: var(--quadrant-q1-color);
        border: 1px solid var(--quadrant-q1-border);
      }
      .selected-task-quadrant.important {
        background: var(--quadrant-q2-bg);
        color: var(--quadrant-q2-color);
        border: 1px solid var(--quadrant-q2-border);
      }
      .selected-task-quadrant.urgent {
        background: var(--quadrant-q3-bg);
        color: var(--quadrant-q3-color);
        border: 1px solid var(--quadrant-q3-border);
      }
      .selected-task-quadrant.neither {
        background: var(--quadrant-q4-bg);
        color: var(--quadrant-q4-color);
        border: 1px solid var(--quadrant-q4-border);
      }

      /* Buttons */
      .btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        font-family: var(--font-sans);
      }
      .btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      .btn-lg {
        padding: 12px 28px;
        font-size: 14px;
      }
      .btn-primary {
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%);
        color: white;
        box-shadow:
          0 4px 20px rgba(139, 92, 246, 0.3),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);
      }
      .btn-primary:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow:
          0 8px 30px rgba(139, 92, 246, 0.5),
          inset 0 1px 0 rgba(255, 255, 255, 0.15);
      }
      .btn-primary:active:not(:disabled) {
        transform: translateY(0);
      }
      .btn-secondary {
        background: rgba(139, 92, 246, 0.1);
        border: 1px solid rgba(139, 92, 246, 0.25);
        color: var(--color-text-primary);
      }
      .btn-secondary:hover:not(:disabled) {
        background: rgba(139, 92, 246, 0.15);
        border-color: rgba(139, 92, 246, 0.4);
      }
      .btn-ghost {
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        color: var(--color-text-muted);
        padding: 10px;
        border-radius: 10px;
      }
      .btn-ghost:hover:not(:disabled) {
        color: var(--color-text-primary);
        background: var(--glass-bg-hover);
      }

      /* ===== Timeline Panel ===== */
      .timeline-panel {
        border-radius: var(--glass-radius);
        overflow: hidden;
      }
      .timeline-panel-inner {
        height: 100%;
        padding: var(--space-md);
        background: var(--glass-bg);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(139, 92, 246, 0.06);
        border-radius: var(--glass-radius);
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
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--color-text-muted);
        margin-bottom: var(--space-sm);
        padding-bottom: 8px;
        border-bottom: 1px solid var(--glass-border);
        flex-shrink: 0;
      }
      .panel-header svg {
        opacity: 0.5;
      }

      /* ===== Bottom Progress Row ===== */
      .progress-row {
        margin-top: var(--space-md);
        flex-shrink: 0;
      }
      .progress-card {
        display: flex;
        align-items: center;
        justify-content: space-around;
        padding: 16px 24px;
        background: var(--glass-bg);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(139, 92, 246, 0.06);
        border-radius: 16px;
      }
      .progress-item {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .progress-icon {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .sessions-icon {
        background: rgba(139, 92, 246, 0.1);
        color: #8b5cf6;
      }
      .focus-icon {
        background: rgba(6, 182, 212, 0.1);
        color: #06b6d4;
      }
      .streak-icon {
        background: rgba(251, 191, 36, 0.1);
        color: #fbbf24;
      }
      .goal-icon {
        background: rgba(52, 211, 153, 0.1);
        color: #34d399;
      }
      .progress-info {
        display: flex;
        flex-direction: column;
      }
      .progress-value {
        font-size: 18px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .progress-label {
        font-size: 10px;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .progress-divider {
        width: 1px;
        height: 32px;
        background: var(--glass-border);
      }

      /* ===== Focus Insights ===== */
      .insights-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-md);
        margin-top: var(--space-md);
      }
      .insight-card,
      .quick-actions {
        padding: var(--space-md);
        background: var(--glass-bg);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(139, 92, 246, 0.1);
        border-radius: 16px;
      }
      .insight-header {
        display: flex;
        justify-content: space-between;
        gap: var(--space-md);
        align-items: flex-start;
      }
      .eyebrow {
        display: block;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .insight-card h2 {
        margin: 4px 0 0;
        font-size: 14px;
        line-height: 1.35;
        color: var(--color-text-primary);
      }
      /* Long task titles clamp to two lines instead of stretching the card. */
      .task-card h2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      .insight-card p {
        margin: var(--space-sm) 0 0;
        color: var(--color-text-secondary);
        font-size: 12px;
        line-height: 1.45;
      }
      .goal-percent,
      .cycle-status,
      .task-priority {
        flex-shrink: 0;
        padding: 4px 7px;
        border-radius: 6px;
        font-size: 10px;
        font-weight: 700;
        background: rgba(139, 92, 246, 0.12);
        color: #a78bfa;
      }
      .cycle-status.break-ready {
        background: rgba(52, 211, 153, 0.12);
        color: #34d399;
      }
      .task-priority {
        max-width: 120px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .goal-track {
        height: 6px;
        overflow: hidden;
        margin-top: var(--space-md);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
      }
      .goal-track span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #8b5cf6, #06b6d4);
        transition: width 0.3s ease;
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
        padding: 7px 10px;
        border: 1px solid rgba(139, 92, 246, 0.22);
        border-radius: 8px;
        background: rgba(139, 92, 246, 0.08);
        color: var(--color-text-primary);
        font: 600 11px var(--font-sans);
        cursor: pointer;
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
        font-size: 11px;
      }
      .schedule-stats strong {
        color: var(--color-text-primary);
        font-variant-numeric: tabular-nums;
      }
      .quick-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-md);
        margin-top: var(--space-md);
      }
      .quick-action-list {
        margin-top: 0;
      }
      .quick-action.primary {
        background: linear-gradient(135deg, #8b5cf6, #6d28d9);
        border-color: transparent;
        color: white;
      }

      /* ===== Fullscreen Mode ===== */
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
        padding: 8px 16px;
        border-radius: 10px;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        color: var(--color-text-secondary);
        cursor: pointer;
        font-size: 13px;
        font-family: var(--font-sans);
        transition: all 0.2s;
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
      .fullscreen-controls {
        display: flex;
        align-items: center;
        gap: var(--space-md);
        z-index: 1;
      }

      /* ===== Responsive ===== */

      /* Large monitors (>1600px) - scale up clock area */
      @media (min-width: 1600px) {
        /* The roomier padding and gaps below need a roomier row, or the card
         would have to shrink the dial to pay for them. */
        .main-row {
          flex-basis: 640px;
        }
        .timer-card-inner {
          gap: var(--space-xl);
          padding: var(--space-2xl, 48px);
        }
        .fullscreen-clock {
          --clock-size: clamp(300px, 55vmin, 600px);
          width: var(--clock-size);
          height: var(--clock-size);
        }
      }

      /* Tablet (<=1024px) - stack timeline below */
      @media (max-width: 1024px) {
        .main-row {
          grid-template-columns: 1fr;
          grid-template-rows: 1fr auto;
          /* The timeline stacks under the clock here and takes a slice of the row
           with it, so the row keeps enough height for both — otherwise the card
           is squeezed to the point where the dial has nothing left to give. */
          flex-basis: 680px;
        }
        .timeline-panel {
          max-height: 180px;
        }
        .progress-card {
          flex-wrap: wrap;
          gap: 12px;
          justify-content: center;
        }
        .progress-divider {
          display: none;
        }
        .insights-grid {
          grid-template-columns: 1fr;
        }
      }

      /* Mobile (<=640px) - compact everything */
      @media (max-width: 640px) {
        .page-header {
          margin-bottom: var(--space-sm);
        }
        .page-title {
          font-size: 20px;
        }
        /* The padding stays at its full size even here: the dial draws a glow that
         reaches 30px past itself, and the card clips at its padding edge. */
        .timer-card-inner {
          gap: var(--space-md);
        }
        .timer-controls {
          gap: var(--space-sm);
        }
        .btn-lg {
          padding: 10px 18px;
          font-size: 13px;
        }
        .card-actions {
          top: 8px;
          right: 8px;
        }
        /* These two used to shrink to 28px here, which is a cursor-sized target
         in the corner of the card a thumb reaches worst. A finger covers about
         a 44px square, so that is what they grow to — and the corner they take
         that from is empty, because the dial is a circle drawn inside a wider
         box. */
        .action-btn {
          width: 44px;
          height: 44px;
        }
        /* The size is written here rather than left to the 16px that the phone
         layout in styles.css gives every select: this rule carries the
         component's encapsulation attribute, so it outranks that global one,
         and the 11px that used to sit here is below the size at which iOS
         Safari zooms the whole page in the moment the picker takes focus — a
         zoom the user then has to undo by hand. The height is the usual floor
         for a thumb. */
        .task-selector select {
          min-width: 140px;
          min-height: 44px;
          font-size: var(--text-xl);
        }
        .progress-card {
          padding: 12px 16px;
        }
        .progress-icon {
          width: 28px;
          height: 28px;
          border-radius: 8px;
        }
        .progress-icon svg {
          width: 13px;
          height: 13px;
        }
        .progress-value {
          font-size: 14px;
        }
        .progress-label {
          font-size: 10px;
        }
        .fullscreen-clock {
          --clock-size: clamp(160px, 45vmin, 280px);
          width: var(--clock-size);
          height: var(--clock-size);
        }
        .fullscreen-controls {
          flex-wrap: wrap;
          justify-content: center;
        }
        .quick-actions {
          align-items: flex-start;
          flex-direction: column;
        }
        .quick-action-list {
          width: 100%;
        }
        .quick-action {
          flex: 1;
        }
      }

      /* Phone (<=640px): the size of the things a thumb lands on.

       A second block at the same width as the one above rather than more
       declarations inside it, because it answers a different question. That
       block is about the shape of the page — what stacks, what shrinks — while
       every rule here is a floor under a control: a cursor is a single pixel
       wide and a finger is not, so the 27-38px controls that were comfortable
       under a cursor are a coin toss under a thumb. Nothing here touches the
       clock card's own rules: its height still comes from the row, and a dial
       that does not fit shrinks instead of pushing the card past it. */
      @media (max-width: 640px) {
        .btn,
        .exit-fullscreen-btn,
        .insight-action,
        .quick-action {
          min-height: 44px;
        }
        /* The two icon-only controls beside the clock are square, so their width
         is as much of the target as their height is. */
        .btn-ghost {
          min-width: 44px;
        }
        /* The insight and quick actions are a short label with no icon, so the
         height they were just given would otherwise collect above the text
         instead of around it. */
        .insight-action,
        .quick-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 14px;
        }
        /* Three timer controls on one line need more width than the card has
         inside its padding at 320px, and the card clips rather than scrolls —
         an over-wide row would simply lose its last button. Wrapping turns that
         into a second line, and the row is given the card's full width so the
         wrapped line has something to centre against. */
        .timer-controls {
          width: 100%;
          flex-wrap: wrap;
          justify-content: center;
        }
        /* The primary action is the widest label in the card and the one control
         without which no session starts, so it is the last thing that should be
         squeezed: it takes a line of its own, and the two icon controls share
         the one below it with a full 44px each. */
        .timer-controls .btn-lg {
          flex: 1 1 100%;
        }
        /* The quick actions share a single row, which at 320px is 85px each:
         narrower than the thumb aiming at it, and too narrow for "Resume
         timer" to stay on one line, so every label wraps onto two. A 120px
         floor wraps the row into a pair and a full-width third instead. */
        .quick-action {
          min-width: 120px;
        }
        /* The dial was capped at 35vmin back when the card's height came from
         the window and that cap was how the face was stopped from swallowing
         the card. A phone hands the card a fixed 680px row instead, so what
         runs out first is the card's own width — and 35vmin of a 320px screen
         left a 112px face floating in a half-empty card. The vmin term stays as
         a ceiling for a short window; on a phone it is the card's width, and
         the height the task row and the controls leave behind, that decide the
         size of the face. */
        .timer-card-inner app-animated-clock {
          max-height: min(260px, 60vmin);
        }
      }

      /* ===== Very large screens =====

       The shell caps its own column at 2200px (see the large-screen block in
       app.css), and on a 3840px television that leaves a 2104px band for this
       page. That is the right width for a board and the wrong width for the
       dashboard: the clock card alone would be about 1400px around a 340px dial,
       the insight cards would be 1000px each for two lines of text, and the
       Desktop Behaviour panel would sit against the left edge of the band with
       900px of nothing beside it. So this page stops using the whole column as
       its layout unit and lays itself out inside a band of its own.

       2560px is where a real screen is past the point the column was built for,
       not the 1920px the 1600px block already covers: a 1920px window is a
       laptop, and it keeps the layout it was designed around, untouched. Every
       rule below is therefore above the width any existing block was written
       for, and the 1600px, 1024px and 640px blocks are left exactly as they
       were. */
      @media (min-width: 2560px) {
        /* The band the whole page is read in. Narrower than the 2104px the shell
         lets through by roughly a third, so the margin down each side is part of
         the shape instead of something the content has to fill.

         A max-width on the wrapper and not on each section: the dashboard is
         one stack — a row, then cards, then the quick actions — and capping the
         wrapper is the only version of this that cannot leave one section
         centred while the one above it still reaches for the window edge. The
         two rules under it are the two places where that shape alone is still
         not enough. */
        .dashboard-wrapper {
          max-width: 1440px;
          margin-inline: auto;
        }

        /* The clock card is the one panel asked to hold a fixed-size object: the
         dial inside it is capped by its own rule and does not grow, so 1440px of
         card around it is mostly empty glass. Fixing the clock's track at 900px
         and letting the timeline take what is left is what stops the row
         stretching the card and stranding the dial; the 440px column it leaves
         is the same shape the timeline has at 1400px, not a panel disowned by
         the grid. */
        .main-row {
          max-width: 1360px;
          margin-inline: auto;
          grid-template-columns: minmax(0, 900px) minmax(0, 440px);
          justify-content: center;
        }

        /* The switches are a short list with no figure to fill a card, so at this
         width the 560px cap they already carry reads as a column that forgot to
         centre. The band centres it. */
        .dashboard-prefs {
          margin-inline: auto;
        }

        /* The fullscreen face is the one thing on the page with no neighbouring
         content to keep it in proportion: it is alone on a black screen, and the
         600px cap it inherits from the 1600px block is a dial read from three
         metres away. The clamp keeps its floor, so a short window is unchanged,
         and only the ceiling moves. */
        .fullscreen-clock {
          --clock-size: clamp(420px, 40vmin, 720px);
          width: var(--clock-size);
          height: var(--clock-size);
        }

        /* Type at this width is read from the far side of a room, and the sizes
         below are the ones a viewer is actually reading: the page's own name and
         the figures in the progress row. Neither can be reached by the ladder
         the rest of the app moves onto at this width (styles.css), because both
         are literal pixel sizes written here that no token feeds. */
        .page-title {
          font-size: 30px;
        }
        .page-subtitle {
          font-size: 16px;
        }
        .progress-value {
          font-size: 22px;
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

  @ViewChild(ConfettiComponent) confetti!: ConfettiComponent;

  readonly todaySessions = signal<PomodoroSession[]>([]);
  readonly isFullscreen = signal(false);
  readonly selectedTaskId = signal<string>('');

  private readonly taskSelectModel = signal<TaskSelectFormModel>(createTaskSelectFormDefaults());
  readonly taskSelectForm = form(this.taskSelectModel);

  readonly selectedTaskQuadrant = computed(() => {
    const id = this.selectedTaskId();
    if (!id) return '';
    const task = this.taskService.todayTasks().find((t) => t.id === id);
    return task?.quadrant ?? '';
  });
  readonly taskGroups = computed(() => {
    const tasks = this.taskService.todayTasks();
    const order = (Object.keys(QUADRANT_CONFIG) as TaskQuadrant[]).map((q) => ({
      quadrant: q,
      label: `${QUADRANT_CONFIG[q].emoji} ${QUADRANT_CONFIG[q].label}`,
    }));
    // Show only the highest-priority quadrant that still has open tasks
    for (const g of order) {
      const groupTasks = tasks.filter((t) => t.quadrant === g.quadrant);
      if (groupTasks.length > 0) {
        return [{ ...g, tasks: groupTasks }];
      }
    }
    return [];
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
  readonly dailyGoalMessage = computed(() => {
    const remaining = Math.max(0, this.dailyGoalTarget - this.completedWorkSessions());
    return remaining === 0
      ? 'Daily focus goal achieved. Great work.'
      : `${remaining} more focus session${remaining === 1 ? '' : 's'} to reach today's goal.`;
  });
  readonly activeTask = computed<Task | null>(() => {
    const selectedTaskId = this.selectedTaskId();
    return this.taskService.todayTasks().find((task) => task.id === selectedTaskId) ?? null;
  });
  readonly openTodayTasks = computed(() => this.taskService.todayTasks().length);
  /** The local day the page's counters belong to; rolled by the day watcher. */
  private readonly todayKey = signal(localDayKey(new Date()));
  readonly completedTodayTasks = computed(() => {
    const today = this.todayKey();
    return this.taskService
      .tasks()
      .filter((task) => task.completedAt && localDayKey(new Date(task.completedAt)) === today).length;
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
        this.confettiTimeout = setTimeout(() => this.confetti?.fire(), 300);
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
    const nextTask = this.taskService
      .todayTasks()
      .find((task) => task.id !== this.selectedTaskId());
    if (nextTask) this.selectTask(nextTask.id);
  }

  clearFocusedTask(): void {
    this.selectTask('');
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

  quadrantLabel(quadrant: string | null): string {
    if (!quadrant) return '○';
    return QUADRANT_CONFIG[quadrant as TaskQuadrant]?.emoji ?? '○';
  }

  quadrantFullLabel(quadrant: string | null): string {
    if (!quadrant) return 'Unassigned';
    return QUADRANT_CONFIG[quadrant as TaskQuadrant]?.fullLabel ?? 'Unassigned';
  }

  private formatDuration(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
  }

  toggleFullscreen(): void {
    this.isFullscreen.update((v) => !v);
  }

  async toggleMiniMode(): Promise<void> {
    if (this.ui.isMiniMode()) {
      await this.ui.exitMiniMode();
    } else {
      await this.ui.enterMiniMode();
    }
  }

  /**
   * Esc belongs to the fullscreen overlay here; leaving the widget is handled by
   * the app shell, because the OS minimise button can shrink the window from any
   * page — not only from this one.
   */
  onEscape(): void {
    if (this.isFullscreen()) this.isFullscreen.set(false);
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
  }
}
