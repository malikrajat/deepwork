import { PomodoroSession } from '../models/session.model';

/**
 * What a day's blocks say and where they sit.
 *
 * The component owns the markup and the styles; every decision about a block's
 * label, its times and its height is here, because Angular's JIT compiler — the
 * only one available under Vitest — cannot resolve signal inputs, so a component
 * test cannot hand `TimelineBarComponent` a list of sessions at all (see
 * `tests/unit/timeline-bar.component.spec.ts`).
 */

/** One minute is one pixel, so the day is `TOTAL_HOURS * HOUR_HEIGHT_PX` tall. */
export const HOUR_HEIGHT_PX = 60;
export const TOTAL_HOURS = 24;
/** Shorter than this and a block is smaller than the line of text it would hold. */
export const MIN_LABEL_HEIGHT_PX = 8;

export type TimelineBlockType = 'work' | 'short-break' | 'long-break';

export interface TimelineBlock {
  id: string;
  type: TimelineBlockType;
  taskName: string;
  /**
   * The session's own times — `10:15 – 10:40` — carried on the card itself.
   * The tooltip holds the same range, but hover is the one gesture a touch
   * screen does not have, and the range is what a timeline is read for.
   */
  timeLabel: string;
  tooltip: string;
  topPx: number;
  heightPx: number;
  active: boolean;
  /**
   * Running blocks only: the height of the whole time the session is booked
   * for, or null once the elapsed bar has grown past it. The elapsed bar is
   * drawn solid on top of this, so mid-session the block occupies its real 25
   * minutes with a highlighted part inside it, rather than reading as a stub
   * that grew out of nowhere.
   */
  plannedHeightPx: number | null;
}

/** A task, as far as a block's label is concerned. */
export interface BlockTask {
  id: string;
  title: string;
}

/** The session running right now, as the timeline needs to know it. */
export interface RunningSession {
  type: string;
  startedAt: string | null;
  elapsedSec: number;
  /** How long the session was booked for. */
  plannedSec: number;
  taskId: string | null;
}

/** Convert a moment into a pixel offset from the top of the canvas. */
export function timeToPixel(date: Date): number {
  const fractionalHours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  return fractionalHours * HOUR_HEIGHT_PX;
}

/** `10:15 – 10:40` — one label for the times a block covers. */
export function formatTimeRange(start: Date, end: Date): string {
  return `${formatClock(start)} – ${formatClock(end)}`;
}

function formatClock(moment: Date): string {
  return moment.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** What a block is called when no task was chosen for it. */
export function labelForType(type: string): string {
  if (type === 'work') return 'Focus';
  if (type === 'short-break') return 'Short Break';
  return 'Long Break';
}

/**
 * Completed sessions as blocks.
 *
 * One block per session and no merging: every session the database holds is
 * drawn independently, so task names survive a user switching tasks mid-flow.
 * Breaks are left off — the timeline is read as the stretches of work in a day.
 */
export function buildSessionBlocks(
  sessions: PomodoroSession[],
  tasks: BlockTask[],
): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];

  for (const session of sessions) {
    if (session.type !== 'work') continue;
    const durationSec = session.durationActual;
    if (durationSec <= 0) continue;

    const start = new Date(session.startedAt);
    const end = new Date(start.getTime() + durationSec * 1000);
    const task = session.taskId ? tasks.find((t) => t.id === session.taskId) : null;
    const taskName = task?.title ?? labelForType(session.type);
    const timeLabel = formatTimeRange(start, end);

    blocks.push({
      id: session.id,
      type: session.type,
      taskName,
      timeLabel,
      tooltip: `${taskName}\n${timeLabel} (${Math.round(durationSec / 60)}m)`,
      topPx: timeToPixel(start),
      heightPx: Math.max(2, (durationSec / 3600) * HOUR_HEIGHT_PX),
      active: false,
      plannedHeightPx: null,
    });
  }

  return blocks;
}

/**
 * The block for the session running right now — which grows live as the timer
 * ticks — or null when nothing is running.
 */
export function buildActiveBlock(
  running: RunningSession,
  tasks: BlockTask[],
  now: Date,
): TimelineBlock | null {
  if (!running.startedAt || running.elapsedSec <= 0) return null;
  // Only focus sessions are drawn; a break is not a block on this timeline.
  if (running.type !== 'work') return null;

  const start = new Date(running.startedAt);
  const task = running.taskId ? tasks.find((t) => t.id === running.taskId) : null;
  // No "..." built into the string: a task-less session used to be labelled
  // `Focus...` with a literal dot-dot-dot that no amount of width took away.
  // The CSS ellipsis on `.block-label` shortens a label now.
  const taskName = task?.title ?? labelForType(running.type);
  const timeLabel = formatTimeRange(start, now);
  const mins = Math.floor(running.elapsedSec / 60);
  const secs = running.elapsedSec % 60;
  const heightPx = Math.max(4, (running.elapsedSec / 3600) * HOUR_HEIGHT_PX);

  // The whole time the session was booked for, so a running session takes up
  // its real 25 minutes on the day rather than only the part already run.
  const plannedHeightPx = (running.plannedSec / 3600) * HOUR_HEIGHT_PX;

  return {
    id: 'active-session',
    type: running.type as TimelineBlockType,
    taskName,
    timeLabel,
    tooltip: `${taskName}\n${timeLabel}\n${mins}m ${secs}s elapsed`,
    topPx: timeToPixel(start),
    heightPx,
    active: true,
    plannedHeightPx: plannedHeightPx > heightPx ? plannedHeightPx : null,
  };
}
