import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
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
    // The system notification is taken down when its question is answered.
    dismissSystemNotification: vi.fn(async () => undefined),
    // One handler per reminder tag; the test that presses a button reads the
    // handler back off this mock.
    onToastAction: vi.fn((_tag: string, _handler: (action: string) => void) => () => undefined),
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
      pinNow: vi.fn(async () => true),
      reopenFirstRun: vi.fn(async () => prompted.set(false)),
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
      // The setup is offered again first (see the test below), so dismiss the
      // preferences half before expecting this question on screen.
      prompted.set(true);
      expect(service.visible()).toBe(true);

      // The switch in the preferences dialog, the tray or Settings.
      startWithSystem.set(true);
      TestBed.tick();

      expect(service.visible()).toBe(false);
    });

    it('keeps the reminders after Not now, and stays quiet for a while', async () => {
      // The window runs from the dismissal to the reminder that follows it, so
      // the tick below has to land inside it. On the runner's own clock it may
      // not: CI starts this job at 04:36, long before the plan's first slot, and
      // the reminder is then legitimately due. Pinning the clock to that first
      // slot is what makes this a test of the window rather than of the hour the
      // job happened to start.
      const plan = nudgePlanFor(localDayKey(new Date()));
      vi.setSystemTime(at(plan.startup[0]));

      const service = build({ launchPrompted: false }, { prompted: true });
      await service.init();

      await service.decline();

      expect(settings().launchPrompted).toBe(true);
      expect(service.visible()).toBe(false);
      // The next reminder is not the same question in the same minute.
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
      expect(notifications.dismissSystemNotification).toHaveBeenCalledWith(
        NotificationService.STARTUP_NOTIFICATION_TAG,
      );
    });

    it('re-offers the setup on an install that predates the question', async () => {
      // The preferences dialog was dismissed by an older version, which never
      // asked this one. Closing a dialog is not an answer to a question that did
      // not exist yet, so the whole setup is offered again.
      const service = build({ launchPrompted: false }, { prompted: true });
      await service.init();

      const prefs = TestBed.inject(DesktopPrefsService) as unknown as {
        reopenFirstRun: ReturnType<typeof vi.fn>;
      };
      expect(prefs.reopenFirstRun).toHaveBeenCalledTimes(1);
      // The preferences dialog is now the one on screen; this question waits.
      expect(service.visible()).toBe(false);

      prompted.set(true);
      expect(service.visible()).toBe(true);
    });

    it('puts the setup back on the first launch after an install', async () => {
      // The installer leaves a marker beside the database; the shell hands it
      // over once. It has to put back exactly the two "already offered" flags,
      // even though the database (with every task and setting) survived.
      vi.mocked(invoke)
        .mockResolvedValueOnce({ pinned: false, supported: true } as never)
        .mockResolvedValueOnce(true as never);

      const service = build({ launchPrompted: true }, { prompted: true });
      await service.init();

      expect(settings().launchPrompted).toBe(false);
      const prefs = TestBed.inject(DesktopPrefsService) as unknown as {
        reopenFirstRun: ReturnType<typeof vi.fn>;
      };
      expect(prefs.reopenFirstRun).toHaveBeenCalledTimes(1);
      // The preferences dialog comes first, exactly as on a fresh install.
      expect(service.visible()).toBe(false);

      prompted.set(true);
      expect(service.visible()).toBe(true);
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
        // A question that waits, with the same two answers the card has: an OS
        // notification that slides away is a reminder that was never delivered.
        sticky: true,
        actions: [
          { id: 'yes', label: 'Yes, start with Windows' },
          { id: 'no', label: 'Not now' },
        ],
      });
      expect(notifications.showToastMessage).toHaveBeenCalledTimes(1);
      // Two answers on the card: turn it on, or stop being asked.
      const actions = notifications.showToastMessage.mock.calls[0][4] as unknown[];
      expect(actions).toHaveLength(2);
    });

    it('offers the app list when Windows will not let the app pin itself', async () => {
      // The taskbar API exists but says no (the usual unpackaged Windows 11
      // answer). The reminder must not offer a Yes that ends in an error: it
      // offers the two manual clicks instead.
      vi.mocked(invoke)
        .mockResolvedValueOnce({ pinned: false, supported: true, allowed: false } as never)
        .mockResolvedValueOnce(false as never)
        .mockResolvedValueOnce({ pinned: false, supported: true, allowed: false } as never);

      const service = build({ startupNudge: false });
      await service.init();
      const plan = nudgePlanFor(localDayKey(new Date()));

      await service.tick(at(plan.pin[0]));

      const options = notifications.announce.mock.calls[0][2] as {
        actions: { id: string; label: string }[];
      };
      expect(options.actions).toEqual([
        { id: 'yes', label: 'Yes, show me' },
        { id: 'no', label: 'Not now' },
      ]);
      expect(notifications.announce.mock.calls[0][1]).toContain('does not let an app pin itself');
      const actions = notifications.showToastMessage.mock.calls[0][4] as {
        label: string;
      }[];
      expect(actions[0].label).toBe('Show me');
    });

    it('turns startup on from the notification’s own Yes', async () => {
      const service = build();
      await service.init();
      const plan = nudgePlanFor(localDayKey(new Date()));
      await service.tick(at(plan.startup[0]));

      // One handler per tag: the startup question answers the startup tag.
      const call = notifications.onToastAction.mock.calls.find(
        ([tag]) => tag === NotificationService.STARTUP_NOTIFICATION_TAG,
      );
      expect(call).toBeDefined();
      const [, press] = call!;

      press('yes');
      await vi.advanceTimersByTimeAsync(0);

      expect(startWithSystem()).toBe(true);
      expect(settings().launchPrompted).toBe(true);
      expect(notifications.dismissSystemNotification).toHaveBeenCalledWith(
        NotificationService.STARTUP_NOTIFICATION_TAG,
      );
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
