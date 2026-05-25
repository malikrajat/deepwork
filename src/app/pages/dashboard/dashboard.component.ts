import { Component } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
    <div class="page-header">
      <h1 class="gradient-text">Dashboard</h1>
      <p class="text-secondary">Focus. Track. Achieve.</p>
    </div>
    <div class="dashboard-grid">
      <div class="glass timer-section">
        <div class="timer-placeholder">
          <span class="timer-display">25:00</span>
          <p>Timer coming in Phase 2</p>
        </div>
      </div>
      <div class="glass stats-section">
        <h3>Today's Progress</h3>
        <div class="stat-row">
          <span class="stat-label">Sessions</span>
          <span class="stat-value">0</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Focus Time</span>
          <span class="stat-value">0h 0m</span>
        </div>
      </div>
      <div class="glass timeline-section">
        <h3>Timeline</h3>
        <div class="timeline-bar">
          <div class="timeline-empty">No sessions yet today</div>
        </div>
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
      text-align: center;
    }
    .timer-placeholder { display: flex; flex-direction: column; align-items: center; gap: var(--space-md); }
    .timer-display {
      font-family: var(--font-mono);
      font-size: 4rem;
      font-weight: 700;
      background: var(--color-accent-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
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
    .timeline-bar { height: 40px; border-radius: var(--glass-radius-sm); background: rgba(255,255,255,0.03); display: flex; align-items: center; justify-content: center; }
    .timeline-empty { color: var(--color-text-muted); font-size: 0.8rem; }
  `]
})
export class DashboardComponent {}
