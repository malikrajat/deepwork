import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BodyReminderPromptService } from '../../src/app/core/services/body-reminder-prompt.service';
import { AttentionService } from '../../src/app/core/services/attention.service';
import { DesktopPrefsService } from '../../src/app/core/services/desktop-prefs.service';
import { LaunchPromptService } from '../../src/app/core/services/launch-prompt.service';
import { MovementReminderService } from '../../src/app/core/services/movement-reminder.service';
import { NotificationService } from '../../src/app/core/services/notification.service';
import { SettingsService } from '../../src/app/core/services/settings.service';
import { WaterReminderService } from '../../src/app/core/services/water-reminder.service';
import { AppSettings, DEFAULT_SETTINGS } from '../../src/app/core/models/settings.model';

/**
 * The offer that makes an off-by-default reminder discoverable.
 *
 * Both body reminders now start off, so this service is the only route most
 * users have to them. The tests pin down the four promises the feature makes:
 * it waits two hours, it speaks inside the reminder's own working window only,
 * **Set up** writes the real setting and reports the real defaults, and
 * **Stop asking** really stops.
 */

/** A fixed working day, so "two hours later" is a fact rather than a wait. */
function at(hours: number, minutes = 0, day = 26): Date {
  return new Date(2026, 8, day, hours, minutes, 0, 0);
}

describe('BodyReminderPromptService', () => {
  let service: BodyReminderPromptService;
  let settings: WritableSignal<AppSettings>;
  let updateField: ReturnType<typeof vi.fn>;
  let paused: WritableSignal<boolean>;
  let quiet: WritableSignal<boolean>;
  let dialogOpen: WritableSignal<boolean>;
  let waterTick: ReturnType<typeof vi.fn>;
  let movementTick: ReturnType<typeof vi.fn>;
  let handlers: Map<string, (action: string) => void>;

  const notifications = {
    announce: vi.fn(async () => true),
    nextQuote: vi.fn(() => 'a line about health'),
    showToastMessage: vi.fn(),
    dismissSystemNotification: vi.fn(async () => undefined),
    onToastAction: vi.fn((tag: string, handler: (action: string) => void) => {
      handlers.set(tag, handler);
      return () => handlers.delete(tag);
    }),
  };

  function build(overrides: Partial<AppSettings> = {}): BodyReminderPromptService {
    settings = signal<AppSettings>({
      ...DEFAULT_SETTINGS,
      waterStart: '09:00',
      waterEnd: '18:00',
      movementStart: '09:00',
      movementEnd: '18:00',
      ...overrides,
    });
    updateField = vi.fn(async (key: keyof AppSettings, value: unknown) => {
      settings.update((current) => ({ ...current, [key]: value }));
    });
    waterTick = vi.fn(async () => undefined);
    movementTick = vi.fn(async () => undefined);
    handlers = new Map();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        BodyReminderPromptService,
        { provide: SettingsService, useValue: { settings, updateField } },
        { provide: NotificationService, useValue: notifications },
        {
          provide: AttentionService,
          useValue: { paused, quietNow: () => quiet() },
        },
        { provide: LaunchPromptService, useValue: { dialogOpen } },
        {
          provide: DesktopPrefsService,
          useValue: { isDesktopApp: false, prompted: () => true },
        },
        { provide: WaterReminderService, useValue: { tick: waterTick } },
        { provide: MovementReminderService, useValue: { tick: movementTick } },
      ],
    });
    return TestBed.inject(BodyReminderPromptService);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at(9, 0));
    localStorage.clear();
    paused = signal(false);
    quiet = signal(false);
    dialogOpen = signal(false);
    notifications.announce.mockClear();
    notifications.nextQuote.mockClear();
    notifications.showToastMessage.mockClear();
    notifications.dismissSystemNotification.mockClear();
    notifications.onToastAction.mockClear();
    service = build();
  });

  afterEach(() => {
    service.ngOnDestroy();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('waits two hours before the first water offer and three before the first walk offer', async () => {
    service.start();

    await service.tick(at(10, 59));
    expect(notifications.announce).not.toHaveBeenCalled();

    await service.tick(at(11, 0));
    expect(notifications.announce).toHaveBeenCalledTimes(1);
    expect(notifications.announce.mock.calls[0][0]).toBe('Water reminders are off');

    // The walk offer is staggered so a first run does not raise both at once.
    await service.tick(at(12, 0));
    expect(notifications.announce).toHaveBeenCalledTimes(2);
    expect(notifications.announce.mock.calls[1][0]).toBe('Stand & walk reminders are off');
  });

  it('posts a sticky question with Set up and Stop asking on both surfaces', async () => {
    service.start();
    await service.tick(at(11, 0));

    const [, , options] = notifications.announce.mock.calls[0];
    expect(options).toMatchObject({
      tag: NotificationService.WATER_SETUP_NOTIFICATION_TAG,
      sticky: true,
      actions: [
        { id: 'setup', label: 'Set up' },
        { id: 'stop', label: 'Stop asking' },
      ],
    });

    const [, , , , actions, tag] = notifications.showToastMessage.mock.calls[0];
    expect(actions.map((action: { label: string }) => action.label)).toEqual([
      'Set up',
      'Stop asking',
    ]);
    expect(tag).toBe(NotificationService.WATER_SETUP_NOTIFICATION_TAG);
  });

  it('returns after the two-hour cadence, replacing the previous question', async () => {
    service.start();
    await service.tick(at(11, 0));
    expect(notifications.announce).toHaveBeenCalledTimes(1);

    await service.tick(at(13, 0));
    expect(notifications.announce).toHaveBeenCalledTimes(2);
    expect(service.offerState('water').nextAt).toBe(at(15, 0).getTime());
  });

  it('waits for the reminder window instead of speaking at night', async () => {
    service.start();

    await service.tick(at(20, 0));
    expect(notifications.announce).not.toHaveBeenCalled();

    // The deadline is still due, so the first offer arrives when the window does.
    await service.tick(at(9, 0, 27));
    expect(notifications.announce).toHaveBeenCalledTimes(1);
    expect(notifications.announce.mock.calls[0][0]).toBe('Water reminders are off');
  });

  it('says nothing at all while the app is paused', async () => {
    paused.set(true);
    service.start();

    await service.tick(at(11, 0));
    expect(notifications.announce).not.toHaveBeenCalled();
    expect(notifications.showToastMessage).not.toHaveBeenCalled();
  });

  it('waits for a first-run dialog to close', async () => {
    dialogOpen.set(true);
    service.start();

    await service.tick(at(11, 0));
    expect(notifications.announce).not.toHaveBeenCalled();
  });

  it('Set up writes the real water setting and reports the defaults it applied', async () => {
    service.start();
    await service.setUp('water');

    expect(updateField).toHaveBeenCalledWith('waterReminders', true);
    expect(waterTick).toHaveBeenCalledTimes(1);
    expect(notifications.dismissSystemNotification).toHaveBeenCalledWith(
      NotificationService.WATER_SETUP_NOTIFICATION_TAG,
    );

    const [title, body, options] = notifications.announce.mock.calls[0];
    expect(title).toBe('Water reminders are on');
    expect(body).toContain('09:00');
    expect(body).toContain('18:00');
    expect(body).toContain('60 minutes');
    expect(body).toContain('50 ml');
    expect(body).toContain('Dashboard');
    expect(options).toMatchObject({
      tag: NotificationService.WATER_SETUP_NOTIFICATION_TAG,
      sticky: true,
    });
  });

  it('does not take back its own confirmation on the next scheduler pass', async () => {
    service.start();
    await service.setUp('water');
    const dismissals = notifications.dismissSystemNotification.mock.calls.length;

    await service.tick(at(9, 1));

    // The confirmation was posted by this service, not left behind by someone
    // else turning the feature on, so the enabled branch must leave it alone.
    expect(notifications.dismissSystemNotification.mock.calls.length).toBe(dismissals);
  });

  it('Set up reports the stand-and-walk cadence', async () => {
    service.start();
    await service.setUp('movement');

    expect(updateField).toHaveBeenCalledWith('movementReminders', true);
    expect(movementTick).toHaveBeenCalledTimes(1);

    const [title, body] = notifications.announce.mock.calls[0];
    expect(title).toBe('Stand & walk reminders are on');
    expect(body).toContain('09:00');
    expect(body).toContain('18:00');
    expect(body).toContain('45 minutes');
  });

  it('a reminder switched on elsewhere takes back the offer and stops the asking', async () => {
    service.start();
    await service.tick(at(11, 0));
    expect(notifications.announce).toHaveBeenCalledTimes(1);

    settings.update((current) => ({ ...current, waterReminders: true }));
    await service.tick(at(11, 1));

    expect(notifications.dismissSystemNotification).toHaveBeenCalledWith(
      NotificationService.WATER_SETUP_NOTIFICATION_TAG,
    );
    expect(service.offerState('water').nextAt).toBeNull();
  });

  it('Stop asking ends the offers for good and says so', async () => {
    service.start();
    await service.stopAsking('water');

    expect(service.offerState('water').optedOut).toBe(true);
    expect(service.offerState('water').nextAt).toBeNull();
    expect(notifications.showToastMessage.mock.calls[0][0]).toBe('No more water setup prompts');

    await service.tick(at(11, 0));
    await service.tick(at(13, 0));
    // Only water was silenced: the stand-and-walk offer is its own question and
    // keeps its own answer.
    const waterOffers = notifications.announce.mock.calls.filter(
      ([, , options]) => options?.tag === NotificationService.WATER_SETUP_NOTIFICATION_TAG,
    );
    expect(waterOffers).toHaveLength(0);

    // The answer survives a restart: a new service reads it from storage.
    service.ngOnDestroy();
    const nextLaunch = build();
    expect(nextLaunch.offerState('water').optedOut).toBe(true);
    nextLaunch.ngOnDestroy();
  });

  it('wires both notification handles to the same answers the card gives', () => {
    service.start();

    expect(notifications.onToastAction).toHaveBeenCalledWith(
      NotificationService.WATER_SETUP_NOTIFICATION_TAG,
      expect.any(Function),
    );
    expect(notifications.onToastAction).toHaveBeenCalledWith(
      NotificationService.MOVEMENT_SETUP_NOTIFICATION_TAG,
      expect.any(Function),
    );
    expect(handlers.size).toBe(2);
  });
});
