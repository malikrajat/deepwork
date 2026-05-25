import { Component } from '@angular/core';

@Component({
  selector: 'app-matrix',
  standalone: true,
  template: `
    <div class="page-header">
      <h1 class="gradient-text">Eisenhower Matrix</h1>
      <p class="text-secondary">Prioritize by urgency and importance</p>
    </div>
    <div class="matrix-grid">
      <div class="glass quadrant urgent-important"><h3>Urgent & Important</h3><p class="hint">Do first</p></div>
      <div class="glass quadrant important"><h3>Important, Not Urgent</h3><p class="hint">Schedule</p></div>
      <div class="glass quadrant urgent"><h3>Urgent, Not Important</h3><p class="hint">Delegate</p></div>
      <div class="glass quadrant neither"><h3>Neither</h3><p class="hint">Eliminate</p></div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .page-header { margin-bottom: var(--space-lg); }
    .page-header h1 { font-size: 1.75rem; font-weight: 700; }
    .page-header p, .text-secondary { color: var(--color-text-secondary); margin-top: var(--space-xs); }
    .matrix-grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: var(--space-md); height: calc(100vh - 180px); }
    .quadrant { padding: var(--space-lg); display: flex; flex-direction: column; }
    .quadrant h3 { font-size: 0.9rem; font-weight: 600; margin-bottom: var(--space-sm); }
    .hint { color: var(--color-text-muted); font-size: 0.75rem; }
    .urgent-important { border-left: 3px solid var(--color-danger); }
    .important { border-left: 3px solid var(--color-accent-primary); }
    .urgent { border-left: 3px solid var(--color-warning); }
    .neither { border-left: 3px solid var(--color-text-muted); }
  `]
})
export class MatrixComponent {}
