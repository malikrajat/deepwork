import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { TimerService } from '../../src/app/core/services/timer.service';
import { DbService } from '../../src/app/core/services/db.service';
import { SettingsService } from '../../src/app/core/services/settings.service';
import { NotificationService } from '../../src/app/core/services/notification.service';
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
  let mockNotifications: {
    init: ReturnType<typeof vi.fn>;
    fireTimerComplete: ReturnType<typeof vi.fn>;
    onAlertAction: ReturnType<typeof vi.fn>;
  };
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
    mockNotifications = {
      init: vi.fn().mockResolvedValue(undefined),
      fireTimerComplete: vi.fn().mockResolvedValue(undefined),
      onAlertAction: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        TimerService,
        { provide: DbService, useValue: mockDb },
        { provide: SettingsService, useValue: mockSettings },
        { provide: NotificationService, useValue: mockNotifications },
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

  it('init() does not resume yesterday’s task on today’s session', async () => {
    // What an interrupted session leaves behind: still running, still naming the
    // task it was for. Carrying that task into a new day is how a session started
    // without picking one ended up filed against a task from weeks earlier.
    mockDb.getTimerState.mockResolvedValue({
      isRunning: true,
      type: 'work',
      remainingSeconds: 900,
      taskId: 'task-from-yesterday',
      sessionCount: 3,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      lastActiveDate: '2000-01-01',
    });

    await svc.init();

    expect(svc.currentTaskId()).toBeNull();
  });

  it('init() keeps the task of a session interrupted earlier today', async () => {
    mockDb.getTimerState.mockResolvedValue({
      isRunning: true,
      type: 'work',
      remainingSeconds: 900,
      taskId: 'task-from-today',
      sessionCount: 3,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      lastActiveDate: new Date().toISOString().slice(0, 10),
    });

    await svc.init();

    expect(svc.currentTaskId()).toBe('task-from-today');
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

  it('stop() records the linked task’s name on the session', async () => {
    await svc.init();
    svc.linkTask('task-abc', 'Code review');
    svc.start();
    vi.advanceTimersByTime(5000);
    svc.stop();

    expect(mockDb.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-abc', taskTitle: 'Code review' }),
    );
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
    mockSettings.settings.update((settings) => ({ ...settings, sessionsBeforeLongBreak: 2 }));

    svc.skip(); // work → short-break
    svc.skip(); // short-break → work
    svc.skip(); // work → long-break

    expect(svc.timerType()).toBe('long-break');
    expect(svc.sessionCount()).toBe(2);
  });

  it('skip() on long-break returns to work', async () => {
    await svc.init();
    for (let i = 0; i < 3; i++) {
      svc.skip();
      svc.skip();
    }
    svc.skip(); // work → long-break
    svc.skip(); // long-break → work
    expect(svc.timerType()).toBe('work');
  });

  // ── reset / linkTask ─────────────────────────────────────────────────

  // ── announcing a finished session ─────────────────────────────────────

  it('announces a finished focus session, and says what comes next', async () => {
    await svc.init();
    svc.start();
    vi.advanceTimersByTime(DEFAULT_SETTINGS.workDuration * 1000);

    expect(mockNotifications.fireTimerComplete).toHaveBeenCalledTimes(1);
    expect(mockNotifications.fireTimerComplete).toHaveBeenCalledWith('work', 'short-break');
  });

  it('announces a finished short break', async () => {
    // The report this exists for: a 5:00 break ran out and nothing at all
    // happened — no tone, no card, no system notification.
    await svc.init();
    svc.skip(); // work → short-break
    svc.start();
    vi.advanceTimersByTime(DEFAULT_SETTINGS.shortBreak * 1000);

    expect(mockNotifications.fireTimerComplete).toHaveBeenCalledTimes(1);
    expect(mockNotifications.fireTimerComplete).toHaveBeenCalledWith('short-break', 'work');
  });

  it('announces a finished long break', async () => {
    await svc.init();
    for (let i = 0; i < 7; i++) svc.skip(); // three breaks and a fourth focus → long-break
    expect(svc.timerType()).toBe('long-break');

    svc.start();
    vi.advanceTimersByTime(DEFAULT_SETTINGS.longBreak * 1000);

    expect(mockNotifications.fireTimerComplete).toHaveBeenCalledTimes(1);
    expect(mockNotifications.fireTimerComplete).toHaveBeenCalledWith('long-break', 'work');
  });

  it('says nothing when the user skips or stops a session early', async () => {
    // The alert means "your time is up". A session the user ended themselves is
    // not news, and ringing for it would train them to ignore the tone.
    await svc.init();
    svc.start();
    svc.skip();
    svc.start();
    svc.stop();

    expect(mockNotifications.fireTimerComplete).not.toHaveBeenCalled();
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

  // ── answering from the alert's own buttons ────────────────────────────

  /**
   * Presses one of the four answers the completion alert offers.
   *
   * The service hands its handler to `NotificationService` once, so the press a
   * Windows toast reports arrives here through that callback — the same path a
   * press on the card takes.
   */
  function alertAction(action: string): void {
    const handler = mockNotifications.onAlertAction.mock.calls[0]?.[0] as
      | ((pressed: string) => void)
      | undefined;
    expect(handler).toBeTypeOf('function');
    handler?.(action);
  }

  it('registers itself as the alert’s clock, once', () => {
    expect(mockNotifications.onAlertAction).toHaveBeenCalledTimes(1);
  });

  it('pauses the session a pressed Pause found running', async () => {
    // The toast outlives the alert — it waits in the notification centre — so
    // Pause has to act on whatever is running when it is pressed, not on the
    // session that finished.
    await svc.init();
    svc.start();

    alertAction('pause');

    expect(svc.isRunning()).toBe(false);
  });

  it('skips to the next session when Next is pressed', async () => {
    await svc.init();

    alertAction('next');

    expect(svc.timerType()).toBe('short-break');
  });

  it('starts the session that is waiting when Resume is pressed', async () => {
    await svc.init();

    alertAction('resume');

    expect(svc.isRunning()).toBe(true);
  });

  it('leaves the clock alone when Hold up is pressed', async () => {
    // Hold up is the answer that only closes the alert: nothing started,
    // nothing skipped, nothing paused.
    await svc.init();
    svc.start();

    alertAction('hold');

    expect(svc.isRunning()).toBe(true);
    expect(svc.timerType()).toBe('work');
    expect(svc.sessionCount()).toBe(0);
  });
});
