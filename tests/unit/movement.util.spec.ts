import { describe, it, expect } from 'vitest';
import { movementPrefsOf, movementWhyFor } from '../../src/app/core/utils/movement.util';
import { DEFAULT_SETTINGS } from '../../src/app/core/models/settings.model';
import { MOVEMENT_WHY } from '../../src/app/core/constants/movement.constants';

describe('movementPrefsOf', () => {
  it('gathers the four stored columns into the object the reminder uses', () => {
    const prefs = movementPrefsOf({
      ...DEFAULT_SETTINGS,
      movementReminders: false,
      movementStart: '07:30',
      movementEnd: '16:15',
      movementIntervalMinutes: 30,
    });

    expect(prefs).toEqual({
      enabled: false,
      start: '07:30',
      end: '16:15',
      intervalMinutes: 30,
    });
  });
});

describe('movementWhyFor', () => {
  it('is fixed for a given day, so the card does not change on every render', () => {
    const morning = new Date(2026, 8, 26, 8, 0);
    const evening = new Date(2026, 8, 26, 20, 0);

    expect(movementWhyFor(morning)).toBe(movementWhyFor(evening));
  });

  it('cycles through the why-lines rather than showing the same one forever', () => {
    const first = movementWhyFor(new Date(2026, 0, 1));
    const second = movementWhyFor(new Date(2026, 0, 2));

    expect(MOVEMENT_WHY).toContain(first);
    expect(MOVEMENT_WHY).toContain(second);
    expect(second).not.toBe(first);
  });
});
