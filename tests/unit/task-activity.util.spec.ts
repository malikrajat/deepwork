import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatActivityLabel, localDayKey } from '../../src/app/core/utils/task-activity.util';

/**
 * "Last touched" is on every task card, and it is the one label that depends on
 * *now*: it has to say "just now" a minute after an edit and still be right
 * after midnight. The clock is fixed so those boundaries can be checked.
 */

const NOW = new Date(2026, 8, 21, 18, 30, 0); // Monday 21 September 2026, 18:30 local

/** An ISO timestamp `minutes` before the fixed now. */
function ago(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

describe('task activity stamps', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('names the local day of a timestamp', () => {
    expect(localDayKey(ago(0))).toBe('2026-09-21');
    // 19:00 the previous evening is still the previous local day.
    expect(localDayKey(new Date(2026, 8, 20, 19, 0).toISOString())).toBe('2026-09-20');
  });

  it('says "unknown" rather than inventing a day for a broken timestamp', () => {
    expect(localDayKey('not a timestamp')).toBe('unknown');
    expect(localDayKey('')).toBe('unknown');
  });

  it('counts the minutes of the last hour', () => {
    expect(formatActivityLabel(ago(0))).toBe('just now');
    expect(formatActivityLabel(ago(12))).toBe('12 min ago');
    expect(formatActivityLabel(ago(59))).toBe('59 min ago');
  });

  it('shows the clock time for earlier today', () => {
    const earlier = new Date(2026, 8, 21, 9, 15, 0);

    const label = formatActivityLabel(earlier.toISOString());

    expect(label).toBe(
      earlier.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    );
  });

  it('says "Yesterday" for yesterday, with the time', () => {
    const yesterday = new Date(2026, 8, 20, 17, 45, 0);

    expect(formatActivityLabel(yesterday.toISOString())).toBe(
      `Yesterday ${yesterday.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`,
    );
  });

  it('falls back to a dated stamp for anything older', () => {
    const older = new Date(2026, 8, 3, 8, 5, 0);

    const label = formatActivityLabel(older.toISOString());

    expect(label).toContain('Sep');
    expect(label).toContain(
      older.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    );
    expect(label).not.toContain('Yesterday');
  });

  it('shows nothing for a timestamp it cannot read', () => {
    expect(formatActivityLabel('soon')).toBe('');
  });
});
