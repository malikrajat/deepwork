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

interface TimelineBlock {
  id: string;
  type: 'work' | 'short-break' | 'long-break';
  taskName: string;
  tooltip: string;
  topPx: number;
  heightPx: number;
  active: boolean;
}

const HOUR_HEIGHT_PX = 60;
const TOTAL_HOURS = 24;
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
            @if (block.heightPx >= 8) {
              <span class="block-label" [class.small-label]="block.heightPx < 18">{{ block.taskName }}</span>
            }
          </div>
        }

        <!-- Active session block (live) -->
        @if (activeBlock(); as ab) {
          <div
            class="session-block is-active"
            [class.type-work]="ab.type === 'work'"
            [class.type-short-break]="ab.type === 'short-break'"
            [class.type-long-break]="ab.type === 'long-break'"
            [style.top.px]="ab.topPx"
            [style.height.px]="ab.heightPx"
            [appTooltip]="ab.tooltip"
          >
            @if (ab.heightPx >= 8) {
              <span class="block-label" [class.small-label]="ab.heightPx < 18">{{ ab.taskName }}</span>
            }
          </div>
        }

        <!-- Current time indicator -->
        <div class="now-marker" [style.top.px]="nowOffsetPx()">
        </div>
      </div>
    </div>
  `,
  styles: [`
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
      scrollbar-color: rgba(139,92,246,0.25) transparent;
    }
    .timeline-container::-webkit-scrollbar { width: 4px; }
    .timeline-container::-webkit-scrollbar-track { background: transparent; }
    .timeline-container::-webkit-scrollbar-thumb {
      background: rgba(139,92,246,0.25);
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
      font-size: 0.55rem;
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
      background: rgba(255,255,255,0.04);
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
      transition: transform 0.15s, box-shadow 0.15s;
      z-index: 1;
    }
    .session-block:hover {
      transform: scaleX(1.03);
      z-index: 3;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    }

    .session-block.type-work {
      background: linear-gradient(135deg, rgba(139,92,246,0.3), rgba(124,58,237,0.18));
      border-left: 3px solid #8b5cf6;
      border-right: none;
      border-top: none;
      border-bottom: none;
    }
    .session-block.type-short-break {
      background: linear-gradient(135deg, rgba(6,182,212,0.25), rgba(6,182,212,0.1));
      border-left: 3px solid #06b6d4;
      border-right: none;
      border-top: none;
      border-bottom: none;
    }
    .session-block.type-long-break {
      background: linear-gradient(135deg, rgba(52,211,153,0.25), rgba(52,211,153,0.1));
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
      background: linear-gradient(135deg, rgba(139,92,246,0.5), rgba(124,58,237,0.3));
      border-left: 3px solid #a78bfa;
      border-right: none;
      border-top: none;
      border-bottom: none;
      box-shadow: none;
    }
    .session-block.is-active.type-short-break {
      background: linear-gradient(135deg, rgba(6,182,212,0.4), rgba(6,182,212,0.2));
      border-left: 3px solid #22d3ee;
      border-right: none;
      border-top: none;
      border-bottom: none;
      box-shadow: none;
    }
    .session-block.is-active.type-long-break {
      background: linear-gradient(135deg, rgba(52,211,153,0.4), rgba(52,211,153,0.2));
      border-left: 3px solid #6ee7b7;
      border-right: none;
      border-top: none;
      border-bottom: none;
      box-shadow: none;
    }
    @keyframes glow-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.82; }
    }

    .pulse-dot {
      display: none;
    }

    .block-label {
      font-size: 0.58rem;
      font-weight: 600;
      color: var(--color-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.2;
      pointer-events: none;
    }
    .block-label.small-label {
      font-size: 0.42rem;
      line-height: 1;
    }
    .block-label.small-label {
      font-size: 0.42rem;
      line-height: 1;
    }

    /* Now marker - hidden */
    .now-marker {
      display: none;
    }
  `],
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

  // Reactive clock signals (updated every second)
  readonly tick = signal(Date.now());
  readonly currentHour = computed(() => new Date(this.tick()).getHours());
  readonly nowOffsetPx = computed(() => {
    const now = new Date(this.tick());
    const fractionalHours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    return fractionalHours * HOUR_HEIGHT_PX;
  });
  readonly nowTimeLabel = computed(() => {
    const now = new Date(this.tick());
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  /**
   * Compute completed session blocks.
   * Each session is rendered as one or more blocks (spanning hour boundaries).
   * No merging — every session from the DB is displayed independently,
   * preserving task names even when the user switches tasks mid-flow.
   */
  readonly sessionBlocks = computed((): TimelineBlock[] => {
    // Trigger reactivity on tick so positions stay fresh if needed
    this.tick();
    const blocks: TimelineBlock[] = [];
    const allSessions = this.sessions();

    for (const session of allSessions) {
      // Only show work sessions on the timeline, skip breaks
      if (session.type !== 'work') continue;
      const start = new Date(session.startedAt);
      const durationSec = session.durationActual;
      if (durationSec <= 0) continue;

      const end = new Date(start.getTime() + durationSec * 1000);
      const task = session.taskId
        ? this.taskService.tasks().find(t => t.id === session.taskId)
        : null;
      const taskName = task?.title ?? this.labelForType(session.type);
      const timeStr = `${this.fmtTime(start)} – ${this.fmtTime(end)}`;
      const durationMin = Math.round(durationSec / 60);
      const tooltip = `${taskName}\n${timeStr} (${durationMin}m)`;

      const topPx = this.timeToPixel(start);
      const heightPx = Math.max(2, (durationSec / 3600) * HOUR_HEIGHT_PX);

      blocks.push({
        id: session.id,
        type: session.type,
        taskName,
        tooltip,
        topPx,
        heightPx,
        active: false,
      });
    }

    return blocks;
  });

  /**
   * Compute the actively-running session block (if any).
   * This grows live every second as the timer ticks.
   */
  readonly activeBlock = computed((): TimelineBlock | null => {
    if (!this.activeRunning() || !this.activeStartedAt()) return null;
    const elapsed = this.activeElapsedSec();
    if (elapsed <= 0) return null;

    const type = this.activeType() as TimelineBlock['type'];
    // Only show work sessions on timeline, skip breaks
    if (type !== 'work') return null;
    const start = new Date(this.activeStartedAt()!);
    const now = new Date(this.tick());

    const activeTaskId = this.timerService.currentTaskId();
    const task = activeTaskId
      ? this.taskService.tasks().find(t => t.id === activeTaskId)
      : null;
    const taskName = task?.title ?? `${this.labelForType(type)}...`;
    const timeStr = `${this.fmtTime(start)} – ${this.fmtTime(now)}`;
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const tooltip = `${taskName}\n${timeStr}\n${mins}m ${secs}s elapsed`;

    const topPx = this.timeToPixel(start);
    const heightPx = Math.max(4, (elapsed / 3600) * HOUR_HEIGHT_PX);

    return {
      id: 'active-session',
      type,
      taskName,
      tooltip,
      topPx,
      heightPx,
      active: true,
    };
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

  /** Convert a Date to a pixel offset from the top of the canvas */
  private timeToPixel(date: Date): number {
    const fractionalHours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    return fractionalHours * HOUR_HEIGHT_PX;
  }

  /** Format time for display */
  private fmtTime(d: Date): string {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /** Readable label for session type */
  private labelForType(type: string): string {
    if (type === 'work') return 'Focus';
    if (type === 'short-break') return 'Short Break';
    return 'Long Break';
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
