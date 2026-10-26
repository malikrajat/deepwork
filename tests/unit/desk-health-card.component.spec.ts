import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DeskHealthCardComponent } from '../../src/app/shared/components/desk-health-card/desk-health-card.component';
import { MovementReminderService } from '../../src/app/core/services/movement-reminder.service';
import { SettingsService } from '../../src/app/core/services/settings.service';
import { WaterReminderService } from '../../src/app/core/services/water-reminder.service';
import { movementWhyFor } from '../../src/app/core/utils/movement.util';
import { MOVEMENT_WHY } from '../../src/app/core/constants/movement.constants';

/**
 * The dashboard's two health switches.
 *
 * The card is a view over the same two services the Settings page writes to, so
 * these tests are about the one promise it makes: a single press flips the stored
 * preference and asks the owning scheduler to re-plan immediately. The template
 * itself is asserted against the source for the same reason the other
 * signal-heavy components are — the JIT compiler under Vitest cannot render
 * them.
 */
describe('DeskHealthCardComponent', () => {
  const setup = (waterOn = true, movementOn = true) => {
    const waterEnabled = signal(waterOn);
    const movementEnabled = signal(movementOn);
    const water = { enabled: waterEnabled, tick: vi.fn().mockResolvedValue(undefined) };
    const movement = { enabled: movementEnabled, tick: vi.fn().mockResolvedValue(undefined) };
    const settings = { updateField: vi.fn().mockResolvedValue(undefined) };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: WaterReminderService, useValue: water },
        { provide: MovementReminderService, useValue: movement },
        { provide: SettingsService, useValue: settings },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new DeskHealthCardComponent());
    return { component, water, movement, settings };
  };

  beforeEach(() => TestBed.resetTestingModule());

  it('turns both reminders off from one press each, and re-plans at once', async () => {
    const { component, water, movement, settings } = setup(true, true);

    await component.toggleWater();
    expect(settings.updateField).toHaveBeenCalledWith('waterReminders', false);
    expect(water.tick).toHaveBeenCalledTimes(1);

    await component.toggleMovement();
    expect(settings.updateField).toHaveBeenCalledWith('movementReminders', false);
    expect(movement.tick).toHaveBeenCalledTimes(1);
  });

  it('turns a reminder back on without visiting Settings', async () => {
    const { component, settings } = setup(false, false);

    await component.toggleWater();
    await component.toggleMovement();

    expect(settings.updateField).toHaveBeenCalledWith('waterReminders', true);
    expect(settings.updateField).toHaveBeenCalledWith('movementReminders', true);
  });

  it('draws a switch for each reminder, bound to the service state', () => {
    const src = readFileSync(
      resolve(
        __dirname,
        '../../src/app/shared/components/desk-health-card/desk-health-card.component.ts',
      ),
      'utf8',
    );

    expect(src).toContain('[attr.aria-checked]="water.enabled()"');
    expect(src).toContain('(click)="toggleWater()"');
    expect(src).toContain('[attr.aria-checked]="movement.enabled()"');
    expect(src).toContain('(click)="toggleMovement()"');
  });

  it('stamps the why-line from the movement deck, not a hard-coded sentence', () => {
    const { component } = setup();
    expect(MOVEMENT_WHY).toContain(component.why);
    expect(component.why).toBe(movementWhyFor(new Date()));
  });
});
