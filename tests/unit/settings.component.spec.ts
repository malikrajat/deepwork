import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { signal } from '@angular/core';
import { SettingsComponent } from '../../src/app/pages/settings/settings.component';
import { SettingsService } from '../../src/app/core/services/settings.service';
import { TaskService } from '../../src/app/core/services/task.service';
import { DbService } from '../../src/app/core/services/db.service';
import { ThemeService } from '../../src/app/core/services/theme.service';
import { InstallService } from '../../src/app/core/services/install.service';
import { NotificationService } from '../../src/app/core/services/notification.service';
import { WaterReminderService } from '../../src/app/core/services/water-reminder.service';
import { DEFAULT_SETTINGS } from '../../src/app/core/models/settings.model';

const SOURCE = resolve(__dirname, '../../src/app/pages/settings/settings.component.ts');

/**
 * The page is a view over SettingsService, DbService and TaskService, and the
 * template is not rendered here: this project mandates signal inputs (see
 * `docs/angular-best-practices.md`), and Angular's JIT compiler — the only option
 * under Vitest — cannot resolve them, so `TestBed.createComponent` on such a
 * template fails. The same constraint is documented in
 * `desktop-prefs-panel.component.spec.ts`. The component is therefore built
 * inside an injection context and its behaviour exercised directly, with the
 * template's affordances asserted against the source.
 */
describe('SettingsComponent', () => {
  const setup = (stored: Partial<typeof DEFAULT_SETTINGS> = {}) => {
    const settings = {
      settings: signal({ ...DEFAULT_SETTINGS, ...stored }),
      loadSettings: vi.fn().mockResolvedValue(undefined),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      updateField: vi.fn().mockResolvedValue(undefined),
      applyTheme: vi.fn(),
    };
    const tasks = {
      closeExpiredTasks: vi.fn().mockResolvedValue(0),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: SettingsService, useValue: settings },
        { provide: TaskService, useValue: tasks },
        { provide: DbService, useValue: { init: vi.fn().mockResolvedValue(undefined) } },
        { provide: ThemeService, useValue: { apply: vi.fn() } },
        { provide: InstallService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: WaterReminderService, useValue: {} },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new SettingsComponent());
    return { component, settings, tasks };
  };

  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => TestBed.resetTestingModule());

  it('source file should exist and export class', () => {
    expect(readFileSync(SOURCE, 'utf8').includes('export class SettingsComponent')).toBe(true);
  });

  it('offers the carry-forward choice as a switch bound to the stored value', () => {
    const src = readFileSync(SOURCE, 'utf8');

    expect(src).toContain('Carry forward unfinished tasks');
    expect(src).toContain('[attr.aria-checked]="settingsModel().carryForwardTasks"');
    expect(src).toContain('(click)="toggleCarryForwardTasks()"');
  });

  it('starts the switch where the stored settings put it', async () => {
    const { component } = setup({ carryForwardTasks: false });

    await (component as unknown as { initAsync(): Promise<void> }).initAsync();

    expect(component.settingsModel().carryForwardTasks).toBe(false);
  });

  it('turning it off closes the work that is already past its day, at once', async () => {
    const { component, settings, tasks } = setup({ carryForwardTasks: true });

    await (component as unknown as { initAsync(): Promise<void> }).initAsync();
    await component.toggleCarryForwardTasks();

    expect(component.settingsModel().carryForwardTasks).toBe(false);
    expect(settings.updateField).toHaveBeenCalledWith('carryForwardTasks', false);
    // Not tomorrow: the backlog in front of the user is what the switch is about.
    expect(tasks.closeExpiredTasks).toHaveBeenCalledTimes(1);
  });

  it('turning it back on changes nothing that is already closed', async () => {
    const { component, settings, tasks } = setup({ carryForwardTasks: false });

    await (component as unknown as { initAsync(): Promise<void> }).initAsync();
    await component.toggleCarryForwardTasks();

    expect(component.settingsModel().carryForwardTasks).toBe(true);
    expect(settings.updateField).toHaveBeenCalledWith('carryForwardTasks', true);
    // The sweep runs either way; with carry-forward on it finds nothing to close.
    expect(tasks.closeExpiredTasks).toHaveBeenCalledTimes(1);
  });
});
