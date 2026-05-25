import { Component } from '@angular/core';

@Component({
  selector: 'app-settings',
  standalone: true,
  template: `
    <div class="page-header">
      <h1 class="gradient-text">Settings</h1>
      <p class="text-secondary">Configure your experience</p>
    </div>
    <div class="glass content-placeholder">
      <p>Settings panel coming in Phase 5</p>
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
export class SettingsComponent {}
