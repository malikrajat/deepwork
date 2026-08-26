import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NotificationService } from '../../src/app/core/services/notification.service';
import { SettingsService } from '../../src/app/core/services/settings.service';
import { DEFAULT_SETTINGS } from '../../src/app/core/models/settings.model';

const makeMockSettings = () => ({
  settings: signal({ ...DEFAULT_SETTINGS }),
});

describe('NotificationService', () => {
  let svc: NotificationService;
  let mockSettings: ReturnType<typeof makeMockSettings>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSettings = makeMockSettings();
    TestBed.configureTestingModule({
      providers: [
        NotificationService,
        { provide: SettingsService, useValue: mockSettings },
      ],
    });
    svc = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('toast signal initializes as null', () => {
    expect(svc.toast()).toBeNull();
  });

  it('dismiss() clears the toast', () => {
    (svc as any).toast.set({
      id: 1,
      title: 'Done!',
      body: 'Take a break.',
      type: 'work',
      visible: true,
    });
    expect(svc.toast()).not.toBeNull();
    svc.dismiss();
    expect(svc.toast()).toBeNull();
  });

  it('dismiss() is safe to call when toast is already null', () => {
    expect(() => svc.dismiss()).not.toThrow();
    expect(svc.toast()).toBeNull();
  });

  it('fireTimerComplete() sets a toast notification for work type', async () => {
    // Suppress actual notifications/audio
    (svc as any).sendNotification = vi.fn().mockResolvedValue(undefined);
    (svc as any).playSound = vi.fn();
    (svc as any).startRepeatLoop = vi.fn();
    await svc.fireTimerComplete('work');
    vi.runAllTimers(); // flush the 50ms setTimeout inside showToast
    expect(svc.toast()).not.toBeNull();
    expect(svc.toast()?.type).toBe('work');
    expect(svc.toast()?.title).toBeTruthy();
  });

  it('fireTimerComplete() sets a toast notification for short-break type', async () => {
    (svc as any).sendNotification = vi.fn().mockResolvedValue(undefined);
    (svc as any).playSound = vi.fn();
    (svc as any).startRepeatLoop = vi.fn();
    await svc.fireTimerComplete('short-break');
    vi.runAllTimers();
    expect(svc.toast()?.type).toBe('short-break');
  });

  it('uses the selected notification sound', () => {
    const playBell = vi.spyOn(svc as any, 'playBell');
    const playChime = vi.spyOn(svc as any, 'playChime');
    const playDing = vi.spyOn(svc as any, 'playDing');
    (svc as any).audioContext = { close: vi.fn() };

    mockSettings.settings.set({ ...DEFAULT_SETTINGS, notificationSound: 'chime' });
    (svc as any).playSound();

    expect(playBell).not.toHaveBeenCalled();
    expect(playChime).toHaveBeenCalledWith((svc as any).audioContext);
    expect(playDing).not.toHaveBeenCalled();
  });

  it('previews the selected sound even while reminders are muted', () => {
    const playDing = vi.spyOn(svc as any, 'playDing');
    (svc as any).audioContext = { close: vi.fn() };
    svc.muted.set(true);

    svc.previewSound('ding');

    expect(playDing).toHaveBeenCalledWith((svc as any).audioContext);
  });

  it('uses the configured reminder interval when starting repeats', () => {
    const onRepeatTick = vi.spyOn(svc as any, 'onRepeatTick');
    const originalWorker = globalThis.Worker;
    (globalThis as any).Worker = undefined;
    try {
      mockSettings.settings.set({ ...DEFAULT_SETTINGS, notificationRepeatInterval: 120 });
      (svc as any).startRepeatLoop('Done', 'Take a break', 'work');
      vi.advanceTimersByTime(119_999);
      expect(onRepeatTick).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onRepeatTick).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as any).Worker = originalWorker;
    }
  });
});
