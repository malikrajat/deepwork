import { Injectable, inject, OnDestroy } from '@angular/core';
import { TimerService } from './timer.service';
import { NotificationService } from './notification.service';
import { DesktopPrefsService } from './desktop-prefs.service';
import type { UnlistenFn } from '@tauri-apps/api/event';

/**
 * Bridges system-tray menu actions (emitted from the Rust layer) into the app:
 * - mute:true / mute:false -> toggles the reminder sound
 * - pause -> pauses the pomodoro timer
 * - pause:5/10/15/30 -> pauses the timer and auto-resumes after N minutes
 * - autostart:on / autostart:off -> the tray changed the OS startup entry
 * - aot:on / aot:off -> the tray changed always-on-top
 *
 * The desktop-preference events arrive *after* Rust has already changed the real
 * OS/window state, so this only has to store the new preference to keep the
 * in-app switches in agreement with the tray's tick marks.
 */
@Injectable({ providedIn: 'root' })
export class TrayMenuService implements OnDestroy {
  private readonly timer = inject(TimerService);
  private readonly notification = inject(NotificationService);
  private readonly desktopPrefs = inject(DesktopPrefsService);

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
      case 'autostart:on':
        void this.desktopPrefs.adoptTrayChange('startWithSystem', true);
        break;
      case 'autostart:off':
        void this.desktopPrefs.adoptTrayChange('startWithSystem', false);
        break;
      case 'aot:on':
        void this.desktopPrefs.adoptTrayChange('alwaysOnTop', true);
        break;
      case 'aot:off':
        void this.desktopPrefs.adoptTrayChange('alwaysOnTop', false);
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
