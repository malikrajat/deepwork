import { describe, it, expect } from 'vitest';
import {
  createTaskFormDefaults,
  createHabitFormDefaults,
  createJournalFormDefaults,
  createSettingsFormDefaults,
  TaskFormModel,
  HabitFormModel,
  JournalFormModel,
  SettingsFormModel,
} from '../../src/app/shared/models/form.models';
import {
  WATER_AMOUNT_OPTIONS,
  WATER_GOAL_OPTIONS,
  WATER_INTERVAL_OPTIONS,
} from '../../src/app/core/constants/water.constants';

/** Today in the user's own timezone, the way the form factory computes it. */
function localToday(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

describe('form model factories', () => {

  // ── createTaskFormDefaults ─────────────────────────────────────────────
  describe('createTaskFormDefaults', () => {
    it('returns correct default shape', () => {
      const d: TaskFormModel = createTaskFormDefaults();
      expect(d.title).toBe('');
      expect(d.description).toBe('');
      expect(d.priority).toBe('3');
      expect(d.quadrant).toBe('');
      expect(d.deadline).toBe(localToday());
      expect(d.recurFrequency).toBe('');
      expect(d.recurEndDate).toBe('');
    });

    it('pre-fills the deadline with today so it never has to be typed twice', () => {
      // Local date, not UTC: east of Greenwich `toISOString()` is still yesterday
      // in the early morning, which is exactly when people plan their day.
      expect(createTaskFormDefaults().deadline).toBe(localToday());
    });

    it('returns a new independent object each call', () => {
      const a = createTaskFormDefaults();
      const b = createTaskFormDefaults();
      expect(a).not.toBe(b);
      a.title = 'modified';
      expect(b.title).toBe('');
    });

    it('all string fields are strings (not null/undefined)', () => {
      const d = createTaskFormDefaults();
      for (const [key, val] of Object.entries(d)) {
        expect(typeof val, `${key} should be a string`).toBe('string');
      }
    });
  });

  // ── createHabitFormDefaults ────────────────────────────────────────────
  describe('createHabitFormDefaults', () => {
    it('returns empty name and default icon', () => {
      const d: HabitFormModel = createHabitFormDefaults();
      expect(d.name).toBe('');
      expect(d.icon).toBe('✓');
    });

    it('returns a new object each call', () => {
      const a = createHabitFormDefaults();
      const b = createHabitFormDefaults();
      expect(a).not.toBe(b);
    });
  });

  // ── createJournalFormDefaults ──────────────────────────────────────────
  describe('createJournalFormDefaults', () => {
    it('returns empty content string', () => {
      const d: JournalFormModel = createJournalFormDefaults();
      expect(d.content).toBe('');
    });

    it('returns a new object each call', () => {
      const a = createJournalFormDefaults();
      const b = createJournalFormDefaults();
      expect(a).not.toBe(b);
    });
  });

  // ── createSettingsFormDefaults ─────────────────────────────────────────
  describe('createSettingsFormDefaults', () => {
    it('returns correct timer duration defaults (in seconds)', () => {
      const d: SettingsFormModel = createSettingsFormDefaults();
      expect(d.workDuration).toBe(1500);    // 25 min
      expect(d.shortBreak).toBe(300);       // 5 min
      expect(d.longBreak).toBe(900);        // 15 min
      expect(d.sessionsBeforeLongBreak).toBe(4);
    });

    it('returns correct notification defaults', () => {
      const d = createSettingsFormDefaults();
      expect(d.notificationSound).toBe('bell');
      expect(typeof d.notificationRepeatInterval).toBe('number');
      expect(d.notificationRepeatInterval).toBeGreaterThan(0);
    });

    it('returns a new object each call', () => {
      const a = createSettingsFormDefaults();
      const b = createSettingsFormDefaults();
      expect(a).not.toBe(b);
    });

    it('starts the water reminder off, on a glass and cadence it offers', () => {
      const d = createSettingsFormDefaults();

      expect(d.waterReminders).toBe(false);
      expect(d.waterStart).toBe('09:00');
      expect(d.waterEnd).toBe('18:00');
      expect(WATER_INTERVAL_OPTIONS).toContain(d.waterIntervalMinutes);
      expect(WATER_AMOUNT_OPTIONS).toContain(d.waterAmountMl);
      expect(WATER_GOAL_OPTIONS).toContain(d.waterGoalMl);
      expect(d.waterAmountMl).toBe(500);
      expect(d.waterGoalMl).toBe(2000);
    });
  });
});
