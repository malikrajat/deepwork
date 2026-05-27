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
});
