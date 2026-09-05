import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { TimerService } from '../../src/app/core/services/timer.service';
import { DbService } from '../../src/app/core/services/db.service';
import { SettingsService } from '../../src/app/core/services/settings.service';
import { DEFAULT_SETTINGS } from '../../src/app/core/models/settings.model';

const makeMockDb = () => ({
  init: vi.fn().mockResolvedValue(undefined),
  getSettings: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS }),
  getTimerState: vi.fn().mockResolvedValue(null),
  saveTimerState: vi.fn().mockResolvedValue(undefined),
  saveSession: vi.fn().mockResolvedValue(undefined),
});

describe('TimerService', () => {
  let svc: TimerService;
  let mockDb: ReturnType<typeof makeMockDb>;
  let mockSettings: {
    settings: ReturnType<typeof signal<typeof DEFAULT_SETTINGS>>;
    loadSettings: ReturnType<typeof vi.fn>;
    saveSettings: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockDb = makeMockDb();
    mockSettings = {
      settings: signal({ ...DEFAULT_SETTINGS }),
      loadSettings: vi.fn(async () => mockSettings.settings.set(await mockDb.getSettings())),
      saveSettings: vi.fn(async (settings) => mockSettings.settings.set(settings)),
    };
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        TimerService,
        { provide: DbService, useValue: mockDb },
        { provide: SettingsService, useValue: mockSettings },
      ],
    });
    svc = TestBed.inject(TimerService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  // ── Initial state ────────────────────────────────────────────────────

  it('starts not running', () => expect(svc.isRunning()).toBe(false));

  it('starts with work timer type', () => expect(svc.timerType()).toBe('work'));

  it('starts with full work duration', () =>
    expect(svc.remainingSeconds()).toBe(DEFAULT_SETTINGS.workDuration));

  it('starts at session count 0', () => expect(svc.sessionCount()).toBe(0));

  it('starts with no linked task', () => expect(svc.currentTaskId()).toBeNull());

  it('displayTime formats remaining seconds as MM:SS', () => {
    // 1500s = 25:00
    expect(svc.displayTime()).toBe('25:00');
  });

  it('progress is 0 before any elapsed time', () => expect(svc.progress()).toBe(0));

  it('totalDuration matches work duration from default settings', () =>
    expect(svc.totalDuration()).toBe(DEFAULT_SETTINGS.workDuration));

  // ── init() ───────────────────────────────────────────────────────────

  it('init() loads settings and timer state from db', async () => {
    await svc.init();
    expect(mockDb.getSettings).toHaveBeenCalled();
    expect(mockDb.getTimerState).toHaveBeenCalled();
  });

  it('init() is idempotent (only runs once)', async () => {
    await svc.init();
    await svc.init();
    expect(mockDb.getSettings).toHaveBeenCalledTimes(1);
  });

  // ── start / pause / stop ─────────────────────────────────────────────

  it('start() sets isRunning to true', async () => {
    await svc.init();
    svc.start();
    expect(svc.isRunning()).toBe(true);
  });

  it('pause() stops the timer and sets isRunning to false', async () => {
    await svc.init();
    svc.start();
    svc.pause();
    expect(svc.isRunning()).toBe(false);
  });

  it('start() is a no-op when already running', async () => {
    await svc.init();
    svc.start();
    svc.start(); // second call ignored
    expect(svc.isRunning()).toBe(true);
  });

  it('stop() resets remaining seconds to full work duration', async () => {
    await svc.init();
    svc.start();
    vi.advanceTimersByTime(5000);
    svc.stop();
    expect(svc.isRunning()).toBe(false);
    expect(svc.remainingSeconds()).toBe(DEFAULT_SETTINGS.workDuration);
  });

  it('tick reduces remainingSeconds by 1 per second', async () => {
    await svc.init();
    svc.start();
    vi.advanceTimersByTime(3000);
    expect(svc.remainingSeconds()).toBe(DEFAULT_SETTINGS.workDuration - 3);
  });

  // ── skip / advance ────────────────────────────────────────────────────

  it('skip() on work advances to short-break', async () => {
    await svc.init();
    svc.skip();
    expect(svc.timerType()).toBe('short-break');
  });

  it('skip() on work increments sessionCount', async () => {
    await svc.init();
    svc.skip();
    expect(svc.sessionCount()).toBe(1);
  });

  it('skip() on short-break returns to work', async () => {
    await svc.init();
    svc.skip(); // work → short-break
    svc.skip(); // short-break → work
    expect(svc.timerType()).toBe('work');
  });

  it('skip() after 4 work sessions advances to long-break', async () => {
    await svc.init();
    // 3 work/break cycles then 4th work → long-break
    for (let i = 0; i < 3; i++) {
      svc.skip(); // work → short-break
      svc.skip(); // short-break → work
    }
    svc.skip(); // 4th work → long-break (4 % 4 === 0)
    expect(svc.timerType()).toBe('long-break');
    expect(svc.sessionCount()).toBe(4);
  });

  it('uses the updated session cycle setting when advancing to a break', async () => {
    await svc.init();
    mockSettings.settings.update(settings => ({ ...settings, sessionsBeforeLongBreak: 2 }));

    svc.skip(); // work → short-break
    svc.skip(); // short-break → work
    svc.skip(); // work → long-break

    expect(svc.timerType()).toBe('long-break');
    expect(svc.sessionCount()).toBe(2);
  });

  it('skip() on long-break returns to work', async () => {
    await svc.init();
    for (let i = 0; i < 3; i++) { svc.skip(); svc.skip(); }
    svc.skip(); // work → long-break
    svc.skip(); // long-break → work
    expect(svc.timerType()).toBe('work');
  });

  // ── reset / linkTask ─────────────────────────────────────────────────

  it('reset() restores initial state', async () => {
    await svc.init();
    svc.skip(); // advance state
    svc.reset();
    expect(svc.timerType()).toBe('work');
    expect(svc.sessionCount()).toBe(0);
    expect(svc.isRunning()).toBe(false);
    expect(svc.remainingSeconds()).toBe(DEFAULT_SETTINGS.workDuration);
  });

  it('linkTask() sets and clears currentTaskId', () => {
    svc.linkTask('task-abc');
    expect(svc.currentTaskId()).toBe('task-abc');
    svc.linkTask(null);
    expect(svc.currentTaskId()).toBeNull();
  });
});
