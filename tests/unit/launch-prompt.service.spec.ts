import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { LaunchPromptService } from '../../src/app/core/services/launch-prompt.service';
import { SettingsService } from '../../src/app/core/services/settings.service';
import { DesktopPrefsService } from '../../src/app/core/services/desktop-prefs.service';
import { NotificationService } from '../../src/app/core/services/notification.service';
import { AttentionService } from '../../src/app/core/services/attention.service';
import { AppSettings, DEFAULT_SETTINGS } from '../../src/app/core/models/settings.model';
import { localDayKey, nudgePlanFor } from '../../src/app/core/utils/nudge-schedule.util';

/**
 * The first-run question, and the quieter reminders that follow it.
 *
 * The parts worth pinning down are the ones a user would notice: the dialog only
 * appears when the answer is not already yes, "not now" is not immediately
 * followed by the same question, and a reminder that arrives while the user has
 * paused the app is held rather than delivered.
 */
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => ({ pinned: true, supported: true })),
}));

const at = (minutes: number): Date => {
  const now = new Date();
  now.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return now;
};

describe('LaunchPromptService', () => {
  let settings: ReturnType<typeof signal<AppSettings>>;
  let prompted: ReturnType<typeof signal<boolean>>;
  let startWithSystem: ReturnType<typeof signal<boolean>>;
  let paused: ReturnType<typeof signal<boolean>>;
  let quiet: ReturnType<typeof signal<boolean>>;
  let held: ReturnType<typeof signal<number>>;
  let service: LaunchPromptService | null = null;

  const notifications = {
    announce: vi.fn(async () => undefined),
    showToastMessage: vi.fn(),
    dismiss: vi.fn(),
    init: vi.fn(),
  };

  function build(overrides: Partial<AppSettings> = {}, options: { prompted?: boolean } = {}) {
    settings = signal<AppSettings>({
      ...DEFAULT_SETTINGS,
      launchPrompted: true,
      ...overrides,
    });
    prompted = signal(options.prompted ?? true);
    startWithSystem = signal(false);
    paused = signal(false);
    quiet = signal(false);
    held = signal(0);

    const settingsService = {
      settings,
      updateField: vi.fn(async (key: keyof AppSettings, value: unknown) => {
        settings.set({ ...settings(), [key]: value });
      }),
    };
    const prefs = {
      isDesktopApp: true,
      ready: signal(true),
      prompted,
      startWithSystem,
      init: vi.fn(async () => undefined),
      setStartWithSystem: vi.fn(async (enabled: boolean) => startWithSystem.set(enabled)),
      error: signal<string | null>(null),
    };
    const attention = {
      paused,
      quietNow: quiet,
      holdNudge: vi.fn(() => held.update((count) => count + 1)),
      heldNudges: held,
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        LaunchPromptService,
        { provide: SettingsService, useValue: settingsService },
        { provide: DesktopPrefsService, useValue: prefs },
        { provide: NotificationService, useValue: notifications },
        { provide: AttentionService, useValue: attention },
      ],
    });
    service = TestBed.inject(LaunchPromptService);
    return service;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    service = null;
  });

  afterEach(() => {
    service?.ngOnDestroy();
    service = null;
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  describe('the dialog', () => {
    it('asks once, after the preferences dialog has been dealt with', async () => {
      const service = build({ launchPrompted: false }, { prompted: false });
      await service.init();

      // The older preferences dialog is still up: this one waits rather than
      // stacking a second modal on top of it.
      expect(service.visible()).toBe(false);

      prompted.set(true);
      expect(service.visible()).toBe(true);
    });

    it('does not ask when the setting is already on', async () => {
      const service = build({ launchPrompted: false });
      startWithSystem.set(true);

      await service.init();

      expect(service.visible()).toBe(false);
      expect(settings().launchPrompted).toBe(true);
    });

    it('retires the question when the setting is switched on elsewhere', async () => {
      const service = build({ launchPrompted: false }, { prompted: true });
      await service.init();
      expect(service.visible()).toBe(true);

      // The switch in the preferences dialog, the tray or Settings.
      startWithSystem.set(true);
      TestBed.tick();

      expect(service.visible()).toBe(false);
    });

    it('keeps the reminders after Not now, and stays quiet for a while', async () => {
      const service = build({ launchPrompted: false }, { prompted: true });
      await service.init();

      await service.decline();

      expect(settings().launchPrompted).toBe(true);
      expect(service.visible()).toBe(false);
      // The next reminder is not the same question in the same minute.
      const plan = nudgePlanFor(localDayKey(new Date()));
      await service.tick(at(plan.startup[0]));
      expect(notifications.showToastMessage).not.toHaveBeenCalled();
    });

    it('takes Yes as the answer, writes it, and stops asking', async () => {
      const service = build({ launchPrompted: false }, { prompted: true });
      await service.init();

      const accepted = await service.acceptStartWithSystem();

      expect(accepted).toBe(true);
      expect(startWithSystem()).toBe(true);
      expect(settings().launchPrompted).toBe(true);
      expect(service.visible()).toBe(false);
    });
  });

  describe('the reminders', () => {
    it('delivers the startup reminder in the app and on the desktop', async () => {
      const service = build();
      await service.init();
      const plan = nudgePlanFor(localDayKey(new Date()));

      await service.tick(at(plan.startup[0]));

      expect(notifications.announce).toHaveBeenCalledTimes(1);
      expect(notifications.announce.mock.calls[0][2]).toMatchObject({
        tag: NotificationService.STARTUP_NOTIFICATION_TAG,
      });
      expect(notifications.showToastMessage).toHaveBeenCalledTimes(1);
      // Two answers on the card: turn it on, or stop being asked.
      const actions = notifications.showToastMessage.mock.calls[0][4] as unknown[];
      expect(actions).toHaveLength(2);
    });

    it('says nothing when the plan is already behind the clock', async () => {
      const service = build();
      await service.init();
      const plan = nudgePlanFor(localDayKey(new Date()));

      await service.tick(at(plan.startup[plan.startup.length - 1] + 200));

      // The entries that came round while nothing was watching are counted as
      // passed rather than delivered in a burst.
      expect(notifications.showToastMessage).not.toHaveBeenCalled();
    });

    it('holds everything while the user has paused', async () => {
      const service = build();
      await service.init();
      paused.set(true);
      const plan = nudgePlanFor(localDayKey(new Date()));

      await service.tick(at(plan.startup[0]));

      expect(notifications.announce).not.toHaveBeenCalled();
      expect(notifications.showToastMessage).not.toHaveBeenCalled();
      expect(held()).toBe(1);
    });

    it('holds only the card while the desktop is quiet, and leaves the OS its notification', async () => {
      const service = build();
      await service.init();
      quiet.set(true);
      const plan = nudgePlanFor(localDayKey(new Date()));

      await service.tick(at(plan.startup[0]));

      // The OS that asked for quiet is the one that decides what DND does with
      // a notification; holding that too would silence the app for as long as a
      // forgotten focus mode lasts.
      expect(notifications.announce).toHaveBeenCalledTimes(1);
      expect(notifications.showToastMessage).not.toHaveBeenCalled();
      expect(held()).toBe(1);
    });

    it('stops the startup reminder for good when asked to stop asking', async () => {
      const service = build();
      await service.init();
      const plan = nudgePlanFor(localDayKey(new Date()));
      await service.tick(at(plan.startup[0]));

      const actions = notifications.showToastMessage.mock.calls[0][4] as {
        label: string;
        run: () => Promise<void>;
      }[];
      const stop = actions.find((action) => action.label === 'Stop asking')!;
      await stop.run();

      expect(settings().startupNudge).toBe(false);
    });
  });
});
