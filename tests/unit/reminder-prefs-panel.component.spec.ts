import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReminderPrefsPanelComponent } from '../../src/app/shared/components/reminder-prefs-panel/reminder-prefs-panel.component';
import { SettingsService } from '../../src/app/core/services/settings.service';
import { AppSettings, DEFAULT_SETTINGS } from '../../src/app/core/models/settings.model';

/**
 * The first-run reminder switches.
 *
 * They are not a second copy of the preferences: each press writes the same
 * `waterReminders` / `movementReminders` field the Dashboard, Settings and the
 * schedulers read, which is what makes "off" here mean off everywhere.
 */
describe('ReminderPrefsPanelComponent', () => {
  let settings: WritableSignal<AppSettings>;
  let updateField: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    settings = signal<AppSettings>({ ...DEFAULT_SETTINGS });
    updateField = vi.fn(async (key: keyof AppSettings, value: unknown) => {
      settings.update((current) => ({ ...current, [key]: value }));
    });
    TestBed.configureTestingModule({
      providers: [{ provide: SettingsService, useValue: { settings, updateField } }],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function build(): ReminderPrefsPanelComponent {
    return TestBed.runInInjectionContext(() => new ReminderPrefsPanelComponent());
  }

  it('starts from the stored reminder switches', () => {
    settings.set({ ...DEFAULT_SETTINGS, waterReminders: true, movementReminders: false });
    const panel = build();

    expect(panel.waterOn()).toBe(true);
    expect(panel.movementOn()).toBe(false);
  });

  it('turns water reminders off through the shared setting', async () => {
    settings.set({ ...DEFAULT_SETTINGS, waterReminders: true });
    const panel = build();

    await panel.toggleWater();

    expect(updateField).toHaveBeenCalledWith('waterReminders', false);
    expect(settings().waterReminders).toBe(false);
    expect(panel.waterOn()).toBe(false);
  });

  it('turns stand-and-walk reminders off through the shared setting', async () => {
    settings.set({ ...DEFAULT_SETTINGS, movementReminders: true });
    const panel = build();

    await panel.toggleMovement();

    expect(updateField).toHaveBeenCalledWith('movementReminders', false);
    expect(settings().movementReminders).toBe(false);
    expect(panel.movementOn()).toBe(false);
  });

  it('turns either reminder back on, which is the same stored value the Dashboard reads', async () => {
    settings.set({ ...DEFAULT_SETTINGS, waterReminders: false, movementReminders: false });
    const panel = build();

    await panel.toggleWater();
    await panel.toggleMovement();

    expect(settings().waterReminders).toBe(true);
    expect(settings().movementReminders).toBe(true);
  });
});
