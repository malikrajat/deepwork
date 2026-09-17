import {
  BreakBlock,
  BreakKind,
  DaySchedule,
  FocusBlock,
  MAX_POMODOROS,
  MIN_POMODOROS,
  PlacedTask,
  ScheduleBlock,
  ScheduleItem,
  SchedulePrefs,
  UnscheduledTask,
} from '../models/schedule.model';
import { clampMinute } from './schedule.util';

export interface PomodoroConfig {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  /** Focus blocks before a long break replaces the short one. */
  pomodorosBeforeLongBreak: number;
}

/**
 * Lays a day out as pomodoro focus blocks.
 *
 * Pure function: hand it the ordered queue, the day window and the pomodoro
 * configuration and it returns the timeline — focus slots that carry tasks plus
 * the short/long rest slots reserved between them.
 *
 * Rules:
 *  - Tasks placed by hand (`entry.slotStart`) are fixed: their range is reserved
 *    first and the automatic flow is laid out around them.
 *  - Everything else fills the remaining focus slots in queue order, so the
 *    Eisenhower matrix decides *what* runs and *when* it runs.
 *  - A rest slot follows every focus block, including between two different
 *    tasks, and is never filled with work.
 *  - Focus slots that start at the same minute are merged, which is how a slot
 *    ends up holding more than one task (the first is the automatic owner).
 */
export function buildDaySchedule(
  items: ScheduleItem[],
  prefs: SchedulePrefs,
  config: PomodoroConfig
): DaySchedule {
  const focus = Math.max(1, Math.round(config.focusMinutes));
  const shortBreak = Math.max(1, Math.round(config.shortBreakMinutes));
  const longBreak = Math.max(1, Math.round(config.longBreakMinutes));
  const every = Math.max(1, Math.round(config.pomodorosBeforeLongBreak));
  const dayStart = prefs.dayStart;
  const dayEnd = Math.max(prefs.dayEnd, prefs.dayStart + 60);

  const blocks: ScheduleBlock[] = [];
  const placements: PlacedTask[] = [];
  const unscheduled: UnscheduledTask[] = [];
  const reserved: Array<[number, number]> = [];
  let focusCount = 0;
  let cursor = dayStart;

  const pomodorosOf = (item: ScheduleItem) =>
    Math.max(MIN_POMODOROS, Math.min(MAX_POMODOROS, Math.round(item.entry?.pomodoros ?? MIN_POMODOROS)));

  const nextBreakKind = (): BreakKind => (focusCount % every === 0 ? 'long-break' : 'short-break');
  const breakLength = (kind: BreakKind) => (kind === 'long-break' ? longBreak : shortBreak);

  /** First minute at or after `from` where `length` minutes are free. */
  const available = (from: number, length: number): number => {
    let at = from;
    for (let guard = 0; guard < 64; guard++) {
      let moved = false;
      for (const [start, end] of reserved) {
        if (at < end && at + length > start) {
          at = end;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return at;
  };

  // ── 1. Fixed placements reserve their range first ────────────────────────
  const pinned = items
    .filter(item => item.entry?.slotStart !== null && item.entry?.slotStart !== undefined)
    .sort((a, b) => a.entry!.slotStart! - b.entry!.slotStart! || a.index - b.index);

  for (const item of pinned) {
    const count = pomodorosOf(item);
    const startMin = clampMinute(item.entry!.slotStart!);
    let at = startMin;
    const blockIds: string[] = [];

    for (let i = 0; i < count; i++) {
      const block: FocusBlock = {
        kind: 'focus',
        id: `pinned-${item.task.id}-${i}`,
        startMin: at,
        endMin: at + focus,
        index: 0,
        taskIds: [item.task.id],
        pinned: true,
        continued: i > 0,
      };
      blocks.push(block);
      blockIds.push(block.id);
      at += focus;
      focusCount++;

      if (i < count - 1) {
        const kind = nextBreakKind();
        const length = breakLength(kind);
        blocks.push({
          kind,
          id: `pinned-break-${item.task.id}-${i}`,
          startMin: at,
          endMin: at + length,
          index: 0,
          afterId: block.id,
        });
        at += length;
      }
    }

    reserved.push([startMin, at]);
    placements.push({
      taskId: item.task.id,
      startMin,
      endMin: at,
      blockIds,
      pomodoros: count,
      pinned: true,
      quadrant: item.quadrant,
    });
  }

  // ── 2. Automatic flow, in quadrant → task order ──────────────────────────
  const auto = items.filter(item => item.entry?.slotStart === null || item.entry?.slotStart === undefined);

  for (const [position, item] of auto.entries()) {
    const count = pomodorosOf(item);
    const blocksBefore = blocks.length;
    const focusBefore = focusCount;
    const cursorBefore = cursor;
    const blockIds: string[] = [];
    let placedStart = cursor;
    let overflowed = false;

    for (let i = 0; i < count; i++) {
      cursor = available(cursor, focus);
      if (cursor + focus > dayEnd) {
        overflowed = true;
        break;
      }

      if (i === 0) placedStart = cursor;

      const block: FocusBlock = {
        kind: 'focus',
        id: `auto-${item.task.id}-${i}`,
        startMin: cursor,
        endMin: cursor + focus,
        index: 0,
        taskIds: [item.task.id],
        pinned: false,
        continued: i > 0,
      };
      blocks.push(block);
      blockIds.push(block.id);
      cursor += focus;
      focusCount++;

      if (i < count - 1) {
        const kind = nextBreakKind();
        const length = breakLength(kind);
        const at = available(cursor, length);
        blocks.push({
          kind,
          id: `auto-break-${item.task.id}-${i}`,
          startMin: at,
          endMin: at + length,
          index: 0,
          afterId: block.id,
        });
        cursor = at + length;
      }
    }

    if (overflowed) {
      blocks.length = blocksBefore;
      focusCount = focusBefore;
      cursor = cursorBefore;
      unscheduled.push({ taskId: item.task.id, reason: 'overflow' });
      continue;
    }

    const taskEnd = cursor;

    // A rest slot is reserved between two tasks as well, not only between the
    // pomodoros of the same task.
    if (position < auto.length - 1) {
      const kind = nextBreakKind();
      const length = breakLength(kind);
      const at = available(cursor, length);
      if (at + length <= dayEnd) {
        blocks.push({
          kind,
          id: `auto-break-${item.task.id}-last`,
          startMin: at,
          endMin: at + length,
          index: 0,
          afterId: blockIds[blockIds.length - 1],
        });
        cursor = at + length;
      }
    }

    placements.push({
      taskId: item.task.id,
      startMin: placedStart,
      endMin: taskEnd,
      blockIds,
      pomodoros: count,
      pinned: false,
      quadrant: item.quadrant,
    });
  }

  // Nothing follows the very last block → that rest slot is not reserved.
  const tail = blocks[blocks.length - 1];
  if (tail && tail.kind !== 'focus') {
    blocks.pop();
  }

  // ── 3. Chronological order, merging slots that share a range ─────────────
  blocks.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || (a.kind === 'focus' ? -1 : 1));

  const merged: ScheduleBlock[] = [];
  const remap = new Map<string, string>();

  for (const block of blocks) {
    const previous = merged[merged.length - 1];
    if (
      block.kind === 'focus' &&
      previous?.kind === 'focus' &&
      previous.startMin === block.startMin &&
      previous.endMin === block.endMin
    ) {
      for (const id of block.taskIds) {
        if (!previous.taskIds.includes(id)) previous.taskIds.push(id);
      }
      previous.pinned = previous.pinned || block.pinned;
      previous.continued = previous.continued || block.continued;
      remap.set(block.id, previous.id);
      continue;
    }
    if (block.kind === 'focus') {
      merged.push({ ...block, taskIds: [...block.taskIds] });
    } else {
      merged.push({ ...block });
    }
  }

  let focusIndex = 0;
  for (const block of merged) {
    if (block.kind === 'focus') {
      block.index = ++focusIndex;
    } else {
      const after = merged.find(candidate => candidate.id === block.afterId);
      block.index = after && after.kind === 'focus' ? after.index : focusIndex;
    }
  }

  const fixedPlacements: PlacedTask[] = placements.map(placement => ({
    ...placement,
    blockIds: [...new Set(placement.blockIds.map(id => remap.get(id) ?? id))],
  }));

  const startBound = fixedPlacements.length
    ? Math.min(dayStart, ...fixedPlacements.map(placement => placement.startMin))
    : dayStart;
  const endBound = fixedPlacements.length
    ? Math.max(dayEnd, ...fixedPlacements.map(placement => placement.endMin))
    : dayEnd;

  const focusBlocks = merged.filter((block): block is FocusBlock => block.kind === 'focus');
  const breakBlocks = merged.filter((block): block is BreakBlock => block.kind !== 'focus');

  return {
    blocks: merged,
    placements: fixedPlacements,
    unscheduled,
    viewStartMin: Math.floor(startBound / 60) * 60,
    viewEndMin: Math.ceil(endBound / 60) * 60,
    totals: {
      focusMinutes: focusBlocks.reduce((sum, block) => sum + (block.endMin - block.startMin), 0),
      breakMinutes: breakBlocks.reduce((sum, block) => sum + (block.endMin - block.startMin), 0),
      pomodoros: focusBlocks.length,
      breaks: breakBlocks.length,
      tasks: fixedPlacements.length,
    },
  };
}
