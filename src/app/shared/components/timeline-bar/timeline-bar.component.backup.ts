import { Component, input, computed, signal, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { PomodoroSession } from '../../../core/models/session.model';
import { TooltipDirective } from '../../directives/tooltip.directive';
import { TaskService } from '../../../core/services/task.service';
import { TimerService } from '../../../core/services/timer.service';

@Component({
  selector: 'app-timeline-bar',
  imports: [TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="calendar-timeline" #scrollContainer>
      <!-- Hour grid -->
      <div class="hour-grid">
        @for (hour of visibleHours(); track hour) {
          <div class="hour-row"
            [class.current-hour]="hour === currentHour()"
            [class.passed-hour]="hour < currentHour()"
          >
            <span class="hour-label">{{ formatHour(hour) }}</span>
            <div class="hour-track">
              <!-- Passed-time fill (granular within current hour) -->
              @if (hour === currentHour()) {
                <div class="passed-fill" [style.height.%]="currentMinutePct()"></div>
              }
              @if (hour < currentHour()) {
                <div class="passed-fill full"></div>
              }

              <!-- Completed sessions in this hour -->
              @for (block of getBlocksForHour(hour); track block.id) {
                <div class="session-bar"
                  [class.work]="block.type === 'work'"
                  [class.short-break]="block.type === 'short-break'"
                  [class.long-break]="block.type === 'long-break'"
                  [class.short-segment]="block.heightPct < 30"
                  [class.medium-segment]="block.heightPct >= 30 && block.heightPct < 50"
                  [style.top.%]="block.topPct"
                  [style.height.%]="block.heightPct"
                  [appTooltip]="block.tooltip"
                >
                  <span class="bar-label">{{ block.taskName }}</span>
                </div>
              }

              <!-- Active running session in this hour -->
              @for (aBlock of getActiveBlocksForHour(hour); track aBlock.id) {
                <div class="session-bar active-bar"
                  [class.work]="aBlock.type === 'work'"
                  [class.short-break]="aBlock.type === 'short-break'"
                  [class.long-break]="aBlock.type === 'long-break'"
                  [class.short-segment]="aBlock.heightPct < 30"
                  [class.medium-segment]="aBlock.heightPct >= 30 && aBlock.heightPct < 50"
                  [style.top.%]="aBlock.topPct"
                  [style.height.%]="aBlock.heightPct"
                  [appTooltip]="aBlock.tooltip"
                >
                  <span class="bar-label">{{ aBlock.taskName }}</span>
                  <span class="active-pulse"></span>
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Now indicator line -->
      <div class="now-indicator" [style.top.px]="nowOffsetPx()">
        <div class="now-dot"></div>
        <div class="now-line"></div>
        <span class="now-time">{{ currentTimeStr() }}</span>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }
    .calendar-timeline {
      position: relative;
      height: 100%;
      overflow-y: auto;
      padding-right: 4px;
    }
    .calendar-timeline::-webkit-scrollbar { width: 4px; }
    .calendar-timeline::-webkit-scrollbar-track { background: transparent; }
    .calendar-timeline::-webkit-scrollbar-thumb {
      background: rgba(139,92,246,0.2); border-radius: 4px;
    }
    .calendar-timeline::-webkit-scrollbar-thumb:hover {
      background: rgba(139,92,246,0.4);
    }
    .hour-grid {
      display: flex;
      flex-direction: column;
    }
    .hour-row {
      position: relative;
      display: flex;
      align-items: flex-start;
      height: 60px;
      min-height: 60px;
    }
    .hour-row.current-hour .hour-label {
      color: var(--color-accent-primary);
      font-weight: 600;
    }
    .hour-row.passed-hour .hour-label {
      color: var(--color-text-secondary);
    }
    .hour-label {
      width: 38px;
      flex-shrink: 0;
      font-size: 0.55rem;
      font-family: var(--font-mono);
      color: var(--color-text-muted);
      padding-top: 0;
      text-align: right;
      padding-right: 6px;
      line-height: 1;
    }
    .hour-track {
      flex: 1;
      position: relative;
      height: 100%;
      border-top: 1px solid rgba(255,255,255,0.04);
    }

    /* Passed time fill - grows as minutes pass */
    .passed-fill {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      background: rgba(255,255,255,0.025);
      border-left: 2px solid rgba(255,255,255,0.06);
      pointer-events: none;
      z-index: 0;
    }
    .passed-fill.full {
      height: 100%;
    }

    /* Session bars */
    .session-bar {
      position: absolute;
      left: 4px;
      right: 4px;
      border-radius: 4px;
      padding: 2px 6px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 6px;
      overflow: hidden;
      transition: all 0.2s;
      cursor: pointer;
      z-index: 1;
    }
    .session-bar:hover {
      transform: scale(1.03);
      z-index: 3;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      overflow: visible;
    }
    .session-bar.work {
      background: linear-gradient(135deg, rgba(139,92,246,0.3) 0%, rgba(124,58,237,0.2) 100%);
      border-left: 3px solid #8b5cf6;
      box-shadow: 0 2px 8px rgba(139,92,246,0.15);
    }
    .session-bar.short-break {
      background: linear-gradient(135deg, rgba(6,182,212,0.25) 0%, rgba(6,182,212,0.12) 100%);
      border-left: 3px solid #06b6d4;
      box-shadow: 0 2px 8px rgba(6,182,212,0.1);
    }
    .session-bar.long-break {
      background: linear-gradient(135deg, rgba(52,211,153,0.25) 0%, rgba(52,211,153,0.12) 100%);
      border-left: 3px solid #34d399;
      box-shadow: 0 2px 8px rgba(52,211,153,0.1);
    }
    .bar-label {
      font-size: 0.6rem;
      font-weight: 600;
      color: var(--color-text-primary);
      white-space: nowrap;
      overflow: visible;
      text-overflow: ellipsis;
      line-height: 1.2;
      max-width: 100%;
      pointer-events: none;
    }

    /* For short segments, use smaller font to fit within the bar */
    .session-bar.short-segment {
      overflow: visible;
    }
    .session-bar.short-segment .bar-label {
      font-size: 0.45rem;
      line-height: 1;
    }

    /* Active running session - pulsing glow effect */
    .session-bar.active-bar {
      animation: active-glow 2s ease-in-out infinite;
      z-index: 2;
    }
    .session-bar.active-bar.work {
      background: linear-gradient(135deg, rgba(139,92,246,0.45) 0%, rgba(124,58,237,0.3) 100%);
      border-left: 3px solid #a78bfa;
      box-shadow: 0 2px 12px rgba(139,92,246,0.35);
    }
    .session-bar.active-bar.short-break {
      background: linear-gradient(135deg, rgba(6,182,212,0.4) 0%, rgba(6,182,212,0.25) 100%);
      border-left: 3px solid #22d3ee;
      box-shadow: 0 2px 12px rgba(6,182,212,0.3);
    }
    .session-bar.active-bar.long-break {
      background: linear-gradient(135deg, rgba(52,211,153,0.4) 0%, rgba(52,211,153,0.25) 100%);
      border-left: 3px solid #6ee7b7;
      box-shadow: 0 2px 12px rgba(52,211,153,0.3);
    }
    .active-pulse {
      position: absolute;
      top: 4px;
      right: 6px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #a78bfa;
      animation: blink 1s ease-in-out infinite;
    }
    @keyframes active-glow {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.85; }
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    /* Now indicator */
    .now-indicator {
      position: absolute;
      left: 38px;
      right: 0;
      display: flex;
      align-items: center;
      z-index: 5;
      pointer-events: none;
    }
    .now-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #f87171;
      box-shadow: 0 0 8px rgba(248,113,113,0.6);
      flex-shrink: 0;
      margin-left: -4px;
      animation: pulse-now 2s ease-in-out infinite;
    }
    .now-line {
      flex: 1;
      height: 1.5px;
      background: linear-gradient(to right, #f87171, rgba(248,113,113,0.1));
    }
    .now-time {
      font-size: 0.5rem;
      font-family: var(--font-mono);
      color: #f87171;
      font-weight: 600;
      margin-left: 4px;
      white-space: nowrap;
    }
    @keyframes pulse-now {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.3); opacity: 0.7; }
    }
  `]
})
export class TimelineBarComponent implements OnInit, OnDestroy, AfterViewInit {
  sessions = input<PomodoroSession[]>([]);
  activeRunning = input<boolean>(false);
  activeType = input<string>('work');
  activeStartedAt = input<string | null>(null);
  activeElapsedSec = input<number>(0);

  currentHour = signal(new Date().getHours());
  currentMinutePct = signal(this.calcMinutePct());
  currentTimeStr = signal(this.formatCurrentTime());
  nowOffsetPx = signal(this.calcNowOffset());
  private nowInterval: ReturnType<typeof setInterval> | null = null;

  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLElement>;

  private readonly taskService = inject(TaskService);
  private readonly timer = inject(TimerService);

  private readonly START_HOUR = 0;  // Full day from midnight
  private readonly END_HOUR = 23;
  private readonly HOUR_HEIGHT = 60;

  readonly visibleHours = computed(() => {
    const hours: number[] = [];
    for (let h = this.START_HOUR; h <= this.END_HOUR; h++) {
      hours.push(h);
    }
    return hours;
  });

  /** Pre-compute session blocks keyed by hour */
  private readonly blocksByHour = computed(() => {
    const map = new Map<number, Array<{
      id: string; type: string; taskName: string;
      timeRange: string; tooltip: string; topPct: number; heightPct: number;
    }>>();

    const mergedSessions = this.mergeSessions(this.sessions());

    for (const s of mergedSessions) {
      if (s.type !== 'work') continue;
      this.addSessionBlocks(map, s);
    }
    return map;
  });

  getBlocksForHour(hour: number) {
    return this.blocksByHour().get(hour) ?? [];
  }

  /** Computed signal: active session blocks by hour (updates every second) */
  private readonly activeBlockMap = computed(() => {
    const map = new Map<number, Array<{
      id: string; type: string; taskName: string;
      timeRange: string; tooltip: string; topPct: number; heightPct: number;
    }>>();

    if (!this.activeRunning() || !this.activeStartedAt()) return map;

    const type = this.activeType();
    if (type !== 'work') return map;

    const elapsedSec = this.activeElapsedSec();
    if (elapsedSec <= 0) return map;

    this.addActiveBlocks(map, type, elapsedSec);
    return map;
  });

  getActiveBlocksForHour(hour: number) {
    return this.activeBlockMap().get(hour) ?? [];
  }

  formatHour(hour: number): string {
    const h = hour % 12 || 12;
    const ampm = hour < 12 ? 'AM' : 'PM';
    return `${h}${ampm}`;
  }

  ngOnInit(): void {
    this.nowInterval = setInterval(() => {
      this.currentHour.set(new Date().getHours());
      this.currentMinutePct.set(this.calcMinutePct());
      this.currentTimeStr.set(this.formatCurrentTime());
      this.nowOffsetPx.set(this.calcNowOffset());
    }, 15000); // Update every 15s for smooth progression
  }

  ngAfterViewInit(): void {
    // Scroll immediately to current time (no delay)
    this.scrollToNow();
  }

  ngOnDestroy(): void {
    if (this.nowInterval) {
      clearInterval(this.nowInterval);
      this.nowInterval = null;
    }
  }

  /** Scroll the timeline so current time is visible */
  scrollToNow(): void {
    const container = this.scrollContainer?.nativeElement;
    if (!container) return;
    const currentOffset = this.calcNowOffset();
    const viewHeight = container.clientHeight;
    // Instant scroll on load (no animation)
    container.scrollTop = Math.max(0, currentOffset - viewHeight / 3);
  }

  private fmtTime(d: Date): string {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private resolveSessionLabel(type: string, taskId: string | null): string {
    if (type === 'work') return taskId ? 'Focus Session' : 'Free Focus';
    if (type === 'short-break') return 'Short Break';
    return 'Long Break';
  }

  private resolveActiveLabel(type: string): string {
    if (type === 'work') return 'Working...';
    if (type === 'short-break') return 'Break...';
    return 'Long Break...';
  }

  private mergeSessions(sessions: PomodoroSession[]): PomodoroSession[] {
    const sorted = [...sessions].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    const merged: PomodoroSession[] = [];
    for (const s of sorted) {
      if (merged.length === 0) { merged.push({ ...s }); continue; }
      const last = merged.at(-1)!;
      const lastEnd = last.completedAt ? new Date(last.completedAt).getTime() : null;
      const thisStart = s.startedAt ? new Date(s.startedAt).getTime() : null;
      const gap = lastEnd && thisStart ? thisStart - lastEnd : Infinity;
      if (last.taskId === s.taskId && last.type === s.type && !last.interrupted && !s.interrupted && gap <= 60000) {
        last.durationActual = (last.durationActual || 0) + (s.durationActual || 0);
        last.completedAt = s.completedAt || last.completedAt;
      } else {
        merged.push({ ...s });
      }
    }
    return merged;
  }

  private addSessionBlocks(map: Map<number, Array<any>>, s: PomodoroSession): void {
    const start = new Date(s.startedAt);
    const now = new Date();
    const startHour = start.getHours();
    const startMin = start.getMinutes();
    const maxDurationSec = Math.max(0, (now.getTime() - start.getTime()) / 1000);
    const cappedDuration = Math.min(s.durationActual, maxDurationSec);
    const durationMin = Math.max(1, Math.round(cappedDuration / 60));
    const task = s.taskId ? this.taskService.tasks().find(t => t.id === s.taskId) : null;
    const taskName = task?.title ?? this.resolveSessionLabel(s.type, s.taskId);
    const taskDetail = task?.description?.trim() ?? (s.taskId ? 'No details' : 'Unlinked session');
    const endTime = new Date(start.getTime() + cappedDuration * 1000);
    const timeRange = `${this.fmtTime(start)} – ${this.fmtTime(endTime)}`;
    const tooltip = `${taskName}\n${timeRange} (${durationMin}m)\n${taskDetail}`;

    let remainingMin = durationMin;
    let curHour = startHour;
    let curMin = startMin;
    while (remainingMin > 0 && curHour <= this.END_HOUR) {
      const minutesInThisHour = Math.min(remainingMin, 60 - curMin);
      const topPct = (curMin / 60) * 100;
      const heightPct = (minutesInThisHour / 60) * 100;
      if (!map.has(curHour)) map.set(curHour, []);
      map.get(curHour)!.push({
        id: s.id + '-' + curHour, type: s.type, taskName,
        timeRange: curHour === startHour ? timeRange : '', tooltip, topPct, heightPct,
      });
      remainingMin -= minutesInThisHour;
      curHour++;
      curMin = 0;
    }
  }

  private addActiveBlocks(map: Map<number, Array<any>>, type: string, elapsedSec: number): void {
    const start = new Date(this.activeStartedAt()!);
    const startHour = start.getHours();
    const startMin = start.getMinutes();
    const elapsedMin = elapsedSec / 60;
    const sessionEndMinTotal = startMin + elapsedMin;
    const sessionEndHour = startHour + Math.floor(sessionEndMinTotal / 60);
    const activeTaskId = this.timer.currentTaskId ? this.timer.currentTaskId() : null;
    const activeTask = activeTaskId ? this.taskService.tasks().find(t => t.id === activeTaskId) : null;
    const taskName = activeTask?.title ?? this.resolveActiveLabel(type);
    const now = new Date();
    const timeRange = `${this.fmtTime(start)} – ${this.fmtTime(now)}`;
    const mins = Math.floor(elapsedSec / 60);
    const secs = Math.floor(elapsedSec % 60);
    const detail = activeTask?.description?.trim() ?? (activeTaskId ? 'No details' : 'Unlinked session');
    const tooltip = `${taskName} | ${timeRange} | ${mins}m ${secs}s elapsed\n${detail}`;

    for (let h = startHour; h <= Math.min(sessionEndHour, this.END_HOUR); h++) {
      const minStart = h === startHour ? startMin : 0;
      const minEnd = h === sessionEndHour ? sessionEndMinTotal - (h - startHour) * 60 : 60;
      const topPct = (minStart / 60) * 100;
      const heightPct = ((minEnd - minStart) / 60) * 100;
      if (!map.has(h)) map.set(h, []);
      map.get(h)!.push({
        id: `active-${h}`, type, taskName,
        timeRange: h === startHour ? timeRange : '', tooltip, topPct, heightPct,
      });
    }
  }

  private formatCurrentTime(): string {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private calcMinutePct(): number {
    return (new Date().getMinutes() / 60) * 100;
  }

  private calcNowOffset(): number {
    const now = new Date();
    const hoursSinceStart = now.getHours() - this.START_HOUR + now.getMinutes() / 60;
    return Math.max(0, hoursSinceStart * this.HOUR_HEIGHT);
  }
}
