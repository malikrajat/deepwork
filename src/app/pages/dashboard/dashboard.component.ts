import { Component, inject, OnInit, OnDestroy, computed, signal, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { AnimatedClockComponent } from '../../shared/components/animated-clock/animated-clock.component';
import { TimelineBarComponent } from '../../shared/components/timeline-bar/timeline-bar.component';
import { ConfettiComponent } from '../../shared/components/confetti/confetti.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { TimerService } from '../../core/services/timer.service';
import { NotificationService } from '../../core/services/notification.service';
import { DbService } from '../../core/services/db.service';
import { TaskService } from '../../core/services/task.service';
import { SettingsService } from '../../core/services/settings.service';
import { UiService } from '../../core/services/ui.service';
import { PomodoroSession } from '../../core/models/session.model';
import { Task, TaskQuadrant } from '../../core/models/task.model';
import { QUADRANT_CONFIG } from '../../core/constants/theme.constants';
import { TaskSelectFormModel, createTaskSelectFormDefaults } from '../../shared/models/form.models';

@Component({
  selector: 'app-dashboard',
  imports: [AnimatedClockComponent, TimelineBarComponent, ConfettiComponent, TooltipDirective, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:mousemove)': 'onDrag($event)',
    '(window:mouseup)': 'onDragEnd()',
    '(window:keydown.escape)': 'onEscape()'
  },
  template: `
    <!-- Fullscreen overlay -->
    @if (isFullscreen()) {
      <div class="fullscreen-overlay">
        <div class="fullscreen-ambient"></div>
        <button class="exit-fullscreen-btn" (click)="toggleFullscreen()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/>
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              Pause
            </button>
          } @else {
            <button class="btn btn-primary btn-lg" (click)="startTimer()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
              {{ timer.remainingSeconds() < timer.totalDuration() ? 'Resume' : (timer.timerType() === 'work' ? 'Start Focus' : 'Start Break') }}
            </button>
          }
          <button class="btn btn-ghost" (click)="stopTimer()" [disabled]="!timer.isRunning() && timer.remainingSeconds() === timer.totalDuration()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
          </button>
          <button class="btn btn-ghost" (click)="skipTimer()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5"/></svg>
          </button>
        </div>
        <div class="fullscreen-session-dots">
          @for (i of sessionDots(); track i) {
            <span class="dot" [class.filled]="i <= cyclePosition()"></span>
          }
        </div>
      </div>
    }

    <!-- Floating mini-clock (browser only) -->
    @if (ui.isMiniMode() && !ui.isTauriEnv) {
      <div class="mini-clock-float"
        [style.left.px]="miniPos.x"
        [style.top.px]="miniPos.y"
        (mousedown)="startDrag($event)"
      >
        <span class="mini-time">{{ timer.displayTime() }}</span>
        <button class="mini-expand" (click)="toggleMiniMode()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/></svg>
        </button>
      </div>
    }

    <!-- Tauri mini-clock: fills the entire shrunken always-on-top native window -->
    @if (ui.isMiniMode() && ui.isTauriEnv) {
      <div class="tauri-mini-window" (mousedown)="startTauriDrag($event)">
        <span class="mini-time">{{ timer.displayTime() }}</span>
        <button class="mini-restore-btn" (click)="toggleMiniMode()" title="Restore" (mousedown)="$event.stopPropagation()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/></svg>
        </button>
      </div>
    }

    <!-- Main dashboard -->
    <div class="dashboard-wrapper" [class.hidden]="isFullscreen() || (ui.isMiniMode() && ui.isTauriEnv)">
      <div class="page-header animate-fade-in">
        <div class="header-content">
          <h1 class="gradient-text page-title">Dashboard</h1>
          <p class="page-subtitle">Focus. Track. Achieve.</p>
        </div>
      </div>

      <!-- Main row: Clock (80%) | Timeline (20%) -->
      <div class="main-row animate-fade-in-delay-1">
        <div class="timer-card">
          <div class="timer-card-inner">
            <div class="timer-ambient"></div>
            <!-- Action buttons top-right -->
            <div class="card-actions">
              <button class="action-btn" title="Minimize to floating clock" (click)="toggleMiniMode()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <button class="action-btn" title="Fullscreen" (click)="toggleFullscreen()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
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
                <select [formField]="taskSelectForm.taskId" (change)="onTaskSelect()">
                  <option value="">No task linked</option>
                  @for (group of taskGroups(); track group.quadrant) {
                    <optgroup [label]="group.label">
                      @for (task of group.tasks; track task.id) {
                        <option [value]="task.id">{{ task.title }}</option>
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                  Pause
                </button>
              } @else {
                <button class="btn btn-primary btn-lg" (click)="startTimer()">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                  {{ timer.remainingSeconds() < timer.totalDuration() ? 'Resume' : (timer.timerType() === 'work' ? 'Start Focus' : 'Start Break') }}
                </button>
              }
              <button class="btn btn-ghost" (click)="stopTimer()" [disabled]="!timer.isRunning() && timer.remainingSeconds() === timer.totalDuration()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
              </button>
              <button class="btn btn-ghost" (click)="skipTimer()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5"/></svg>
              </button>
            </div>
            <div class="session-indicator">
              <span class="session-label">Session {{ cyclePosition() }}/{{ sessionsBeforeLongBreak() }}</span>
              @for (i of sessionDots(); track i) {
                <span class="dot" [class.filled]="i <= cyclePosition()"></span>
              }
            </div>
          </div>
        </div>

        <!-- Vertical Timeline -->
        <div class="timeline-panel">
          <div class="timeline-panel-inner">
            <div class="panel-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
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
        <article class="insight-card goal-card">
          <div class="insight-header">
            <div>
              <span class="eyebrow">Daily focus goal</span>
              <h2>{{ completedWorkSessions() }} of {{ dailyGoalTarget }} sessions</h2>
            </div>
            <span class="goal-percent">{{ dailyGoalPercentage() }}%</span>
          </div>
          <div class="goal-track" role="progressbar" [attr.aria-valuenow]="dailyGoalPercentage()" aria-valuemin="0" aria-valuemax="100">
            <span [style.width.%]="dailyGoalPercentage()"></span>
          </div>
          <p>{{ dailyGoalMessage() }}</p>
        </article>

        <article class="insight-card cycle-card">
          <div class="insight-header">
            <div>
              <span class="eyebrow">Session cycle</span>
              <h2>{{ cyclePosition() }}/{{ sessionsBeforeLongBreak() }} focus sessions</h2>
            </div>
            <span class="cycle-status" [class.break-ready]="timer.timerType() === 'long-break'">{{ timer.timerType() === 'long-break' ? 'Long break ready' : 'In progress' }}</span>
          </div>
          <div class="cycle-dots">
            @for (session of sessionDots(); track session) {
              <span [class.complete]="session <= cyclePosition()"></span>
            }
          </div>
          <p>{{ nextBreakMessage() }}</p>
        </article>

        <article class="insight-card task-card">
          <div class="insight-header">
            <div>
              <span class="eyebrow">Current focus</span>
              <h2>{{ activeTask()?.title ?? 'Choose a task to give this session context' }}</h2>
            </div>
            @if (activeTask()?.quadrant; as quadrant) {
              <span class="task-priority">{{ quadrantFullLabel(quadrant) }}</span>
            }
          </div>
          <p>{{ openTodayTasks() }} open task{{ openTodayTasks() === 1 ? '' : 's' }} today · {{ completedTodayTasks() }} completed</p>
          <div class="task-actions">
            <button class="insight-action" type="button" (click)="focusNextTask()" [disabled]="taskService.todayTasks().length === 0">
              Focus next task
            </button>
            <button class="insight-action secondary" type="button" (click)="clearFocusedTask()" [disabled]="!selectedTaskId()">
              Clear task
            </button>
          </div>
        </article>

        <article class="insight-card schedule-card">
          <div class="insight-header">
            <div>
              <span class="eyebrow">Today&apos;s schedule</span>
              <h2>{{ scheduleHeadline() }}</h2>
            </div>
          </div>
          <div class="schedule-stats">
            <span><strong>{{ completedWorkSessions() }}</strong> focus blocks</span>
            <span><strong>{{ completedBreakSessions() }}</strong> breaks</span>
            <span><strong>{{ averageFocusTimeDisplay() }}</strong> average focus</span>
          </div>
          <p>{{ nextBreakMessage() }}</p>
        </article>
      </section>

      <section class="quick-actions animate-fade-in-delay-2" aria-label="Quick actions">
        <span class="eyebrow">Quick actions</span>
        <div class="quick-action-list">
          <button class="quick-action primary" type="button" (click)="startTimer()" [disabled]="timer.isRunning()">
            {{ timer.remainingSeconds() < timer.totalDuration() ? 'Resume timer' : (timer.timerType() === 'work' ? 'Start focus' : 'Start break') }}
          </button>
          <button class="quick-action" type="button" (click)="skipTimer()">Skip {{ timer.timerType() === 'work' ? 'focus' : 'break' }}</button>
          <button class="quick-action" type="button" (click)="resetTimer()">Reset cycle</button>
        </div>
      </section>

      <!-- Bottom row: Today's Progress -->
      <div class="progress-row animate-fade-in-delay-2">
        <div class="progress-card">
          <div class="progress-item" appTooltip="Completed focus sessions today. Interrupted sessions are not counted.">
            <div class="progress-icon sessions-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>
            </div>
            <div class="progress-info">
              <span class="progress-value">{{ completedWorkSessions() }}</span>
              <span class="progress-label">Sessions</span>
            </div>
          </div>
          <div class="progress-divider"></div>
          <div class="progress-item" appTooltip="Total time spent in focus sessions today.">
            <div class="progress-icon focus-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
            </div>
            <div class="progress-info">
              <span class="progress-value">{{ focusTimeDisplay() }}</span>
              <span class="progress-label">Focus Time</span>
            </div>
          </div>
          <div class="progress-divider"></div>
          <div class="progress-item" appTooltip="Your current focus-session streak for today. It resets at the start of a new day.">
            <div class="progress-icon streak-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/></svg>
            </div>
            <div class="progress-info">
              <span class="progress-value">{{ timer.sessionCount() }}</span>
              <span class="progress-label">Streak</span>
            </div>
          </div>
          <div class="progress-divider"></div>
          <div class="progress-item" appTooltip="Today's target is 8 completed focus sessions. This shows your progress toward it.">
            <div class="progress-icon goal-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            </div>
            <div class="progress-info">
              <span class="progress-value">{{ dailyGoalProgress() }}</span>
              <span class="progress-label">Daily Goal</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Confetti celebration -->
    <app-confetti [sessionsBeforeLongBreak]="sessionsBeforeLongBreak()" />
  `,
  styles: [`
    :host { display: block; min-height: 100%; position: relative; }

    /* ===== Main Layout ===== */
    .dashboard-wrapper { min-height: 100%; display: flex; flex-direction: column; padding-bottom: var(--space-xl); }
    .dashboard-wrapper.hidden { display: none; }
    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: var(--space-lg);
    }
    .page-title { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.5px; }
    .page-subtitle { color: var(--color-text-muted); margin-top: 2px; font-size: 0.8rem; }

    /* ===== Main Row: Clock 70% | Timeline 30% ===== */
    .main-row {
      flex: 1 0 520px;
      display: grid;
      grid-template-columns: 7fr 3fr;
      gap: var(--space-md);
      min-height: 0;
    }

    /* Timer Card */
    .timer-card { position: relative; border-radius: var(--glass-radius); overflow: hidden; }
    .timer-card-inner {
      position: relative; height: 100%;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: var(--space-lg); padding: var(--space-xl);
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(139, 92, 246, 0.08);
      border-radius: var(--glass-radius);
      overflow-y: auto;
    }
    .timer-card-inner app-animated-clock {
      --clock-size: clamp(180px, 35vmin, 340px);
      width: var(--clock-size);
      height: var(--clock-size);
      flex-shrink: 0;
    }
    .timer-ambient {
      position: absolute; inset: 0; border-radius: inherit;
      background: radial-gradient(circle at 50% 40%, rgba(139, 92, 246, 0.06) 0%, transparent 60%);
      pointer-events: none;
    }

    /* Card action buttons */
    .card-actions {
      position: absolute; top: 16px; right: 16px;
      display: flex; gap: 6px; z-index: 3;
    }
    .action-btn {
      width: 32px; height: 32px; border-radius: 8px;
      background: var(--glass-bg); border: 1px solid var(--glass-border);
      color: var(--color-text-muted); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s;
    }
    .action-btn:hover {
      background: rgba(139,92,246,0.1); border-color: rgba(139,92,246,0.3);
      color: var(--color-text-primary);
    }

    /* Timer controls */
    .timer-controls { display: flex; align-items: center; gap: var(--space-md); z-index: 1; }
    .session-indicator { display: flex; align-items: center; gap: 6px; z-index: 1; }
    .session-label {
      font-size: 0.65rem; color: var(--color-text-muted);
      font-family: var(--font-mono); margin-right: 4px;
    }
    .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--glass-bg); border: 1px solid var(--glass-border);
      transition: all 0.3s;
    }
    .dot.filled {
      background: var(--color-accent-primary); border-color: var(--color-accent-primary);
      box-shadow: 0 0 8px rgba(139, 92, 246, 0.5);
    }

    /* Task Selector */
    .task-selector {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      margin-bottom: 8px; z-index: 1;
    }
    .task-selector select {
      background: var(--control-bg); border: 1px solid rgba(139,92,246,0.15);
      border-radius: 8px; padding: 6px 12px; color: var(--color-text-primary);
      font-size: 0.75rem; outline: none; cursor: pointer; min-width: 180px;
      transition: border-color 0.2s;
    }
    .task-selector select:focus { border-color: rgba(139,92,246,0.4); }
    .task-selector select option { background: var(--color-bg-secondary); }
    .task-selector select optgroup {
      background: var(--color-bg-secondary); color: var(--color-text-muted);
      font-size: 0.65rem; font-weight: 700; letter-spacing: 0.03em;
    }
    .task-selector select optgroup option {
      font-weight: 400; color: var(--color-text-primary); padding-left: 8px;
    }
    .selected-task-name {
      font-size: 0.65rem; color: var(--timer-work-color); font-weight: 500;
    }
    .selected-task-quadrant {
      font-size: 0.6rem; font-weight: 600; padding: 2px 8px;
      border-radius: 8px; letter-spacing: 0.03em;
    }
    .selected-task-quadrant.urgent-important {
      background: var(--quadrant-q1-bg); color: var(--quadrant-q1-color); border: 1px solid var(--quadrant-q1-border);
    }
    .selected-task-quadrant.important {
      background: var(--quadrant-q2-bg); color: var(--quadrant-q2-color); border: 1px solid var(--quadrant-q2-border);
    }
    .selected-task-quadrant.urgent {
      background: var(--quadrant-q3-bg); color: var(--quadrant-q3-color); border: 1px solid var(--quadrant-q3-border);
    }
    .selected-task-quadrant.neither {
      background: var(--quadrant-q4-bg); color: var(--quadrant-q4-color); border: 1px solid var(--quadrant-q4-border);
    }

    /* Buttons */
    .btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 20px; border-radius: 12px; font-size: 0.85rem;
      font-weight: 600; cursor: pointer; border: none;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: var(--font-sans);
    }
    .btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .btn-lg { padding: 12px 28px; font-size: 0.9rem; }
    .btn-primary {
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%);
      color: white;
      box-shadow: 0 4px 20px rgba(139, 92, 246, 0.3), inset 0 1px 0 rgba(255,255,255,0.1);
    }
    .btn-primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(139, 92, 246, 0.5), inset 0 1px 0 rgba(255,255,255,0.15);
    }
    .btn-primary:active:not(:disabled) { transform: translateY(0); }
    .btn-secondary {
      background: rgba(139, 92, 246, 0.1);
      border: 1px solid rgba(139, 92, 246, 0.25);
      color: var(--color-text-primary);
    }
    .btn-secondary:hover:not(:disabled) { background: rgba(139, 92, 246, 0.15); border-color: rgba(139, 92, 246, 0.4); }
    .btn-ghost {
      background: var(--glass-bg); border: 1px solid var(--glass-border);
      color: var(--color-text-muted); padding: 10px; border-radius: 10px;
    }
    .btn-ghost:hover:not(:disabled) { color: var(--color-text-primary); background: var(--glass-bg-hover); }

    /* ===== Timeline Panel ===== */
    .timeline-panel { border-radius: var(--glass-radius); overflow: hidden; }
    .timeline-panel-inner {
      height: 100%; padding: var(--space-md);
      background: var(--glass-bg);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(139,92,246,0.06);
      border-radius: var(--glass-radius);
      display: flex; flex-direction: column;
      overflow: hidden;
    }
    .timeline-panel-inner app-timeline-bar {
      flex: 1;
      min-height: 0;
      display: block;
      overflow: hidden;
    }
    .panel-header {
      display: flex; align-items: center; gap: 6px;
      font-size: 0.7rem; text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--color-text-muted);
      margin-bottom: var(--space-sm); padding-bottom: 8px;
      border-bottom: 1px solid var(--glass-border);
      flex-shrink: 0;
    }
    .panel-header svg { opacity: 0.5; }

    /* ===== Bottom Progress Row ===== */
    .progress-row { margin-top: var(--space-md); flex-shrink: 0; }
    .progress-card {
      display: flex; align-items: center; justify-content: space-around;
      padding: 16px 24px;
      background: var(--glass-bg);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(139,92,246,0.06);
      border-radius: 16px;
    }
    .progress-item { display: flex; align-items: center; gap: 12px; }
    .progress-icon {
      width: 36px; height: 36px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
    }
    .sessions-icon { background: rgba(139,92,246,0.1); color: #8b5cf6; }
    .focus-icon { background: rgba(6,182,212,0.1); color: #06b6d4; }
    .streak-icon { background: rgba(251,191,36,0.1); color: #fbbf24; }
    .goal-icon { background: rgba(52,211,153,0.1); color: #34d399; }
    .progress-info { display: flex; flex-direction: column; }
    .progress-value { font-size: 1.1rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .progress-label { font-size: 0.65rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .progress-divider { width: 1px; height: 32px; background: var(--glass-border); }

    /* ===== Focus Insights ===== */
    .insights-grid {
      display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-md); margin-top: var(--space-md);
    }
    .insight-card, .quick-actions {
      padding: var(--space-md); background: var(--glass-bg); backdrop-filter: blur(16px);
      border: 1px solid rgba(139,92,246,0.10); border-radius: 16px;
    }
    .insight-header { display: flex; justify-content: space-between; gap: var(--space-md); align-items: flex-start; }
    .eyebrow {
      display: block; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--color-text-muted);
    }
    .insight-card h2 { margin: 4px 0 0; font-size: 0.9rem; line-height: 1.35; color: var(--color-text-primary); }
    .insight-card p { margin: var(--space-sm) 0 0; color: var(--color-text-secondary); font-size: 0.73rem; line-height: 1.45; }
    .goal-percent, .cycle-status, .task-priority {
      flex-shrink: 0; padding: 4px 7px; border-radius: 6px; font-size: 0.62rem; font-weight: 700;
      background: rgba(139,92,246,0.12); color: #a78bfa;
    }
    .cycle-status.break-ready { background: rgba(52,211,153,0.12); color: #34d399; }
    .task-priority { max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .goal-track { height: 6px; overflow: hidden; margin-top: var(--space-md); border-radius: 999px; background: rgba(255,255,255,0.08); }
    .goal-track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #8b5cf6, #06b6d4); transition: width 0.3s ease; }
    .cycle-dots { display: flex; gap: 6px; margin-top: var(--space-md); }
    .cycle-dots span { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,0.09); border: 1px solid var(--glass-border); }
    .cycle-dots span.complete { background: #8b5cf6; border-color: #8b5cf6; box-shadow: 0 0 8px rgba(139,92,246,0.5); }
    .task-actions, .quick-action-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: var(--space-md); }
    .insight-action, .quick-action {
      padding: 7px 10px; border: 1px solid rgba(139,92,246,0.22); border-radius: 8px;
      background: rgba(139,92,246,0.08); color: var(--color-text-primary); font: 600 0.7rem var(--font-sans); cursor: pointer;
    }
    .insight-action.secondary, .quick-action { background: transparent; color: var(--color-text-secondary); }
    .insight-action:hover:not(:disabled), .quick-action:hover:not(:disabled) { border-color: rgba(139,92,246,0.5); background: rgba(139,92,246,0.14); color: var(--color-text-primary); }
    .insight-action:disabled, .quick-action:disabled { opacity: 0.45; cursor: not-allowed; }
    .schedule-stats { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: var(--space-md); color: var(--color-text-muted); font-size: 0.68rem; }
    .schedule-stats strong { color: var(--color-text-primary); font-variant-numeric: tabular-nums; }
    .quick-actions { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); margin-top: var(--space-md); }
    .quick-action-list { margin-top: 0; }
    .quick-action.primary { background: linear-gradient(135deg, #8b5cf6, #6d28d9); border-color: transparent; color: white; }

    /* ===== Fullscreen Mode ===== */
    .fullscreen-overlay {
      position: fixed; inset: 0; z-index: 1000;
      background: var(--color-bg-primary);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: var(--space-xl);
    }
    .fullscreen-ambient {
      position: absolute; inset: 0;
      background:
        radial-gradient(ellipse 60% 40% at 50% 50%, rgba(139,92,246,0.08) 0%, transparent 60%),
        radial-gradient(circle 300px at 30% 70%, rgba(6,182,212,0.04) 0%, transparent 100%);
      pointer-events: none;
    }
    .exit-fullscreen-btn {
      position: absolute; top: 24px; right: 24px;
      display: flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 10px;
      background: var(--glass-bg); border: 1px solid var(--glass-border);
      color: var(--color-text-secondary); cursor: pointer; font-size: 0.8rem;
      font-family: var(--font-sans); transition: all 0.2s; z-index: 1;
    }
    .exit-fullscreen-btn:hover { background: var(--glass-bg-hover); color: var(--color-text-primary); }
    .fullscreen-clock {
      z-index: 1;
      --clock-size: clamp(220px, 50vmin, 500px);
      width: var(--clock-size);
      height: var(--clock-size);
    }
    .fullscreen-controls { display: flex; align-items: center; gap: var(--space-md); z-index: 1; }
    .fullscreen-session-dots { display: flex; gap: 8px; z-index: 1; }

    /* ===== Floating Mini Clock ===== */
    .mini-clock-float {
      position: fixed; z-index: 9999;
      display: flex; align-items: center; gap: 8px;
      padding: 8px 14px; border-radius: 12px;
      background: var(--surface-float); backdrop-filter: blur(20px);
      border: 1px solid rgba(139,92,246,0.25);
      box-shadow: var(--glass-shadow), 0 0 20px rgba(139,92,246,0.15);
      cursor: grab; user-select: none;
    }
    .mini-clock-float:active { cursor: grabbing; }
    .mini-time {
      font-family: var(--font-mono); font-size: 1rem;
      font-weight: 700; color: var(--color-text-primary);
      letter-spacing: -0.5px;
    }
    .mini-expand {
      width: 24px; height: 24px; border-radius: 6px;
      background: rgba(139,92,246,0.15); border: none;
      color: var(--color-text-secondary); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s;
    }
    .mini-expand:hover { background: rgba(139,92,246,0.3); color: var(--color-text-primary); }

    /* ===== Tauri Floating Mini Window ===== */
    .tauri-mini-window {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; align-items: center; gap: 8px;
      padding: 0 14px;
      background: rgba(15,11,31,0.95); backdrop-filter: blur(20px);
      border: 1px solid rgba(139,92,246,0.3);
      box-shadow: 0 4px 24px rgba(0,0,0,0.6), 0 0 16px rgba(139,92,246,0.2);
      cursor: grab; user-select: none;
    }
    .tauri-mini-window:active { cursor: grabbing; }
    .mini-restore-btn {
      width: 24px; height: 24px; border-radius: 6px;
      background: rgba(139,92,246,0.15); border: none;
      color: var(--color-text-secondary); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s; flex-shrink: 0; margin-left: auto;
    }
    .mini-restore-btn:hover { background: rgba(139,92,246,0.3); color: var(--color-text-primary); }

    /* ===== Responsive ===== */

    /* Large monitors (>1600px) - scale up clock area */
    @media (min-width: 1600px) {
      .timer-card-inner { gap: var(--space-xl); padding: var(--space-2xl, 48px); }
      .fullscreen-clock { --clock-size: clamp(300px, 55vmin, 600px); width: var(--clock-size); height: var(--clock-size); }
    }

    /* Tablet (<=1024px) - stack timeline below */
    @media (max-width: 1024px) {
      .main-row {
        grid-template-columns: 1fr;
        grid-template-rows: 1fr auto;
      }
      .timeline-panel { max-height: 180px; }
      .progress-card { flex-wrap: wrap; gap: 12px; justify-content: center; }
      .progress-divider { display: none; }
      .insights-grid { grid-template-columns: 1fr; }
    }

    /* Mobile (<=640px) - compact everything */
    @media (max-width: 640px) {
      .page-header { margin-bottom: var(--space-sm); }
      .page-title { font-size: 1.2rem; }
      .timer-card-inner { padding: var(--space-md); gap: var(--space-md); }
      .timer-controls { gap: var(--space-sm); }
      .btn-lg { padding: 10px 18px; font-size: 0.8rem; }
      .card-actions { top: 8px; right: 8px; }
      .action-btn { width: 28px; height: 28px; }
      .task-selector select { min-width: 140px; font-size: 0.7rem; }
      .progress-card { padding: 12px 16px; }
      .progress-icon { width: 28px; height: 28px; border-radius: 8px; }
      .progress-icon svg { width: 13px; height: 13px; }
      .progress-value { font-size: 0.9rem; }
      .progress-label { font-size: 0.6rem; }
      .fullscreen-clock { --clock-size: clamp(160px, 45vmin, 280px); width: var(--clock-size); height: var(--clock-size); }
      .fullscreen-controls { flex-wrap: wrap; justify-content: center; }
      .quick-actions { align-items: flex-start; flex-direction: column; }
      .quick-action-list { width: 100%; }
      .quick-action { flex: 1; }
    }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy {
  readonly timer = inject(TimerService);
  private readonly notifications = inject(NotificationService);
  private readonly db = inject(DbService);
  readonly taskService = inject(TaskService);
  private readonly settingsService = inject(SettingsService);
  readonly ui = inject(UiService);

  @ViewChild(ConfettiComponent) confetti!: ConfettiComponent;

  readonly todaySessions = signal<PomodoroSession[]>([]);
  readonly isFullscreen = signal(false);
  readonly selectedTaskId = signal<string>('');

  private readonly taskSelectModel = signal<TaskSelectFormModel>(createTaskSelectFormDefaults());
  readonly taskSelectForm = form(this.taskSelectModel);

  readonly selectedTaskName = computed(() => {
    const id = this.selectedTaskId();
    if (!id) return '';
    const task = this.taskService.todayTasks().find(t => t.id === id);
    return task?.title ?? '';
  });
  readonly selectedTaskQuadrant = computed(() => {
    const id = this.selectedTaskId();
    if (!id) return '';
    const task = this.taskService.todayTasks().find(t => t.id === id);
    return task?.quadrant ?? '';
  });
  readonly taskGroups = computed(() => {
    const tasks = this.taskService.todayTasks();
    const order = (Object.keys(QUADRANT_CONFIG) as TaskQuadrant[]).map(q => ({
      quadrant: q,
      label: `${QUADRANT_CONFIG[q].emoji} ${QUADRANT_CONFIG[q].label}`,
    }));
    // Show only the highest-priority quadrant that still has open tasks
    for (const g of order) {
      const groupTasks = tasks.filter(t => t.quadrant === g.quadrant);
      if (groupTasks.length > 0) {
        return [{ ...g, tasks: groupTasks }];
      }
    }
    return [];
  });
  miniPos = { x: 20, y: 20 };
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };
  private confettiTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly sessionsBeforeLongBreak = computed(
    () => this.settingsService.settings().sessionsBeforeLongBreak
  );
  readonly sessionDots = computed(() =>
    Array.from({ length: this.sessionsBeforeLongBreak() }, (_, i) => i + 1)
  );

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

  readonly completedWorkSessions = computed(() =>
    this.todaySessions().filter(s => s.type === 'work' && !s.interrupted).length
  );
  readonly completedBreakSessions = computed(() =>
    this.todaySessions().filter(s => s.type !== 'work' && !s.interrupted).length
  );

  readonly focusTimeDisplay = computed(() => {
    const totalSec = this.todaySessions()
      .filter(s => s.type === 'work')
      .reduce((sum, s) => sum + s.durationActual, 0);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  });

  readonly dailyGoalTarget = 8;
  readonly dailyGoalProgress = computed(() => `${this.completedWorkSessions()}/${this.dailyGoalTarget}`);
  readonly dailyGoalPercentage = computed(() =>
    Math.min(100, Math.round((this.completedWorkSessions() / this.dailyGoalTarget) * 100))
  );
  readonly dailyGoalMessage = computed(() => {
    const remaining = Math.max(0, this.dailyGoalTarget - this.completedWorkSessions());
    return remaining === 0
      ? 'Daily focus goal achieved. Great work.'
      : `${remaining} more focus session${remaining === 1 ? '' : 's'} to reach today's goal.`;
  });
  readonly activeTask = computed<Task | null>(() => {
    const selectedTaskId = this.selectedTaskId();
    return this.taskService.todayTasks().find(task => task.id === selectedTaskId) ?? null;
  });
  readonly openTodayTasks = computed(() => this.taskService.todayTasks().length);
  readonly completedTodayTasks = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return this.taskService.tasks().filter(task => task.completedAt?.startsWith(today)).length;
  });
  readonly averageFocusTimeDisplay = computed(() => {
    const focusSessions = this.todaySessions().filter(session => session.type === 'work' && !session.interrupted);
    if (!focusSessions.length) return '0m';
    const averageSeconds = focusSessions.reduce((total, session) => total + session.durationActual, 0) / focusSessions.length;
    return this.formatDuration(averageSeconds);
  });
  readonly nextBreakMessage = computed(() => {
    if (this.timer.timerType() === 'long-break') return 'Long break is ready. Recharge before beginning the next cycle.';
    if (this.timer.timerType() === 'short-break') return 'Short break is ready. Return refreshed for the next focus session.';
    const position = this.cyclePosition();
    const remaining = position === this.sessionsBeforeLongBreak()
      ? this.sessionsBeforeLongBreak()
      : this.sessionsBeforeLongBreak() - position;
    return `${remaining} more focus session${remaining === 1 ? '' : 's'} until your next long break.`;
  });
  readonly scheduleHeadline = computed(() => {
    const type = this.timer.timerType();
    if (this.timer.isRunning()) return `Current ${type === 'work' ? 'focus' : type.replace('-', ' ')} block is in progress`;
    return type === 'work' ? 'Ready for your next focus block' : `Next up: ${type.replace('-', ' ')}`;
  });

  ngOnInit(): void {
    this.initAsync();
  }

  private async initAsync(): Promise<void> {
    await this.timer.init();
    await this.notifications.init();
    await this.settingsService.loadSettings();
    await this.taskService.loadTasks();
    await this.taskService.dailyReset();
    await this.taskService.generateRecurringInstances();

    // Restore focused task from Today's view
    const focusId = localStorage.getItem('deepwork_focusTaskId');
    if (focusId) {
      this.selectedTaskId.set(focusId);
      this.taskSelectModel.update(m => ({ ...m, taskId: focusId }));
    }

    this.timer.onComplete((completedType) => {
      const nextType = this.timer.timerType();
      this.notifications.fireTimerComplete(completedType, nextType);
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
  }

  startTimer(): void {
    this.notifications.dismiss();
    this.timer.linkTask(this.selectedTaskId() || null);
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
    const nextTask = this.taskService.todayTasks().find(task => task.id !== this.selectedTaskId());
    if (nextTask) this.selectTask(nextTask.id);
  }

  clearFocusedTask(): void {
    this.selectTask('');
  }

  selectTask(taskId: string): void {
    this.selectedTaskId.set(taskId);
    this.taskSelectModel.update(m => ({ ...m, taskId }));
    localStorage.setItem('deepwork_focusTaskId', taskId);
    this.timer.linkTask(taskId || null);
  }

  onTaskSelect(): void {
    const taskId = this.taskSelectModel().taskId;
    this.selectedTaskId.set(taskId);
    localStorage.setItem('deepwork_focusTaskId', taskId);
    this.timer.linkTask(taskId || null);
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
    this.isFullscreen.update(v => !v);
  }

  async toggleMiniMode(): Promise<void> {
    if (this.ui.isMiniMode()) {
      await this.ui.exitMiniMode();
    } else {
      await this.ui.enterMiniMode();
    }
  }

  startDrag(event: MouseEvent): void {
    this.isDragging = true;
    this.dragOffset = {
      x: event.clientX - this.miniPos.x,
      y: event.clientY - this.miniPos.y,
    };
  }

  async startTauriDrag(event: MouseEvent): Promise<void> {
    // Only drag on left mouse button
    if (event.button !== 0) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().startDragging();
    } catch (e) {
      console.warn('Tauri startDragging failed', e);
    }
  }

  onDrag(event: MouseEvent): void {
    if (!this.isDragging) return;
    this.miniPos = {
      x: event.clientX - this.dragOffset.x,
      y: event.clientY - this.dragOffset.y,
    };
  }

  onDragEnd(): void {
    this.isDragging = false;
  }

  onEscape(): void {
    if (this.isFullscreen()) this.isFullscreen.set(false);
    else if (this.ui.isMiniMode()) void this.toggleMiniMode();
  }

  ngOnDestroy(): void {
    if (this.confettiTimeout) {
      clearTimeout(this.confettiTimeout);
      this.confettiTimeout = null;
    }
    this.timer.onComplete(null);
  }

  private async loadTodaySessions(): Promise<void> {
    const sessions = await this.db.getTodaySessions();
    this.todaySessions.set(sessions);
  }
}
