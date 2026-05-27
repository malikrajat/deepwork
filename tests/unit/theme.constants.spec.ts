import { describe, it, expect } from 'vitest';
import {
  STATUS_CONFIG,
  STATUS_CYCLE,
  PRIORITY_CONFIG,
  QUADRANT_CONFIG,
  TIMER_TYPE_CONFIG,
} from '../../src/app/core/constants/theme.constants';
import { TaskStatus, TaskQuadrant } from '../../src/app/core/models/task.model';
import { TimerType } from '../../src/app/core/models/session.model';

describe('theme constants', () => {

  // ── STATUS_CONFIG ──────────────────────────────────────────────────────
  describe('STATUS_CONFIG', () => {
    const statuses: TaskStatus[] = ['todo', 'in-progress', 'done'];

    it('covers all three task statuses', () => {
      statuses.forEach(s => expect(STATUS_CONFIG[s]).toBeDefined());
    });

    it('each status entry has a non-empty label and tooltip', () => {
      statuses.forEach(s => {
        expect(STATUS_CONFIG[s].label.length).toBeGreaterThan(0);
        expect(STATUS_CONFIG[s].tooltip.length).toBeGreaterThan(0);
      });
    });

    it('each status entry has a color and bgColor string', () => {
      statuses.forEach(s => {
        expect(typeof STATUS_CONFIG[s].color).toBe('string');
        expect(typeof STATUS_CONFIG[s].bgColor).toBe('string');
      });
    });
  });

  // ── STATUS_CYCLE ───────────────────────────────────────────────────────
  describe('STATUS_CYCLE', () => {
    it('contains exactly 3 statuses', () => {
      expect(STATUS_CYCLE).toHaveLength(3);
    });

    it('starts with todo', () => {
      expect(STATUS_CYCLE[0]).toBe('todo');
    });

    it('follows the expected order: todo → in-progress → done', () => {
      expect(STATUS_CYCLE).toEqual(['todo', 'in-progress', 'done']);
    });

    it('cycles back to todo after done', () => {
      const doneIdx = STATUS_CYCLE.indexOf('done');
      expect(STATUS_CYCLE[(doneIdx + 1) % STATUS_CYCLE.length]).toBe('todo');
    });
  });

  // ── PRIORITY_CONFIG ────────────────────────────────────────────────────
  describe('PRIORITY_CONFIG', () => {
    const priorities = [1, 2, 3, 4] as const;

    it('covers all four priority levels', () => {
      priorities.forEach(p => expect(PRIORITY_CONFIG[p]).toBeDefined());
    });

    it('each priority has a label, shortLabel, color, and bgColor', () => {
      priorities.forEach(p => {
        const cfg = PRIORITY_CONFIG[p];
        expect(cfg.label.length).toBeGreaterThan(0);
        expect(cfg.shortLabel).toBe(`P${p}`);
        expect(cfg.color.length).toBeGreaterThan(0);
        expect(cfg.bgColor.length).toBeGreaterThan(0);
      });
    });

    it('P1 label contains "Critical"', () => {
      expect(PRIORITY_CONFIG[1].label).toContain('Critical');
    });

    it('P4 label contains "Low"', () => {
      expect(PRIORITY_CONFIG[4].label).toContain('Low');
    });
  });

  // ── QUADRANT_CONFIG ────────────────────────────────────────────────────
  describe('QUADRANT_CONFIG', () => {
    const quadrants: TaskQuadrant[] = ['urgent-important', 'important', 'urgent', 'neither'];

    it('covers all four quadrants', () => {
      quadrants.forEach(q => expect(QUADRANT_CONFIG[q]).toBeDefined());
    });

    it('each quadrant has label, fullLabel, description, emoji', () => {
      quadrants.forEach(q => {
        const cfg = QUADRANT_CONFIG[q];
        expect(cfg.label.length).toBeGreaterThan(0);
        expect(cfg.fullLabel.length).toBeGreaterThan(0);
        expect(cfg.description.length).toBeGreaterThan(0);
        expect(cfg.emoji.length).toBeGreaterThan(0);
      });
    });

    it('sortOrders are unique integers 1–4', () => {
      const orders = quadrants.map(q => QUADRANT_CONFIG[q].sortOrder).sort();
      expect(orders).toEqual([1, 2, 3, 4]);
    });

    it('urgent-important has the lowest sortOrder (1 = Do First)', () => {
      expect(QUADRANT_CONFIG['urgent-important'].sortOrder).toBe(1);
    });

    it('neither has the highest sortOrder (4 = Eliminate)', () => {
      expect(QUADRANT_CONFIG['neither'].sortOrder).toBe(4);
    });
  });

  // ── TIMER_TYPE_CONFIG ──────────────────────────────────────────────────
  describe('TIMER_TYPE_CONFIG', () => {
    const types: TimerType[] = ['work', 'short-break', 'long-break'];

    it('covers all three timer types', () => {
      types.forEach(t => expect(TIMER_TYPE_CONFIG[t]).toBeDefined());
    });

    it('each type has a non-empty label, color, and gradient', () => {
      types.forEach(t => {
        const cfg = TIMER_TYPE_CONFIG[t];
        expect(cfg.label.length).toBeGreaterThan(0);
        expect(cfg.color.length).toBeGreaterThan(0);
        expect(cfg.gradient.length).toBeGreaterThan(0);
      });
    });

    it('work label is "Focus Session"', () => {
      expect(TIMER_TYPE_CONFIG['work'].label).toBe('Focus Session');
    });

    it('short-break label is "Short Break"', () => {
      expect(TIMER_TYPE_CONFIG['short-break'].label).toBe('Short Break');
    });

    it('long-break label is "Long Break"', () => {
      expect(TIMER_TYPE_CONFIG['long-break'].label).toBe('Long Break');
    });
  });
});
