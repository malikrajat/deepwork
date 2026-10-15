import {
  Component,
  input,
  computed,
  signal,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { PomodoroSession } from '../../../core/models/session.model';
import { TooltipDirective } from '../../directives/tooltip.directive';
import { TaskService } from '../../../core/services/task.service';
import { TimerService } from '../../../core/services/timer.service';
import {
  HOUR_HEIGHT_PX,
  MIN_LABEL_HEIGHT_PX,
  TOTAL_HOURS,
  TimelineBlock,
  buildActiveBlock,
  buildSessionBlocks,
  timeToPixel,
} from '../../../core/utils/timeline.util';

/** How often the clock the timeline is drawn against is re-read. */
const UPDATE_INTERVAL_MS = 1000;

@Component({
  selector: 'app-timeline-bar',
  imports: [TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="timeline-container" #timelineScroll>
      <div class="timeline-canvas" [style.height.px]="canvasHeight">
        <!-- Hour gridlines -->
        @for (hour of hours; track hour) {
          <div
            class="hour-marker"
            [style.top.px]="hour * hourHeight"
            [class.is-current]="hour === currentHour()"
            [class.is-past]="hour < currentHour()"
          >
            <span class="hour-text">{{ formatHourLabel(hour) }}</span>
            <div class="hour-line"></div>
          </div>
        }

        <!-- Session blocks (completed) -->
        @for (block of sessionBlocks(); track block.id) {
          <div
            class="session-block"
            [class.type-work]="block.type === 'work'"
            [class.type-short-break]="block.type === 'short-break'"
            [class.type-long-break]="block.type === 'long-break'"
            [style.top.px]="block.topPx"
            [style.height.px]="block.heightPx"
            [appTooltip]="block.tooltip"
          >
            @if (block.heightPx >= minLabelHeightPx) {
              <span class="block-label">{{ block.taskName }}</span>
              <span class="block-time">{{ block.timeLabel }}</span>
            }
          </div>
        }

        <!-- Active session block (live) -->
        @if (activeBlock(); as ab) {
          <!-- The booked span, behind the elapsed bar -->
          @if (ab.plannedHeightPx; as plannedHeight) {
            <div
              class="session-block planned-span"
              [style.top.px]="ab.topPx"
              [style.height.px]="plannedHeight"
            ></div>
          }
          <div
            class="session-block is-active"
            [class.type-work]="ab.type === 'work'"
            [class.type-short-break]="ab.type === 'short-break'"
            [class.type-long-break]="ab.type === 'long-break'"
            [style.top.px]="ab.topPx"
            [style.height.px]="ab.heightPx"
            [appTooltip]="ab.tooltip"
          >
            @if (ab.heightPx >= minLabelHeightPx) {
              <span class="block-label">{{ ab.taskName }}</span>
              <span class="block-time">{{ ab.timeLabel }}</span>
            }
          </div>
        }

        <!-- Current time indicator -->
        <div class="now-marker" [style.top.px]="nowOffsetPx()"></div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow: hidden;
      }

      .timeline-container {
        position: relative;
        height: 100%;
        overflow-y: auto;
        overflow-x: hidden;
        scrollbar-width: thin;
        scrollbar-color: rgba(139, 92, 246, 0.25) transparent;
      }
      .timeline-container::-webkit-scrollbar {
        width: 4px;
      }
      .timeline-container::-webkit-scrollbar-track {
        background: transparent;
      }
      .timeline-container::-webkit-scrollbar-thumb {
        background: rgba(139, 92, 246, 0.25);
        border-radius: 4px;
      }

      .timeline-canvas {
        position: relative;
        min-height: 100%;
      }

      /* Hour markers */
      .hour-marker {
        position: absolute;
        left: 0;
        right: 0;
        display: flex;
        align-items: flex-start;
        pointer-events: none;
      }
      .hour-text {
        width: 36px;
        flex-shrink: 0;
        font-size: 10px;
        font-family: var(--font-mono);
        color: var(--color-text-muted);
        text-align: right;
        padding-right: 6px;
        line-height: 1;
        user-select: none;
      }
      .hour-marker.is-current .hour-text {
        color: var(--color-accent-primary);
        font-weight: 600;
      }
      .hour-marker.is-past .hour-text {
        color: var(--color-text-secondary);
      }
      .hour-line {
        flex: 1;
        height: 1px;
        background: var(--glass-border);
      }

      /* Session blocks */
      .session-block {
        position: absolute;
        left: 42px;
        right: 6px;
        border-radius: 0;
        padding: 2px 6px;
        display: flex;
        align-items: center;
        min-height: 4px;
        overflow: hidden;
        cursor: pointer;
        transition:
          transform 0.15s,
          box-shadow 0.15s;
        z-index: 1;
      }
      .session-block:hover {
        transform: scaleX(1.03);
        z-index: 3;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      }

      .session-block.type-work {
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(124, 58, 237, 0.18));
        border-left: 3px solid #8b5cf6;
        border-right: none;
        border-top: none;
        border-bottom: none;
      }
      .session-block.type-short-break {
        background: linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(6, 182, 212, 0.1));
        border-left: 3px solid #06b6d4;
        border-right: none;
        border-top: none;
        border-bottom: none;
      }
      .session-block.type-long-break {
        background: linear-gradient(135deg, rgba(52, 211, 153, 0.25), rgba(52, 211, 153, 0.1));
        border-left: 3px solid #34d399;
        border-right: none;
        border-top: none;
        border-bottom: none;
      }

      /* Active session pulsing */
      .session-block.is-active {
        z-index: 2;
        animation: glow-pulse 2s ease-in-out infinite;
      }
      .session-block.is-active.type-work {
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.5), rgba(124, 58, 237, 0.3));
        border-left: 3px solid var(--timer-work-color);
        border-right: none;
        border-top: none;
        border-bottom: none;
        box-shadow: none;
      }
      .session-block.is-active.type-short-break {
        background: linear-gradient(135deg, rgba(6, 182, 212, 0.4), rgba(6, 182, 212, 0.2));
        border-left: 3px solid var(--timer-break-color);
        border-right: none;
        border-top: none;
        border-bottom: none;
        box-shadow: none;
      }
      .session-block.is-active.type-long-break {
        background: linear-gradient(135deg, rgba(52, 211, 153, 0.4), rgba(52, 211, 153, 0.2));
        border-left: 3px solid var(--timer-long-break-color);
        border-right: none;
        border-top: none;
        border-bottom: none;
        box-shadow: none;
      }
      @keyframes glow-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.82;
        }
      }

      /* The time the running session is booked for, drawn behind the elapsed bar
       so "now" has somewhere to be inside of. Breaks never reach the timeline
       today (sessionBlocks skips them), so this stays the work colour. */
      .session-block.planned-span {
        background: rgba(139, 92, 246, 0.07);
        border-left: 3px solid rgba(139, 92, 246, 0.22);
        border-right: none;
        border-top: none;
        border-bottom: 1px solid rgba(139, 92, 246, 0.28);
        padding: 0;
        min-height: 0;
        z-index: 0;
        pointer-events: none;
        animation: none;
      }

      /* The title steps back so the session's times can step forward: at equal
       strength on a 25px block, the range read as an afterthought. */
      .block-label {
        flex: 1 1 auto;
        min-width: 0;
        font-size: 10px;
        font-weight: 500;
        color: var(--color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.2;
        pointer-events: none;
      }

      /* The times, on the card rather than only in the tooltip. Mono with tabular
       figures so a column of blocks lines up and the range does not shuffle
       sideways as the minutes tick over. */
      .block-time {
        flex: 0 0 auto;
        margin-left: 6px;
        padding-left: 6px;
        border-left: 1px solid var(--glass-border);
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--color-text-primary);
        line-height: 1.2;
        white-space: nowrap;
        pointer-events: none;
      }

      /* Now marker. It was in the DOM and hidden, which left the card times with
       nothing to be read against; the dot sits at the edge of the hour gutter
       where the blocks begin. */
      .now-marker {
        position: absolute;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(
          90deg,
          var(--color-accent-primary) 0%,
          rgba(139, 92, 246, 0.45) 55%,
          rgba(139, 92, 246, 0.12) 100%
        );
        z-index: 4;
        pointer-events: none;
      }
      .now-marker::before {
        content: '';
        position: absolute;
        left: 36px;
        top: -2px;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--color-accent-primary);
        box-shadow: 0 0 6px var(--color-accent-glow);
      }

      /* ===== Phone layout =====

       The day is one tall scroll region, so it is told where its own edges are:
       a flick that reaches midnight must not carry on into the card behind it.
       The 36px hour gutter and the 42px the session blocks start at are also a
       fifth of what a 320px column leaves for the blocks themselves, so both give
       back a few pixels — the labels are four characters wide at most. */
      @media (max-width: 640px) {
        .timeline-container {
          overscroll-behavior-y: contain;
          -webkit-overflow-scrolling: touch;
        }
        .hour-text {
          width: 32px;
        }
        .session-block {
          left: 36px;
        }
        .now-marker::before {
          left: 32px;
        }
      }
    `,
  ],
})
export class TimelineBarComponent implements OnInit, OnDestroy, AfterViewInit {
  // Inputs from parent
  sessions = input<PomodoroSession[]>([]);
  activeRunning = input<boolean>(false);
  activeType = input<string>('work');
  activeStartedAt = input<string | null>(null);
  activeElapsedSec = input<number>(0);

  @ViewChild('timelineScroll') private readonly scrollEl!: ElementRef<HTMLElement>;

  private readonly taskService = inject(TaskService);
  private readonly timerService = inject(TimerService);
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  // Constants
  readonly hourHeight = HOUR_HEIGHT_PX;
  readonly canvasHeight = TOTAL_HOURS * HOUR_HEIGHT_PX;
  readonly hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i);
  readonly minLabelHeightPx = MIN_LABEL_HEIGHT_PX;

  // Reactive clock signals (updated every second)
  readonly tick = signal(Date.now());
  readonly currentHour = computed(() => new Date(this.tick()).getHours());
  readonly nowOffsetPx = computed(() => timeToPixel(new Date(this.tick())));

  /** The day's finished sessions, as blocks. */
  readonly sessionBlocks = computed((): TimelineBlock[] => {
    // Read the clock so the blocks are recomputed as the day moves on.
    this.tick();
    return buildSessionBlocks(this.sessions(), this.taskService.tasks());
  });

  /**
   * The session running right now. It grows every second as the timer ticks,
   * and is drawn inside the span it was booked for.
   */
  readonly activeBlock = computed((): TimelineBlock | null => {
    if (!this.activeRunning()) return null;

    return buildActiveBlock(
      {
        type: this.activeType(),
        startedAt: this.activeStartedAt(),
        elapsedSec: this.activeElapsedSec(),
        plannedSec: this.timerService.totalDuration(),
        taskId: this.timerService.currentTaskId(),
      },
      this.taskService.tasks(),
      new Date(this.tick()),
    );
  });

  ngOnInit(): void {
    this.tickTimer = setInterval(() => {
      this.tick.set(Date.now());
    }, UPDATE_INTERVAL_MS);
  }

  ngAfterViewInit(): void {
    this.scrollToCurrentTime();
  }

  ngOnDestroy(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  formatHourLabel(hour: number): string {
    const h = hour % 12 || 12;
    const suffix = hour < 12 ? 'a' : 'p';
    return `${h}${suffix}`;
  }

  /** Scroll the timeline so the current time is visible in the upper third */
  private scrollToCurrentTime(): void {
    const el = this.scrollEl?.nativeElement;
    if (!el) return;
    const offset = this.nowOffsetPx();
    const viewH = el.clientHeight;
    el.scrollTop = Math.max(0, offset - viewH / 3);
  }
}
