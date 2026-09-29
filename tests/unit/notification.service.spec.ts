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

  it('publishes the alert as ringing until it is answered', async () => {
    (svc as any).sendNotification = vi.fn().mockResolvedValue(undefined);
    (svc as any).playSound = vi.fn();
    (svc as any).startRepeatLoop = vi.fn();

    expect(svc.ringing()).toBe(false);
    await svc.fireTimerComplete('work');
    expect(svc.ringing()).toBe(true);

    svc.dismiss();
    expect(svc.ringing()).toBe(false);
  });

  it('pulses once per tone, so the widget can move on the beat of the sound', async () => {
    // The ring is not only heard: the widget rocks the ring on every tone it
    // plays, and an edge per raise is what keeps the two on the same count
    // instead of on two clocks that slowly drift apart.
    (svc as any).sendNotification = vi.fn().mockResolvedValue(undefined);
    (svc as any).playSound = vi.fn();

    expect(svc.alertPulse()).toBe(0);

    await svc.fireTimerComplete('work');
    expect(svc.alertPulse()).toBe(1);

    (svc as any).onRepeatTick();
    (svc as any).onRepeatTick();
    expect(svc.alertPulse()).toBe(3);

    // Answering stops the pulses with the ringing; the count itself is an edge,
    // so it is left where it stopped rather than being rewound.
    svc.dismiss();
    (svc as any).onRepeatTick();
    expect(svc.alertPulse()).toBe(3);
  });

  it('repeats the tone and the card, but posts the system notice only once', async () => {
    // The OS owns its notification from the moment it is posted and keeps it in
    // the notification centre, so re-posting it every interval only stacks
    // duplicates of a message that is already on the user's desktop.
    const sendNotification = ((svc as any).sendNotification = vi.fn().mockResolvedValue(undefined));
    (svc as any).playSound = vi.fn();
    const showToast = vi.spyOn(svc as any, 'showToast');

    await svc.fireTimerComplete('work');
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledTimes(1);

    (svc as any).onRepeatTick();
    (svc as any).onRepeatTick();

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledTimes(3);
    expect((svc as any).playSound).toHaveBeenCalledTimes(3);
  });

  it('stops repeating once the alert is answered, and stays quiet afterwards', async () => {
    (svc as any).sendNotification = vi.fn().mockResolvedValue(undefined);
    (svc as any).playSound = vi.fn();

    // A real repeat loop, on the fallback path (no Worker in jsdom).
    const originalWorker = globalThis.Worker;
    (globalThis as any).Worker = undefined;
    try {
      mockSettings.settings.set({ ...DEFAULT_SETTINGS, notificationRepeatInterval: 30 });
      await svc.fireTimerComplete('work');
      // The toast is raised on a 50ms timeout; the repeat interval must not be
      // run to exhaustion here, so step past it rather than draining all timers.
      vi.advanceTimersByTime(50);
      expect(svc.ringing()).toBe(true);

      vi.advanceTimersByTime(30_000);
      expect((svc as any).playSound).toHaveBeenCalledTimes(2);

      svc.dismiss();
      expect(svc.ringing()).toBe(false);

      vi.advanceTimersByTime(120_000);
      expect((svc as any).playSound).toHaveBeenCalledTimes(2);
    } finally {
      (globalThis as any).Worker = originalWorker;
    }
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

  it('chime() rings the tone the user chose', () => {
    const playBell = vi.spyOn(svc as any, 'playBell');
    (svc as any).audioContext = { close: vi.fn() };

    svc.chime();

    expect(playBell).toHaveBeenCalledWith((svc as any).audioContext);
  });

  it('chime() stays silent while reminders are muted', () => {
    const playBell = vi.spyOn(svc as any, 'playBell');
    (svc as any).audioContext = { close: vi.fn() };
    svc.muted.set(true);

    svc.chime();

    expect(playBell).not.toHaveBeenCalled();
  });

  it('chime() stays silent when the chosen sound is none', () => {
    const playBell = vi.spyOn(svc as any, 'playBell');
    (svc as any).audioContext = { close: vi.fn() };
    mockSettings.settings.set({ ...DEFAULT_SETTINGS, notificationSound: 'none' });

    svc.chime();

    expect(playBell).not.toHaveBeenCalled();
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
