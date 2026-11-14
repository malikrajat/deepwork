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
 *
 * The face is now a ring first: the time sits in the middle where the eye lands,
 * and a small lit dot rides the head of the arc. The old needle crossed the
 * middle at an angle and left the numbers stranded at the bottom of the dial.
 */
@Component({
  selector: 'app-animated-clock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="clock-container"
      [class.running]="progress() > 0 && progress() < 1"
      role="timer"
      aria-live="off"
      [attr.aria-label]="ariaLabel()"
    >
      <svg class="clock-face" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="grad-work" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#8b5cf6" />
            <stop offset="50%" stop-color="#7c3aed" />
            <stop offset="100%" stop-color="#06b6d4" />
          </linearGradient>
          <linearGradient id="grad-break" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#06b6d4" />
            <stop offset="100%" stop-color="#34d399" />
          </linearGradient>
        </defs>

        <!-- Outer ring -->
        <circle
          cx="100"
          cy="100"
          r="96"
          fill="none"
          stroke="currentColor"
          stroke-opacity="0.1"
          stroke-width="1"
        />

        <!-- Background track -->
        <circle
          class="clock-track"
          cx="100"
          cy="100"
          r="86"
          fill="none"
          stroke="var(--clock-track)"
          stroke-width="9"
        />

        <!-- A faint full ring in the session's own gradient, so the dial has a
             colour even before the first second is elapsed. -->
        <circle
          class="clock-aura"
          cx="100"
          cy="100"
          r="86"
          fill="none"
          [attr.stroke]="arcColor()"
          stroke-width="9"
          stroke-linecap="round"
        />

        <!-- Halo: the elapsed arc drawn 22 units wide and faint, so the glow has
             the same hard edge as the arc instead of a blur filter's haze. -->
        @if (progress() > 0) {
          <circle
            class="arc-halo"
            cx="100"
            cy="100"
            r="86"
            fill="none"
            [attr.stroke]="arcColor()"
            stroke-width="22"
            stroke-linecap="round"
            [attr.stroke-dasharray]="circumference"
            [attr.stroke-dashoffset]="elapsedOffset()"
          />
        }

        <!-- Filled arc (elapsed time) -->
        <circle
          class="elapsed-arc"
          cx="100"
          cy="100"
          r="86"
          fill="none"
          [attr.stroke]="arcColor()"
          stroke-width="9"
          stroke-linecap="round"
          [attr.stroke-dasharray]="circumference"
          [attr.stroke-dashoffset]="elapsedOffset()"
        />

        <!-- Minute tick marks -->
        @for (tick of tickMarks; track tick) {
          <line
            [attr.x1]="100 + 74 * Math.cos((tick * Math.PI) / 30 - Math.PI / 2)"
            [attr.y1]="100 + 74 * Math.sin((tick * Math.PI) / 30 - Math.PI / 2)"
            [attr.x2]="
              100 + (tick % 5 === 0 ? 69 : 71) * Math.cos((tick * Math.PI) / 30 - Math.PI / 2)
            "
            [attr.y2]="
              100 + (tick % 5 === 0 ? 69 : 71) * Math.sin((tick * Math.PI) / 30 - Math.PI / 2)
            "
            [class]="tick % 5 === 0 ? 'tick-major' : 'tick-minor'"
            [attr.stroke-width]="tick % 5 === 0 ? '2' : '1'"
            stroke-linecap="round"
          />
        }

        <!-- The head of the arc, a small light travelling with the timer. -->
        @if (progress() > 0 && progress() < 1) {
          <circle
            class="arc-tip-glow"
            [attr.cx]="tip().x"
            [attr.cy]="tip().y"
            r="8"
            [attr.fill]="arcColor()"
          />
          <circle class="arc-tip" [attr.cx]="tip().x" [attr.cy]="tip().y" r="4.5" />
        }
      </svg>

      <!-- Digital time, centred in the ring -->
      <div class="digital-time" aria-hidden="true">
        <span class="time-value">{{ displayTime() }}</span>
        <span class="timer-label">{{ label() }}</span>
      </div>
    </div>
  `,
  styles: [
    `
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
        color: var(--color-text-primary);
      }
      .clock-container::before {
        content: '';
        position: absolute;
        inset: -26px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(139, 92, 246, 0.14) 0%, transparent 68%);
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
        overflow: visible;
      }
      .tick-major {
        stroke: currentColor;
        opacity: 0.3;
      }
      .tick-minor {
        stroke: currentColor;
        opacity: 0.12;
      }
      .clock-track {
        stroke: var(--clock-track);
      }
      .clock-aura {
        opacity: var(--clock-aura-opacity, 0.18);
      }
      .elapsed-arc {
        transform: rotate(-90deg);
        transform-origin: center;
        transition: stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .clock-container.running .elapsed-arc {
        filter: drop-shadow(0 0 6px var(--color-accent-glow));
      }
      /* Drains with the arc; the pair reads as one glowing stroke with two hard
       edges rather than a blurred one. */
      .arc-halo {
        opacity: 0.14;
        transform: rotate(-90deg);
        transform-origin: center;
        transition: stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .arc-tip-glow {
        opacity: 0.2;
      }
      .arc-tip {
        fill: var(--color-text-primary);
      }
      .digital-time {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        z-index: 2;
        pointer-events: none;
      }
      .time-value {
        font-family: var(--font-mono);
        font-size: clamp(30px, 6.2vmin, 46px);
        font-weight: 700;
        letter-spacing: -0.05em;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        /* Solid ink, not a clipped gradient: the timer is the one number the eye
           lands on first, and a mask-painted fill softens its edges. */
        color: var(--color-text-primary);
      }
      .timer-label {
        font-size: clamp(12px, 1.6vmin, 13px);
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: var(--color-text-muted);
        font-weight: 600;
        white-space: nowrap;
      }
      @keyframes glow-breathe {
        0%,
        100% {
          opacity: 0.45;
          transform: scale(1);
        }
        50% {
          opacity: 1;
          transform: scale(1.02);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .clock-container.running::before {
          animation: none;
          opacity: 0.6;
        }
        .elapsed-arc,
        .arc-halo {
          transition: none;
        }
      }
      @media (forced-colors: active) {
        .tick-major,
        .tick-minor {
          stroke: CanvasText;
        }
        .elapsed-arc,
        .arc-halo {
          stroke: Highlight;
          filter: none;
        }
        .arc-tip-glow,
        .arc-tip {
          fill: Highlight;
        }
        .time-value {
          background: none;
          color: CanvasText;
          -webkit-text-fill-color: CanvasText;
        }
      }
    `,
  ],
})
export class AnimatedClockComponent {
  displayTime = input.required<string>();
  progress = input<number>(0);
  timerType = input<TimerType>('work');

  readonly Math = Math;
  readonly tickMarks = Array.from({ length: 60 }, (_, i) => i);
  readonly circumference = 2 * Math.PI * 86;

  readonly arcColor = computed(() => {
    return TIMER_TYPE_CONFIG[this.timerType()].gradient;
  });

  /** Elapsed offset: fills clockwise as time passes */
  readonly elapsedOffset = computed(() => {
    return this.circumference * (1 - this.progress());
  });

  /** Where the head of the arc sits, in the 200×200 viewBox. */
  readonly tip = computed(() => {
    const angle = this.progress() * Math.PI * 2 - Math.PI / 2;
    return {
      x: 100 + 86 * Math.cos(angle),
      y: 100 + 86 * Math.sin(angle),
    };
  });

  readonly label = computed(() => {
    return TIMER_TYPE_CONFIG[this.timerType()].label;
  });

  /**
   * What a screen reader hears for the dial.
   *
   * The SVG and the digital face are decorative *to assistive technology*: this
   * one label says the same thing once. It changes with the clock, but `timer`
   * is not a live region, so a tick does not interrupt whatever else is being
   * read — the dashboard's status line is the thing that announces state.
   */
  readonly ariaLabel = computed(() => `${this.label()}: ${this.displayTime()}`);
}
