import { Injectable, inject, OnDestroy } from '@angular/core';
import { TimerService } from './timer.service';
import { NotificationService } from './notification.service';
import type { UnlistenFn } from '@tauri-apps/api/event';

/**
 * Bridges system-tray menu actions (emitted from the Rust layer) into the app:
 * - mute:true / mute:false -> toggles the reminder sound
 * - pause -> pauses the pomodoro timer
 * - pause:5/10/15/30 -> pauses the timer and auto-resumes after N minutes
 */
@Injectable({ providedIn: 'root' })
export class TrayMenuService implements OnDestroy {
  private readonly timer = inject(TimerService);
  private readonly notification = inject(NotificationService);

  private unlisten: UnlistenFn | null = null;
  private resumeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  async init(): Promise<void> {
    if (this.unlisten) return;
    try {
      const { listen } = await import('@tauri-apps/api/event');
      this.unlisten = await listen<string>('deepwork:tray', (event) => {
        this.handle(event.payload);
      });
    } catch {
      // Running outside Tauri (browser dev / tests) — tray events are unavailable.
    }
  }

  private handle(payload: string): void {
    switch (payload) {
      case 'mute:true':
        this.notification.muted.set(true);
        break;
      case 'mute:false':
        this.notification.muted.set(false);
        break;
      case 'pause':
        this.timer.pause();
        this.clearScheduledResume();
        break;
      default:
        if (payload.startsWith('pause:')) {
          const minutes = Number(payload.slice('pause:'.length));
          if (!Number.isFinite(minutes) || minutes <= 0) break;
          const wasRunning = this.timer.isRunning();
          this.timer.pause();
          if (wasRunning) {
            this.scheduleResume(minutes);
          }
        }
        break;
    }
  }

  private scheduleResume(minutes: number): void {
    this.clearScheduledResume();
    this.resumeTimeoutId = setTimeout(() => {
      this.resumeTimeoutId = null;
      this.timer.resume();
      this.notification.showToastMessage(
        'Timer resumed',
        `Pause over — back to ${this.timer.timerType() === 'work' ? 'focus' : 'break'}.`,
        this.timer.timerType()
      );
    }, minutes * 60_000);
  }

  private clearScheduledResume(): void {
    if (this.resumeTimeoutId) {
      clearTimeout(this.resumeTimeoutId);
      this.resumeTimeoutId = null;
    }
  }

  ngOnDestroy(): void {
    this.clearScheduledResume();
    this.unlisten?.();
  }
}
