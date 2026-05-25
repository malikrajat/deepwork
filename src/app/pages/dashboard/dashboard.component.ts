import { Component, inject, OnInit, computed } from '@angular/core';
import { AnimatedClockComponent } from '../../shared/components/animated-clock/animated-clock.component';
import { TimelineBarComponent } from '../../shared/components/timeline-bar/timeline-bar.component';
import { TimerService } from '../../core/services/timer.service';
import { NotificationService } from '../../core/services/notification.service';
import { DbService } from '../../core/services/db.service';
import { PomodoroSession } from '../../core/models/session.model';
import { signal } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [AnimatedClockComponent, TimelineBarComponent],
  template: `
    <div class="page-header">
      <h1 class="gradient-text">Dashboard</h1>
      <p class="text-secondary">Focus. Track. Achieve.</p>
    </div>
    <div class="dashboard-grid">
      <div class="glass timer-section">
        <app-animated-clock
          [displayTime]="timer.displayTime()"
          [progress]="timer.progress()"
          [timerType]="timer.timerType()"
        />
        <div class="timer-controls">
          @if (timer.isRunning()) {
            <button class="btn btn-secondary" (click)="timer.pause()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              Pause
            </button>
          } @else {
            <button class="btn btn-primary" (click)="startTimer()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
              {{ timer.remainingSeconds() < timer.totalDuration() ? 'Resume' : 'Start' }}
            </button>
          }
          <button class="btn btn-ghost" (click)="timer.stop()" [disabled]="!timer.isRunning() && timer.remainingSeconds() === timer.totalDuration()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
            Stop
          </button>
          <button class="btn btn-ghost" (click)="timer.skip()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"/></svg>
            Skip
          </button>
        </div>
      </div>

      <div class="glass stats-section">
        <h3>Today's Progress</h3>
        <div class="stat-row">
          <span class="stat-label">Sessions</span>
          <span class="stat-value">{{ completedWorkSessions() }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Focus Time</span>
          <span class="stat-value">{{ focusTimeDisplay() }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Current Streak</span>
          <span class="stat-value">{{ timer.sessionCount() }}</span>
        </div>
      </div>

      <div class="glass timeline-section">
        <h3>Timeline</h3>
        <app-timeline-bar [sessions]="todaySessions()" />
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .page-header { margin-bottom: var(--space-lg); }
    .page-header h1 { font-size: 1.75rem; font-weight: 700; }
    .page-header p { color: var(--color-text-secondary); margin-top: var(--space-xs); }
    .text-secondary { color: var(--color-text-secondary); }
    .dashboard-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: auto auto;
      gap: var(--space-lg);
    }
    .timer-section {
      grid-column: 1 / -1;
      padding: var(--space-2xl);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-lg);
    }
    .timer-controls {
      display: flex;
      align-items: center;
      gap: var(--space-md);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-sm) var(--space-lg);
      border-radius: var(--glass-radius-sm);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
    }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-primary {
      background: var(--color-accent-gradient);
      color: white;
    }
    .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(124, 58, 237, 0.4); }
    .btn-secondary {
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      color: var(--color-text-primary);
    }
    .btn-secondary:hover:not(:disabled) { background: rgba(255,255,255,0.08); }
    .btn-ghost {
      background: transparent;
      color: var(--color-text-secondary);
    }
    .btn-ghost:hover:not(:disabled) { color: var(--color-text-primary); background: rgba(255,255,255,0.05); }
    .stats-section, .timeline-section { padding: var(--space-lg); }
    .stats-section h3, .timeline-section h3 {
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-secondary);
      margin-bottom: var(--space-md);
    }
    .stat-row { display: flex; justify-content: space-between; padding: var(--space-sm) 0; border-bottom: 1px solid var(--glass-border); }
    .stat-label { color: var(--color-text-secondary); }
    .stat-value { font-weight: 600; }
  `]
})
export class DashboardComponent implements OnInit {
  readonly timer = inject(TimerService);
  private readonly notifications = inject(NotificationService);
  private readonly db = inject(DbService);

  readonly todaySessions = signal<PomodoroSession[]>([]);

  readonly completedWorkSessions = computed(() =>
    this.todaySessions().filter(s => s.type === 'work' && !s.interrupted).length
  );

  readonly focusTimeDisplay = computed(() => {
    const totalSec = this.todaySessions()
      .filter(s => s.type === 'work')
      .reduce((sum, s) => sum + s.durationActual, 0);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  });

  async ngOnInit(): Promise<void> {
    await this.timer.init();
    await this.notifications.init();

    this.timer.onComplete(() => {
      this.notifications.fireTimerComplete(this.timer.timerType());
      this.loadTodaySessions();
    });

    await this.loadTodaySessions();
  }

  startTimer(): void {
    this.notifications.dismiss();
    this.timer.start();
  }

  private async loadTodaySessions(): Promise<void> {
    const sessions = await this.db.getTodaySessions();
    this.todaySessions.set(sessions);
  }
}
