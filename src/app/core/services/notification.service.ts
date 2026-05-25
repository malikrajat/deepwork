import { Injectable } from '@angular/core';
import { TimerType } from '../models/session.model';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private repeatIntervalId: ReturnType<typeof setInterval> | null = null;
  private audioContext: AudioContext | null = null;
  private permissionGranted = false;

  async init(): Promise<void> {
    try {
      const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
      this.permissionGranted = await isPermissionGranted();
      if (!this.permissionGranted) {
        const permission = await requestPermission();
        this.permissionGranted = permission === 'granted';
      }
    } catch {
      // Browser fallback - use Notification API
      if ('Notification' in window && Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        this.permissionGranted = result === 'granted';
      } else {
        this.permissionGranted = Notification.permission === 'granted';
      }
    }
  }

  async fireTimerComplete(type: TimerType): Promise<void> {
    const title = type === 'work' ? 'Focus session complete!' : 'Break is over!';
    const body = type === 'work'
      ? 'Great work! Time for a break.'
      : 'Ready to focus again?';

    await this.sendNotification(title, body);
    this.playSound();
    this.startRepeatLoop(title, body);
  }

  dismiss(): void {
    this.stopRepeatLoop();
  }

  private async sendNotification(title: string, body: string): Promise<void> {
    try {
      const { sendNotification } = await import('@tauri-apps/plugin-notification');
      sendNotification({ title, body });
    } catch {
      // Browser fallback
      if (this.permissionGranted && 'Notification' in window) {
        new Notification(title, { body });
      }
    }
  }

  private playSound(): void {
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }
      // Generate a simple bell tone
      const ctx = this.audioContext;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(830, ctx.currentTime);
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 1.5);
    } catch {
      // Audio not available
    }
  }

  private startRepeatLoop(title: string, body: string): void {
    this.stopRepeatLoop();
    this.repeatIntervalId = setInterval(() => {
      this.sendNotification(title, body);
      this.playSound();
    }, 60000);
  }

  private stopRepeatLoop(): void {
    if (this.repeatIntervalId) {
      clearInterval(this.repeatIntervalId);
      this.repeatIntervalId = null;
    }
  }
}
