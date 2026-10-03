import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { TimerType } from '../../../core/models/session.model';
import { TIMER_TYPE_CONFIG } from '../../../core/constants/theme.constants';

/**
 * The clock face is drawn from strokes, not from blurred copies of itself.
 *
 * The arc and the needle used to carry `feGaussianBlur` filters: a 4-unit blur
 * on the arc and a 2-unit one on the needle. On screen that turned the most
 * colourful shape in the app into a soft, muddy ring with a haze around it, and
 * the filter's rectangular region could read as a faint box. A wide, faint
 * duplicate of the arc gives the same sense of glow while keeping hard edges.
 */
@Component({
  selector: 'app-animated-clock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="clock-container" [class.running]="progress() > 0 && progress() < 1">
      <svg class="clock-face" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="grad-work" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#8b5cf6"/>
            <stop offset="50%" stop-color="#7c3aed"/>
            <stop offset="100%" stop-color="#06b6d4"/>
          </linearGradient>
          <linearGradient id="grad-break" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#06b6d4"/>
            <stop offset="100%" stop-color="#34d399"/>
          </linearGradient>
        </defs>

        <!-- Outer ring -->
        <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(139,92,246,0.14)" stroke-width="1"/>

        <!-- Background track -->
        <circle cx="100" cy="100" r="88" fill="none" stroke="var(--clock-track)" stroke-width="8"/>

        <!-- Halo: the elapsed arc drawn 20 units wide and faint, so the glow has
             the same hard edge as the arc instead of a blur filter's haze. -->
        @if (progress() > 0) {
          <circle
            class="arc-halo"
            cx="100" cy="100" r="88"
            fill="none"
            [attr.stroke]="arcColor()"
            stroke-width="20"
            stroke-linecap="round"
            [attr.stroke-dasharray]="circumference"
            [attr.stroke-dashoffset]="elapsedOffset()"
          />
        }

        <!-- Filled arc (elapsed time) -->
        <circle
          class="elapsed-arc"
          cx="100" cy="100" r="88"
          fill="none"
          [attr.stroke]="arcColor()"
          stroke-width="8"
          stroke-linecap="round"
          [attr.stroke-dasharray]="circumference"
          [attr.stroke-dashoffset]="elapsedOffset()"
        />

        <!-- Minute tick marks -->
        @for (tick of tickMarks; track tick) {
          <line
            [attr.x1]="100 + 76 * Math.cos(tick * Math.PI / 30 - Math.PI / 2)"
            [attr.y1]="100 + 76 * Math.sin(tick * Math.PI / 30 - Math.PI / 2)"
            [attr.x2]="100 + (tick % 5 === 0 ? 72 : 74) * Math.cos(tick * Math.PI / 30 - Math.PI / 2)"
            [attr.y2]="100 + (tick % 5 === 0 ? 72 : 74) * Math.sin(tick * Math.PI / 30 - Math.PI / 2)"
            [class]="tick % 5 === 0 ? 'tick-major' : 'tick-minor'"
            [attr.stroke-width]="tick % 5 === 0 ? '2' : '1'"
            stroke-linecap="round"
          />
        }

        <!-- Needle (rotates based on elapsed progress) -->
        <g [attr.transform]="'rotate(' + needleAngle() + ' 100 100)'">
          <line x1="100" y1="100" x2="100" y2="28"
            [attr.stroke]="needleColor()"
            stroke-width="2"
            stroke-linecap="round"
          />
          <!-- Needle tip -->
          <circle cx="100" cy="30" r="3" [attr.fill]="needleColor()"/>
        </g>

        <!-- Center dot -->
        <circle cx="100" cy="100" r="5" fill="rgba(139,92,246,0.8)"/>
        <circle cx="100" cy="100" r="3" fill="var(--color-bg-primary)"/>
      </svg>

      <!-- Digital time overlay -->
      <div class="digital-time">
        <span class="time-value">{{ displayTime() }}</span>
        <span class="timer-label">{{ label() }}</span>
      </div>
    </div>
  `,
  styles: [`
    .clock-container {
      position: relative;
      width: 100%;
      height: 100%;
      max-width: var(--clock-size, clamp(180px, 40vmin, 360px));
      max-height: var(--clock-size, clamp(180px, 40vmin, 360px));
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .clock-container::before {
      content: '';
      position: absolute;
      inset: -30px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(139, 92, 246, 0.05) 0%, transparent 70%);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.5s;
    }
    .clock-container.running::before {
      opacity: 1;
      animation: glow-breathe 4s ease-in-out infinite;
    }
    .clock-face {
      position: absolute;
      inset: 0;
    }
    .tick-major {
      stroke: rgba(255, 255, 255, 0.25);
    }
    .tick-minor {
      stroke: rgba(255, 255, 255, 0.08);
    }
    .elapsed-arc {
      transform: rotate(-90deg);
      transform-origin: center;
      transition: stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1);
    }
    /* Drains with the arc; the pair reads as one glowing stroke with two hard
       edges rather than a blurred one. */
    .arc-halo {
      opacity: 0.16;
      transform: rotate(-90deg);
      transform-origin: center;
      transition: stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .digital-time {
      position: absolute;
      bottom: 16%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      z-index: 2;
    }
    .time-value {
      font-family: var(--font-mono);
      font-size: clamp(20px, 4vmin, 32px);
      font-weight: 700;
      color: var(--color-text-primary);
      letter-spacing: -1px;
      font-variant-numeric: tabular-nums;
    }
    .timer-label {
      font-size: clamp(10px, 1.5vmin, 12px);
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: var(--color-text-muted);
      font-weight: 500;
    }
    @keyframes glow-breathe {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.01); }
    }
  `]
})
export class AnimatedClockComponent {
  displayTime = input.required<string>();
  progress = input<number>(0);
  timerType = input<TimerType>('work');

  readonly Math = Math;
  readonly tickMarks = Array.from({ length: 60 }, (_, i) => i);
  readonly circumference = 2 * Math.PI * 88;

  readonly arcColor = computed(() => {
    return TIMER_TYPE_CONFIG[this.timerType()].gradient;
  });

  readonly needleColor = computed(() => {
    return TIMER_TYPE_CONFIG[this.timerType()].color;
  });

  /** Elapsed offset: fills clockwise as time passes */
  readonly elapsedOffset = computed(() => {
    return this.circumference * (1 - this.progress());
  });

  /** Needle rotates 360° over the full duration */
  readonly needleAngle = computed(() => {
    return this.progress() * 360;
  });

  readonly label = computed(() => {
    return TIMER_TYPE_CONFIG[this.timerType()].label;
  });
}
