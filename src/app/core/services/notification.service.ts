import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import { TimerType } from '../models/session.model';
import { SettingsService } from './settings.service';

export interface ToastNotification {
  id: number;
  title: string;
  body: string;
  type: TimerType;
  visible: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private readonly settingsService = inject(SettingsService);

  private repeatWorker: Worker | null = null;
  private repeatFallbackId: ReturnType<typeof setInterval> | null = null;
  private toastTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private audioContext: AudioContext | null = null;
  private permissionGranted = false;
  private _initialized = false;
  private pendingRepeat: { title: string; body: string; type: TimerType } | null = null;

  /** Toast state — consumed by the toast component */
  readonly toast = signal<ToastNotification | null>(null);
  private toastCounter = 0;

  async init(): Promise<void> {
    if (this._initialized) return;
    this._initialized = true;
    try {
      const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
      this.permissionGranted = await isPermissionGranted();
      if (!this.permissionGranted) {
        const permission = await requestPermission();
        this.permissionGranted = permission === 'granted';
      }
    } catch {
      // Browser fallback - use Notification API
      if ('Notification' in globalThis && Notification.permission === 'default') {
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
    this.showToast(title, body, type);
    this.startRepeatLoop(title, body, type);
  }

  dismiss(): void {
    this.stopRepeatLoop();
    this.toast.set(null);
  }

  private showToast(title: string, body: string, type: TimerType): void {
    // Set null first to force Angular to destroy and re-create the element (re-triggers animation)
    this.toast.set(null);
    if (this.toastTimeoutId) {
      clearTimeout(this.toastTimeoutId);
    }
    this.toastTimeoutId = setTimeout(() => {
      this.toastCounter++;
      this.toast.set({ id: this.toastCounter, title, body, type, visible: true });
      this.toastTimeoutId = null;
    }, 50);
  }

  private async sendNotification(title: string, body: string): Promise<void> {
    try {
      const { sendNotification } = await import('@tauri-apps/plugin-notification');
      sendNotification({ title, body, sound: 'default' });
    } catch {
      // Browser fallback
      if (this.permissionGranted && 'Notification' in globalThis) {
        new Notification(title, { body, requireInteraction: true });
      }
    }
  }

  private playSound(): void {
    const sound = this.settingsService.settings().notificationSound;
    if (sound === 'none') return;

    try {
      this.audioContext ??= new AudioContext();
      const ctx = this.audioContext;

      switch (sound) {
        case 'chime':
          this.playChime(ctx);
          break;
        case 'ding':
          this.playDing(ctx);
          break;
        case 'bell':
        default:
          this.playBell(ctx);
          break;
      }
    } catch {
      // Audio not available
    }
  }

  private playBell(ctx: AudioContext): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(830, ctx.currentTime);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.5);
  }

  private playChime(ctx: AudioContext): void {
    const notes = [523, 659, 784]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.2);
      osc.type = 'triangle';
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.2);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.2 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.8);
      osc.start(ctx.currentTime + i * 0.2);
      osc.stop(ctx.currentTime + i * 0.2 + 0.8);
    });
  }

  private playDing(ctx: AudioContext): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.3);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  }

  private startRepeatLoop(title: string, body: string, type: TimerType): void {
    this.stopRepeatLoop();
    this.pendingRepeat = { title, body, type };
    const intervalMs = this.settingsService.settings().notificationRepeatInterval * 1000;

    // Use Web Worker for repeat timer — workers are NOT throttled when app is
    // minimized/background, so OS notifications fire reliably on Windows/Mac/Linux
    try {
      this.repeatWorker = new Worker(
        new URL('../workers/notification-repeat.worker', import.meta.url),
        { type: 'module' }
      );
      this.repeatWorker.onmessage = () => this.onRepeatTick();
      this.repeatWorker.postMessage({ command: 'start', intervalMs });
    } catch {
      // Fallback to setInterval if Worker fails (e.g. dev server)
      this.repeatFallbackId = setInterval(() => this.onRepeatTick(), intervalMs);
    }
  }

  private onRepeatTick(): void {
    if (!this.pendingRepeat) return;
    const { title, body, type } = this.pendingRepeat;
    this.sendNotification(title, body);
    this.playSound();
    this.showToast(title, body, type);
  }

  private stopRepeatLoop(): void {
    this.pendingRepeat = null;
    if (this.repeatWorker) {
      this.repeatWorker.postMessage({ command: 'stop' });
      this.repeatWorker.terminate();
      this.repeatWorker = null;
    }
    if (this.repeatFallbackId) {
      clearInterval(this.repeatFallbackId);
      this.repeatFallbackId = null;
    }
  }

  ngOnDestroy(): void {
    this.stopRepeatLoop();
    if (this.toastTimeoutId) {
      clearTimeout(this.toastTimeoutId);
      this.toastTimeoutId = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
