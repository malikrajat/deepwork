import { Component, input, computed } from '@angular/core';
import { TimerType } from '../../../core/models/session.model';

@Component({
  selector: 'app-animated-clock',
  standalone: true,
  template: `
    <div class="clock-container">
      <svg class="clock-ring" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="gradient-work" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#7c3aed"/>
            <stop offset="100%" stop-color="#3b82f6"/>
          </linearGradient>
        </defs>
        <!-- Background ring -->
        <circle
          cx="100" cy="100" r="90"
          fill="none"
          [attr.stroke]="ringBgColor()"
          stroke-width="6"
        />
        <!-- Progress ring -->
        <circle
          class="progress-ring"
          cx="100" cy="100" r="90"
          fill="none"
          [attr.stroke]="ringColor()"
          stroke-width="6"
          stroke-linecap="round"
          [attr.stroke-dasharray]="circumference"
          [attr.stroke-dashoffset]="dashOffset()"
          [class.pulse]="progress() >= 1"
        />
      </svg>
      <div class="clock-center">
        <span class="time-display">{{ displayTime() }}</span>
        <span class="timer-label">{{ label() }}</span>
      </div>
    </div>
  `,
  styles: [`
    .clock-container {
      position: relative;
      width: 260px;
      height: 260px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .clock-ring {
      position: absolute;
      inset: 0;
      transform: rotate(-90deg);
    }
    .progress-ring {
      transition: stroke-dashoffset 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .progress-ring.pulse {
      animation: pulse-ring 1.5s ease-in-out infinite;
    }
    .clock-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      z-index: 1;
    }
    .time-display {
      font-family: var(--font-mono);
      font-size: 3rem;
      font-weight: 700;
      color: var(--color-text-primary);
      letter-spacing: -1px;
    }
    .timer-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-secondary);
    }
    @keyframes pulse-ring {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `]
})
export class AnimatedClockComponent {
  displayTime = input.required<string>();
  progress = input<number>(0);
  timerType = input<TimerType>('work');

  readonly circumference = 2 * Math.PI * 90; // ~565.49

  readonly ringColor = computed(() => {
    switch (this.timerType()) {
      case 'work': return 'url(#gradient-work)';
      case 'short-break': return '#3b82f6';
      case 'long-break': return '#10b981';
    }
  });

  readonly ringBgColor = computed(() => 'rgba(255, 255, 255, 0.06)');

  readonly dashOffset = computed(() => {
    return this.circumference * (1 - this.progress());
  });

  readonly label = computed(() => {
    switch (this.timerType()) {
      case 'work': return 'Focus';
      case 'short-break': return 'Short Break';
      case 'long-break': return 'Long Break';
    }
  });
}
