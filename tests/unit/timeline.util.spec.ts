import { describe, it, expect } from 'vitest';
import {
  HOUR_HEIGHT_PX,
  MIN_LABEL_HEIGHT_PX,
  TOTAL_HOURS,
  buildActiveBlock,
  buildSessionBlocks,
  formatTimeRange,
  labelForType,
  timeToPixel,
} from '../../src/app/core/utils/timeline.util';
import { PomodoroSession } from '../../src/app/core/models/session.model';

/**
 * The day's blocks: what each one says, and how tall it is drawn.
 *
 * This is the logic the component renders, tested here rather than through the
 * DOM because Angular's JIT compiler cannot resolve signal inputs under Vitest,
 * so `TimelineBarComponent` cannot be handed a list of sessions in a unit test.
 * The component's own spec (`timeline-bar-focus-card.spec.ts`) covers the markup.
 */

/** 10:15 local time on an arbitrary day. */
const START = new Date(2026, 0, 15, 10, 15, 0);
const NOW = new Date(2026, 0, 15, 10, 25, 0);

function session(overrides: Partial<PomodoroSession> = {}): PomodoroSession {
  return {
    id: 'session-1',
    taskId: null,
    type: 'work',
    durationPlanned: 1500,
    durationActual: 1500,
    startedAt: START.toISOString(),
    completedAt: new Date(2026, 0, 15, 10, 40, 0).toISOString(),
    interrupted: false,
    ...overrides,
  };
}

function runningSession(overrides: Partial<Parameters<typeof buildActiveBlock>[0]> = {}) {
  return {
    type: 'work',
    startedAt: START.toISOString(),
    elapsedSec: 600,
    plannedSec: 1500,
    taskId: null,
    ...overrides,
  };
}

describe('timeline util', () => {
  describe('geometry', () => {
    it('draws one minute per pixel', () => {
      expect(HOUR_HEIGHT_PX).toBe(60);
      expect(TOTAL_HOURS).toBe(24);
    });

    it('leaves a block shorter than a line of text unlabelled', () => {
      // The template compares a block's height against this to decide.
      expect(MIN_LABEL_HEIGHT_PX).toBe(8);
    });

    it('places a moment by its distance from midnight', () => {
      expect(timeToPixel(new Date(2026, 0, 15, 0, 0, 0))).toBe(0);
      expect(timeToPixel(new Date(2026, 0, 15, 10, 15, 0))).toBe(615);
      // 30 seconds is half a pixel, so the now-line creeps rather than jumps.
      expect(timeToPixel(new Date(2026, 0, 15, 10, 15, 30))).toBe(615.5);
    });
  });

  describe('labels', () => {
    it('names the start and the end of a range', () => {
      const label = formatTimeRange(START, new Date(2026, 0, 15, 10, 40, 0));
      expect(label).toContain('10:15');
      expect(label).toContain('10:40');
      expect(label).toContain('–');
    });

    it('names each kind of session', () => {
      expect(labelForType('work')).toBe('Focus');
      expect(labelForType('short-break')).toBe('Short Break');
      expect(labelForType('long-break')).toBe('Long Break');
    });
  });

  describe('completed sessions', () => {
    it('gives a block its task, its times, its height and its tooltip', () => {
      const blocks = buildSessionBlocks(
        [session({ taskId: 'task-1' })],
        [{ id: 'task-1', title: 'Write the report' }],
      );

      expect(blocks).toHaveLength(1);
      const block = blocks[0];
      expect(block.taskName).toBe('Write the report');
      expect(block.timeLabel).toContain('10:15');
      expect(block.timeLabel).toContain('10:40');
      expect(block.topPx).toBe(615);
      expect(block.heightPx).toBeCloseTo(25, 5);
      expect(block.active).toBe(false);
      // Only a running session is drawn inside a booked span.
      expect(block.plannedHeightPx).toBeNull();
      expect(block.tooltip).toContain('Write the report');
      expect(block.tooltip).toContain('(25m)');
    });

    it('calls a session with no task "Focus"', () => {
      expect(buildSessionBlocks([session()], [])[0].taskName).toBe('Focus');
    });

    it('falls back to "Focus" when the task it names is gone', () => {
      const blocks = buildSessionBlocks([session({ taskId: 'deleted-task' })], []);
      expect(blocks[0].taskName).toBe('Focus');
    });

    it('leaves breaks off the timeline', () => {
      expect(buildSessionBlocks([session({ type: 'short-break' })], [])).toHaveLength(0);
    });

    it('leaves a session with no time recorded off the timeline', () => {
      expect(buildSessionBlocks([session({ durationActual: 0 })], [])).toHaveLength(0);
    });

    it('keeps a very short session visible as a sliver', () => {
      const blocks = buildSessionBlocks([session({ durationActual: 1 })], []);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].heightPx).toBe(2);
      expect(blocks[0].tooltip).toContain('(0m)');
    });

    it('draws every session independently, so task names survive', () => {
      const blocks = buildSessionBlocks(
        [
          session({ id: 'a', taskId: 'task-1' }),
          session({ id: 'b', taskId: 'task-2', durationActual: 600 }),
        ],
        [
          { id: 'task-1', title: 'One' },
          { id: 'task-2', title: 'Two' },
        ],
      );

      expect(blocks.map((b) => b.taskName)).toEqual(['One', 'Two']);
      expect(blocks.map((b) => b.id)).toEqual(['a', 'b']);
    });

    it('has nothing to draw for a day with no sessions', () => {
      expect(buildSessionBlocks([], [])).toEqual([]);
    });
  });

  describe('the running session', () => {
    it('draws the elapsed bar inside the span that was booked', () => {
      const block = buildActiveBlock(runningSession(), [], NOW);

      expect(block).not.toBeNull();
      expect(block!.taskName).toBe('Focus');
      expect(block!.active).toBe(true);
      expect(block!.heightPx).toBeCloseTo(10, 5);
      expect(block!.plannedHeightPx).toBeCloseTo(25, 5);
      expect(block!.topPx).toBe(615);
      expect(block!.timeLabel).toContain('10:15');
      expect(block!.timeLabel).toContain('10:25');
      expect(block!.tooltip).toContain('10m 0s elapsed');
    });

    it('uses the title of the task it is linked to', () => {
      const block = buildActiveBlock(
        runningSession({ taskId: 'task-1' }),
        [{ id: 'task-1', title: 'Deep work' }],
        NOW,
      );

      expect(block!.taskName).toBe('Deep work');
    });

    it('falls back to "Focus" when its task is gone', () => {
      const block = buildActiveBlock(runningSession({ taskId: 'deleted-task' }), [], NOW);
      expect(block!.taskName).toBe('Focus');
    });

    it('has no booked span left once the session has run past it', () => {
      const block = buildActiveBlock(runningSession({ elapsedSec: 1600 }), [], NOW);
      expect(block!.plannedHeightPx).toBeNull();
    });

    it('stays visible as a sliver in the first minute', () => {
      const block = buildActiveBlock(runningSession({ elapsedSec: 60 }), [], NOW);
      expect(block!.heightPx).toBe(4);
    });

    it('draws nothing until there is a session with time on it', () => {
      expect(buildActiveBlock(runningSession({ startedAt: null }), [], NOW)).toBeNull();
      expect(buildActiveBlock(runningSession({ elapsedSec: 0 }), [], NOW)).toBeNull();
    });

    it('draws nothing for a break', () => {
      expect(buildActiveBlock(runningSession({ type: 'long-break' }), [], NOW)).toBeNull();
    });
  });
});
