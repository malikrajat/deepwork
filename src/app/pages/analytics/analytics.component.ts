import { Component } from '@angular/core';

@Component({
  selector: 'app-analytics',
  standalone: true,
  template: `
    <div class="page-header">
      <h1 class="gradient-text">Analytics</h1>
      <p class="text-secondary">Your productivity insights</p>
    </div>
    <div class="glass content-placeholder">
      <p>Charts and analytics coming in Phase 4</p>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .page-header { margin-bottom: var(--space-lg); }
    .page-header h1 { font-size: 1.75rem; font-weight: 700; }
    .page-header p, .text-secondary { color: var(--color-text-secondary); margin-top: var(--space-xs); }
    .content-placeholder { padding: var(--space-2xl); text-align: center; color: var(--color-text-muted); }
  `]
})
export class AnalyticsComponent {}
