import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { DbService } from '../../core/services/db.service';
import { PomodoroSession } from '../../core/models/session.model';
import { TaskService } from '../../core/services/task.service';

@Component({
  selector: 'app-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header animate-fade-in">
      <h1 class="gradient-text page-title">Analytics</h1>
      <p class="page-subtitle">Your productivity insights</p>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid animate-fade-in-delay-1">
      <div class="stat-card">
        <div class="stat-value">{{ totalFocusHours() }}</div>
        <div class="stat-label">Focus Hours (30d)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ totalSessions() }}</div>
        <div class="stat-label">Sessions (30d)</div>
      </div>
      <div class="stat-card streak">
        <div class="stat-value">{{ currentStreak() }}</div>
        <div class="stat-label">Day Streak</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ mostProductiveHour() }}</div>
        <div class="stat-label">Peak Hour</div>
      </div>
    </div>

    <!-- Daily Chart -->
    <div class="chart-card animate-fade-in-delay-1">
      <h3 class="chart-title">Daily Focus (Last 7 days)</h3>
      <div class="bar-chart">
        @for (day of dailyData(); track day.label) {
          <div class="bar-col">
            <div class="bar-value">{{ day.hours }}h</div>
            <div class="bar-fill" [style.height.%]="day.percent"></div>
            <div class="bar-label">{{ day.label }}</div>
          </div>
        }
      </div>
    </div>

    <!-- Weekly Trend -->
    <div class="chart-card animate-fade-in-delay-1">
      <h3 class="chart-title">Weekly Trend (Last 4 weeks)</h3>
      <div class="bar-chart">
        @for (week of weeklyData(); track week.label) {
          <div class="bar-col wide">
            <div class="bar-value">{{ week.hours }}h</div>
            <div class="bar-fill weekly" [style.height.%]="week.percent"></div>
            <div class="bar-label">{{ week.label }}</div>
          </div>
        }
      </div>
    </div>

    <!-- Session History -->
    <div class="chart-card animate-fade-in-delay-1">
      <h3 class="chart-title">Recent Sessions</h3>
      <div class="session-list">
        @for (s of recentSessions(); track s.id) {
          <div class="session-row">
            <div class="session-type" [class]="s.type">{{ s.type === 'work' ? '🎯' : '☕' }}</div>
            <div class="session-info">
              <span class="session-task">{{ s.taskName || 'No task' }}</span>
              <span class="session-time">{{ formatDuration(s.durationActual) }} · {{ formatTime(s.startedAt) }}</span>
            </div>
            @if (s.interrupted) {
              <span class="interrupted-badge">interrupted</span>
            }
          </div>
        }
        @if (recentSessions().length === 0) {
          <div class="empty-sessions">No sessions yet. Start a focus timer!</div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .page-header { margin-bottom: var(--space-xl); }
    .page-title { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
    .page-subtitle { color: var(--color-text-muted); margin-top: 4px; font-size: 0.85rem; }

    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: var(--space-xl); }
    .stat-card {
      padding: 16px; border-radius: 14px; text-align: center;
      background: var(--glass-bg); backdrop-filter: blur(12px);
      border: 1px solid rgba(139,92,246,0.1);
    }
    .stat-card.streak { border-color: rgba(251,191,36,0.2); }
    .stat-value { font-size: 1.5rem; font-weight: 800; background: linear-gradient(135deg, #8b5cf6, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .stat-card.streak .stat-value { background: linear-gradient(135deg, #fbbf24, #f59e0b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .stat-label { font-size: 0.7rem; color: var(--color-text-muted); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }

    .chart-card {
      padding: 20px; border-radius: 16px; margin-bottom: var(--space-lg);
      background: var(--glass-bg); backdrop-filter: blur(12px);
      border: 1px solid rgba(139,92,246,0.08);
    }
    .chart-title { font-size: 0.85rem; font-weight: 600; margin-bottom: 16px; color: var(--color-text-secondary); }

    .bar-chart { display: flex; align-items: flex-end; gap: 8px; height: 140px; padding-top: 20px; }
    .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
    .bar-col.wide { min-width: 60px; }
    .bar-value { font-size: 0.65rem; color: var(--color-text-muted); margin-bottom: 4px; }
    .bar-fill {
      width: 100%; max-width: 32px; border-radius: 6px 6px 0 0; min-height: 2px;
      background: linear-gradient(to top, rgba(139,92,246,0.4), rgba(6,182,212,0.4));
      border: 1px solid rgba(139,92,246,0.2); border-bottom: none;
      transition: height 0.5s ease;
    }
    .bar-fill.weekly { background: linear-gradient(to top, rgba(52,211,153,0.4), rgba(6,182,212,0.4)); border-color: rgba(52,211,153,0.2); }
    .bar-label { font-size: 0.65rem; color: var(--color-text-muted); margin-top: 6px; }

    .session-list { max-height: 300px; overflow-y: auto; }
    .session-row {
      display: flex; align-items: center; gap: 12px; padding: 10px 0;
      border-bottom: 1px solid var(--glass-border);
    }
    .session-row:last-child { border-bottom: none; }
    .session-type { font-size: 1.1rem; }
    .session-info { display: flex; flex-direction: column; flex: 1; }
    .session-task { font-size: 0.8rem; font-weight: 500; }
    .session-time { font-size: 0.7rem; color: var(--color-text-muted); margin-top: 2px; }
    .interrupted-badge { font-size: 0.6rem; padding: 2px 8px; border-radius: 10px; background: rgba(239,68,68,0.1); color: rgb(248,113,113); border: 1px solid rgba(239,68,68,0.2); }
    .empty-sessions { text-align: center; color: var(--color-text-muted); font-size: 0.85rem; padding: 24px 0; }

    @media (max-width: 600px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
    }
  `]
})
export class AnalyticsComponent implements OnInit {
  private readonly db = inject(DbService);
  private readonly taskService = inject(TaskService);

  sessions = signal<PomodoroSession[]>([]);

  totalFocusHours = computed(() => {
    const total = this.sessions()
      .filter(s => s.type === 'work')
      .reduce((sum, s) => sum + s.durationActual, 0);
    return (total / 3600).toFixed(1);
  });

  totalSessions = computed(() => this.sessions().filter(s => s.type === 'work').length);

  currentStreak = computed(() => {
    const workSessions = this.sessions().filter(s => s.type === 'work' && s.completedAt);
    const days = new Set(workSessions.map(s => s.startedAt.slice(0, 10)));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (days.has(key)) { streak++; } else if (i > 0) { break; }
    }
    return streak;
  });

  mostProductiveHour = computed(() => {
    const hours = new Array(24).fill(0);
    this.sessions().filter(s => s.type === 'work').forEach(s => {
      const h = new Date(s.startedAt).getHours();
      hours[h] += s.durationActual;
    });
    const maxIdx = hours.indexOf(Math.max(...hours));
    if (hours[maxIdx] === 0) return '--';
    return `${maxIdx.toString().padStart(2, '0')}:00`;
  });

  dailyData = computed(() => {
    const days: { label: string; hours: string; percent: number }[] = [];
    const today = new Date();
    const workSessions = this.sessions().filter(s => s.type === 'work');
    let maxSec = 1;
    const daySecs: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const sec = workSessions.filter(s => s.startedAt.startsWith(key)).reduce((sum, s) => sum + s.durationActual, 0);
      daySecs.push(sec);
      if (sec > maxSec) maxSec = sec;
    }
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - days.length));
      days.push({
        label: d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3),
        hours: (daySecs[days.length] / 3600).toFixed(1),
        percent: (daySecs[days.length] / maxSec) * 100,
      });
    }
    return days;
  });

  weeklyData = computed(() => {
    const weeks: { label: string; hours: string; percent: number }[] = [];
    const today = new Date();
    const workSessions = this.sessions().filter(s => s.type === 'work');
    let maxSec = 1;
    const weekSecs: number[] = [];
    for (let w = 3; w >= 0; w--) {
      const start = new Date(today);
      start.setDate(start.getDate() - (w + 1) * 7);
      const end = new Date(today);
      end.setDate(end.getDate() - w * 7);
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);
      const sec = workSessions.filter(s => s.startedAt.slice(0, 10) >= startStr && s.startedAt.slice(0, 10) < endStr)
        .reduce((sum, s) => sum + s.durationActual, 0);
      weekSecs.push(sec);
      if (sec > maxSec) maxSec = sec;
    }
    for (let w = 3; w >= 0; w--) {
      const idx = 3 - w;
      weeks.push({
        label: w === 0 ? 'This wk' : `${w}w ago`,
        hours: (weekSecs[idx] / 3600).toFixed(1),
        percent: (weekSecs[idx] / maxSec) * 100,
      });
    }
    return weeks;
  });

  recentSessions = computed(() => {
    const tasks = this.taskService.tasks();
    return this.sessions()
      .filter(s => s.type === 'work')
      .slice(0, 20)
      .map(s => ({
        ...s,
        taskName: s.taskId ? tasks.find(t => t.id === s.taskId)?.title ?? 'Unknown' : null,
      }));
  });

  ngOnInit(): void {
    this.initAsync();
  }

  private async initAsync(): Promise<void> {
    await this.db.init();
    await this.taskService.loadTasks();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sessions = await this.db.getSessionsSince(thirtyDaysAgo.toISOString().slice(0, 10));
    this.sessions.set(sessions);
  }

  formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  }

  formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
}
