import { Component, input, computed, signal, OnInit, OnDestroy } from '@angular/core';
import { PomodoroSession } from '../../../core/models/session.model';

@Component({
  selector: 'app-timeline-bar',
  standalone: true,
  template: `
    <div class="timeline-container">
      <div class="timeline-track">
        @for (block of sessionBlocks(); track block.id) {
          <div
            class="session-block"
            [class.work]="block.type === 'work'"
            [class.short-break]="block.type === 'short-break'"
            [class.long-break]="block.type === 'long-break'"
            [style.left.%]="block.leftPct"
            [style.width.%]="block.widthPct"
            [title]="block.tooltip"
          ></div>
        }
        <div class="now-marker" [style.left.%]="nowPosition()"></div>
      </div>
      <div class="timeline-labels">
        <span>6:00</span>
        <span>9:00</span>
        <span>12:00</span>
        <span>15:00</span>
        <span>18:00</span>
        <span>21:00</span>
        <span>0:00</span>
      </div>
    </div>
  `,
  styles: [`
    .timeline-container {
      width: 100%;
    }
    .timeline-track {
      position: relative;
      height: 32px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: var(--glass-radius-sm);
      overflow: hidden;
    }
    .session-block {
      position: absolute;
      top: 4px;
      bottom: 4px;
      border-radius: 4px;
      min-width: 2px;
      opacity: 0.85;
    }
    .session-block.work {
      background: var(--color-accent-gradient);
    }
    .session-block.short-break {
      background: var(--color-accent-secondary);
    }
    .session-block.long-break {
      background: var(--color-success);
    }
    .now-marker {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--color-text-primary);
      opacity: 0.7;
      transition: left 60s linear;
    }
    .timeline-labels {
      display: flex;
      justify-content: space-between;
      margin-top: var(--space-xs);
      font-size: 0.65rem;
      color: var(--color-text-muted);
    }
  `]
})
export class TimelineBarComponent implements OnInit, OnDestroy {
  sessions = input<PomodoroSession[]>([]);

  private readonly START_HOUR = 6;
  private readonly END_HOUR = 24;
  private readonly TOTAL_MINUTES = (this.END_HOUR - this.START_HOUR) * 60; // 1080 minutes

  nowPosition = signal(this.calcNowPosition());
  private nowInterval: ReturnType<typeof setInterval> | null = null;

  readonly sessionBlocks = computed(() => {
    return this.sessions().map(s => {
      const start = new Date(s.startedAt);
      const startMin = (start.getHours() - this.START_HOUR) * 60 + start.getMinutes();
      const duration = s.durationActual / 60; // convert seconds to minutes

      const leftPct = Math.max(0, (startMin / this.TOTAL_MINUTES) * 100);
      const widthPct = Math.min((duration / this.TOTAL_MINUTES) * 100, 100 - leftPct);

      return {
        id: s.id,
        type: s.type,
        leftPct,
        widthPct,
        tooltip: `${s.type} — ${Math.round(s.durationActual / 60)}min`,
      };
    });
  });

  ngOnInit(): void {
    this.nowInterval = setInterval(() => {
      this.nowPosition.set(this.calcNowPosition());
    }, 60000);
  }

  ngOnDestroy(): void {
    if (this.nowInterval) clearInterval(this.nowInterval);
  }

  private calcNowPosition(): number {
    const now = new Date();
    const mins = (now.getHours() - this.START_HOUR) * 60 + now.getMinutes();
    return Math.max(0, Math.min(100, (mins / this.TOTAL_MINUTES) * 100));
  }
}
