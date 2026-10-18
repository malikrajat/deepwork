/**
 * The Time page's arithmetic.
 *
 * A focus session records the task it was for, but a recurring task arrives as
 * a new row every day: "Code review" on Monday and "Code review" on Tuesday are
 * two task ids with the same title. This engine therefore groups sessions by the
 * work's title, not by the row id, so the page can answer the question the user
 * actually asks — *how much of my life has code review taken?* — instead of
 * showing one line per daily copy.
 *
 * Everything here is pure and takes `now`, which is what lets the periods,
 * buckets and readings be tested without a clock.
 */

import { Task } from '../models/task.model';
import {
  TimeBucket,
  TimeBucketGrain,
  TimeCadence,
  TimeGroup,
  TimePeriod,
  TimePeriodKey,
  TimeReport,
  TimeReportInput,
  TimeSessionView,
  TimeTotals,
} from '../models/time-report.model';

const DAY_MS = 86_400_000;

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Group key for sessions the timer recorded without a task. */
export const UNTASKED_KEY = '__untasked__';
export const UNTASKED_TITLE = 'Untasked focus';

const CADENCE_LABELS: Record<TimeCadence, string> = {
  daily: 'Repeats daily',
  weekly: 'Repeats weekly',
  monthly: 'Repeats monthly',
  occasional: 'Repeats occasionally',
  'multi-day': 'Multi-day',
  'one-off': 'One-off',
  untasked: 'Not linked to a task',
};

/** The cadences that mean the work keeps coming back. */
const REPEATING: readonly TimeCadence[] = ['daily', 'weekly', 'monthly', 'occasional'];

/** Periods, in the order the page offers them. */
export const TIME_PERIODS: readonly { key: TimePeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Dates (local days, as everywhere the user reads a date)
// ─────────────────────────────────────────────────────────────────────────────

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** A local `Date` as `YYYY-MM-DD`. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parse `YYYY-MM-DD` as local midnight (not UTC, which shifts the day). */
function parseDay(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(iso: string, days: number): string {
  const date = parseDay(iso);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
function dayDiff(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / DAY_MS);
}

function dayMonth(iso: string): string {
  const date = parseDay(iso);
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

function fullDay(iso: string): string {
  const date = parseDay(iso);
  return `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

function shortRange(from: string, to: string): string {
  if (from === to) return dayMonth(from);
  const start = parseDay(from);
  const end = parseDay(to);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;
  }
  return `${dayMonth(from)} – ${dayMonth(to)}`;
}

/** "19 Sep 2026" for a session timestamp or a day key. */
export function formatDayLabel(value: string): string {
  const date = value.length === 10 ? parseDay(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** "10:05" in the reader's own locale for a session timestamp. */
export function formatTimeOfDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * A duration the way a person reads one: "45m", "2h 15m", "<1m", "0m".
 *
 * Rounded to the minute because the page is about where the hours went, not
 * about seconds; a session shorter than a minute still reads as time spent.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m';
  if (seconds < 60) return '<1m';
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Periods and buckets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A `YYYY-MM-DD` string that names a day that exists, or null.
 *
 * A custom range arrives from a date input, which is normally valid, but the
 * maths must not build a month of buckets out of `2026-02-30` if it is not.
 */
function realDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return dayKey(parseDay(day)) === day ? day : null;
}

/** The bucket size that keeps a span of this length readable. */
function grainForSpan(span: number): TimeBucketGrain {
  return span <= 31 ? 'day' : span <= 180 ? 'week' : span <= 1100 ? 'month' : 'year';
}

const BUCKET_HEADERS: Record<TimeBucketGrain, string> = {
  hour: 'Time of day',
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

/**
 * The window a period key means, and how to divide it.
 *
 * `today` is one day; `week` is the last seven days; `month` and `year` are the
 * current calendar month and year to date. `all` starts at the first session.
 * `custom` uses the two supplied bounds (normalised, not in the future, and
 * never inverted). The longer windows pick a grain that keeps their chart
 * readable: days for a month, weeks for half a year, months for a couple of
 * years, years beyond that.
 */
export function timePeriodFor(
  key: TimePeriodKey,
  now: Date = new Date(),
  earliestDay: string | null = null,
  customFrom: string | null = null,
  customTo: string | null = null,
): TimePeriod {
  const to = dayKey(now);

  switch (key) {
    case 'today':
      return {
        key,
        label: 'Today',
        description: 'today',
        from: to,
        to,
        grain: 'hour',
        bucketHeader: 'Time of day',
      };
    case 'week':
      return {
        key,
        label: 'This week',
        description: 'the last seven days',
        from: addDays(to, -6),
        to,
        grain: 'day',
        bucketHeader: 'Day',
      };
    case 'month':
      return {
        key,
        label: 'This month',
        description: 'this month',
        from: `${to.slice(0, 7)}-01`,
        to,
        grain: 'week',
        bucketHeader: 'Week',
      };
    case 'year':
      return {
        key,
        label: 'This year',
        description: 'this year',
        from: `${to.slice(0, 4)}-01-01`,
        to,
        grain: 'month',
        bucketHeader: 'Month',
      };
    case 'custom': {
      const first = realDay(customFrom) ?? addDays(to, -6);
      const second = realDay(customTo) ?? to;
      let from = first <= second ? first : second;
      let end = first <= second ? second : first;
      // "Time spent" cannot have happened tomorrow; a future bound is clamped
      // to today rather than drawing an empty chart into the future.
      if (end > to) end = to;
      if (from > end) from = end;
      const grain: TimeBucketGrain = from === end ? 'hour' : grainForSpan(dayDiff(from, end));
      return {
        key: 'custom',
        label: 'Custom range',
        description: 'the selected range',
        from,
        to: end,
        grain,
        bucketHeader: BUCKET_HEADERS[grain],
      };
    }
    case 'all':
    default: {
      const from = earliestDay && earliestDay < to ? earliestDay : to;
      const grain = grainForSpan(dayDiff(from, to));
      return {
        key: 'all',
        label: 'All time',
        description: `all time, by ${grain}`,
        from,
        to,
        grain,
        bucketHeader: BUCKET_HEADERS[grain],
      };
    }
  }
}

/** Bucket boundaries for a period, without any task's numbers attached. */
function bucketDefinitions(
  from: string,
  to: string,
  grain: TimeBucketGrain,
  today: string,
  nowHour: number,
): TimeBucket[] {
  const buckets: TimeBucket[] = [];

  if (grain === 'hour') {
    // A single day is read as six four-hour blocks: enough resolution to see
    // whether the work happened in the morning or the evening, few enough to
    // label under a bar. The "current" ring belongs to the block holding now.
    for (let fromHour = 0; fromHour < 24; fromHour += 4) {
      const toHour = fromHour + 3;
      buckets.push({
        key: `${from}-h${fromHour}`,
        label: `${pad(fromHour)}:00–${pad(toHour)}:59`,
        axisLabel: pad(fromHour),
        from,
        to,
        fromHour,
        toHour,
        seconds: 0,
        sessions: 0,
        days: 0,
        percent: 0,
        isCurrent: from === today && nowHour >= fromHour && nowHour <= toHour,
      });
    }
    return buckets;
  }

  if (grain === 'day') {
    for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
      const date = parseDay(cursor);
      buckets.push({
        key: cursor,
        label: fullDay(cursor),
        axisLabel: String(date.getDate()),
        from: cursor,
        to: cursor,
        seconds: 0,
        sessions: 0,
        days: 0,
        percent: 0,
        isCurrent: cursor === today,
      });
    }
    return buckets;
  }

  if (grain === 'week') {
    let cursor = from;
    let index = 1;
    while (cursor <= to) {
      const proposedEnd = addDays(cursor, 6);
      const end = proposedEnd > to ? to : proposedEnd;
      buckets.push({
        key: `w-${cursor}`,
        label: shortRange(cursor, end),
        axisLabel: `W${index}`,
        from: cursor,
        to: end,
        seconds: 0,
        sessions: 0,
        days: 0,
        percent: 0,
        isCurrent: today >= cursor && today <= end,
      });
      cursor = addDays(end, 1);
      index++;
    }
    return buckets;
  }

  if (grain === 'month') {
    let cursor = `${from.slice(0, 7)}-01`;
    while (cursor <= to) {
      const start = parseDay(cursor);
      const next = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const nextKey = dayKey(next);
      const end = nextKey > to ? to : addDays(nextKey, -1);
      const bucketFrom = cursor < from ? from : cursor;
      buckets.push({
        key: cursor.slice(0, 7),
        label: `${MONTHS_LONG[start.getMonth()]} ${start.getFullYear()}`,
        axisLabel: MONTHS_SHORT[start.getMonth()],
        from: bucketFrom,
        to: end,
        seconds: 0,
        sessions: 0,
        days: 0,
        percent: 0,
        isCurrent: today >= bucketFrom && today <= end,
      });
      cursor = nextKey;
    }
    return buckets;
  }

  let cursor = `${from.slice(0, 4)}-01-01`;
  while (cursor <= to) {
    const start = parseDay(cursor);
    const next = new Date(start.getFullYear() + 1, 0, 1);
    const nextKey = dayKey(next);
    const end = nextKey > to ? to : addDays(nextKey, -1);
    const bucketFrom = cursor < from ? from : cursor;
    buckets.push({
      key: cursor.slice(0, 4),
      label: String(start.getFullYear()),
      axisLabel: String(start.getFullYear()),
      from: bucketFrom,
      to: end,
      seconds: 0,
      sessions: 0,
      days: 0,
      percent: 0,
      isCurrent: today >= bucketFrom && today <= end,
    });
    cursor = nextKey;
  }
  return buckets;
}

// ─────────────────────────────────────────────────────────────────────────────
// Grouping
// ─────────────────────────────────────────────────────────────────────────────

function normaliseTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function isRepeating(cadence: TimeCadence): boolean {
  return REPEATING.includes(cadence);
}

/**
 * The rhythm a piece of work shows.
 *
 * A configured recurrence is the strongest answer and is read from any task
 * sharing the title. Without one, the gaps between the days actually worked
 * decide: daily if the median gap is at most two and a half days, then weekly,
 * monthly and "occasionally". Three or more days always show a rhythm — a
 * weekly review kept on one task is still weekly. Two days are ambiguous: two
 * task rows make a routine, one row is a `multi-day` piece of work, and a
 * single task on a single day is a `one-off`.
 */
function cadenceFor(
  key: string,
  taskIds: readonly string[],
  days: readonly string[],
  tasksByTitle: ReadonlyMap<string, Task[]>,
): TimeCadence {
  if (key === UNTASKED_KEY) return 'untasked';

  const configured = (tasksByTitle.get(key) ?? []).find((task) => task.recurrence !== null);
  if (configured?.recurrence) {
    return configured.recurrence.frequency;
  }

  const gaps = days.slice(1).map((day, index) => dayDiff(days[index], day));
  const usualGap = median(gaps);

  const byGap = (): TimeCadence => {
    if (usualGap <= 2.5) return 'daily';
    if (usualGap <= 10) return 'weekly';
    if (usualGap <= 40) return 'monthly';
    return 'occasional';
  };

  // Three or more days of work show a rhythm whether or not the rows were
  // separate copies: a weekly review kept on one task still repeats weekly.
  if (days.length >= 3) return byGap();

  // Two days can be one task worked on twice (a multi-day piece of work) or two
  // copies of a routine. The number of task rows is what tells them apart.
  if (days.length === 2) {
    return taskIds.length > 1 ? byGap() : 'multi-day';
  }

  return 'one-off';
}

function groupByTitle(sessions: readonly TimeSessionView[]): Map<string, TimeSessionView[]> {
  const groups = new Map<string, TimeSessionView[]>();
  for (const session of sessions) {
    const key = normaliseTitle(session.title) || UNTASKED_KEY;
    const list = groups.get(key);
    if (list) list.push(session);
    else groups.set(key, [session]);
  }
  return groups;
}

function sumSeconds(sessions: readonly TimeSessionView[]): number {
  return sessions.reduce((total, session) => total + session.seconds, 0);
}

function distinctDays(sessions: readonly TimeSessionView[]): string[] {
  return [...new Set(sessions.map((session) => session.day))].sort();
}

function buildGroup(
  key: string,
  all: TimeSessionView[],
  periodFrom: string,
  periodTo: string,
  bucketDefs: readonly TimeBucket[],
  tasksByTitle: ReadonlyMap<string, Task[]>,
): TimeGroup | null {
  const periodSessions = all.filter(
    (session) => session.day >= periodFrom && session.day <= periodTo,
  );
  if (!periodSessions.length) return null;

  // The groups are built newest-first, so the first title is the latest naming.
  const title = key === UNTASKED_KEY ? UNTASKED_TITLE : all[0].title;
  const days = distinctDays(all);
  const taskIds = [
    ...new Set(all.map((session) => session.taskId).filter((id): id is string => id !== null)),
  ];
  const first = all[all.length - 1];
  const last = all[0];
  const spanDays = dayDiff(first.day, last.day) + 1;
  const totalSeconds = sumSeconds(all);
  const totalSessionCount = all.length;
  const totalDays = days.length;
  const cadence = cadenceFor(key, taskIds, days, tasksByTitle);

  const periodDays = distinctDays(periodSessions).length;
  const buckets = bucketDefs.map((definition) => {
    const inside = periodSessions.filter((session) => {
      if (session.day < definition.from || session.day > definition.to) return false;
      if (definition.fromHour === undefined || definition.toHour === undefined) return true;
      return session.hour >= definition.fromHour && session.hour <= definition.toHour;
    });
    return {
      ...definition,
      seconds: sumSeconds(inside),
      sessions: inside.length,
      days: distinctDays(inside).length,
    };
  });
  const peak = Math.max(0, ...buckets.map((bucket) => bucket.seconds));
  for (const bucket of buckets) {
    bucket.percent = peak > 0 ? Math.round((bucket.seconds / peak) * 100) : 0;
  }

  return {
    key,
    title,
    isUntasked: key === UNTASKED_KEY,
    cadence,
    cadenceLabel: CADENCE_LABELS[cadence],
    totalSeconds,
    totalSessionCount,
    totalDays,
    firstAt: first.startedAt,
    lastAt: last.startedAt,
    firstDay: first.day,
    lastDay: last.day,
    spanDays,
    instanceCount: taskIds.length,
    averageSessionSeconds: totalSeconds / totalSessionCount,
    consistency: totalDays / spanDays,
    periodSeconds: sumSeconds(periodSessions),
    periodSessionCount: periodSessions.length,
    periodDays,
    periodSessions,
    buckets,
  };
}

function buildInsights(
  groups: readonly TimeGroup[],
  totals: TimeTotals,
  period: TimePeriod,
): string[] {
  if (totals.allTimeSessions === 0) return [];

  if (totals.sessions === 0) {
    return [
      `No focus sessions in ${period.description}. All time you have tracked ` +
        `${formatDuration(totals.allTimeSeconds)} across ` +
        `${plural(totals.allTimeSessions, 'session')}.`,
    ];
  }

  const lines: string[] = [];
  const top = groups[0];
  const share = totals.seconds > 0 ? top.periodSeconds / totals.seconds : 0;
  const repeats = isRepeating(top.cadence);
  lines.push(
    `${share >= 0.5 ? 'Most of this period went to' : 'Your largest tracked task this period was'} ` +
      `${top.title}: ${formatDuration(top.periodSeconds)} across ` +
      `${plural(top.periodSessionCount, 'session')} on ${plural(top.periodDays, 'day')}.` +
      (repeats
        ? ` It ${top.cadenceLabel.toLowerCase()}, so it is the work worth protecting a slot for.`
        : ''),
  );

  const repeatShare = totals.seconds > 0 ? totals.repeatSeconds / totals.seconds : 0;
  if (repeatShare >= 0.5) {
    lines.push(
      `${Math.round(repeatShare * 100)}% of this period went to work that repeats — ` +
        `${formatDuration(totals.repeatSeconds)} on ${plural(totals.repeatSessions, 'session')}.`,
    );
  } else if (totals.oneOffSeconds > 0 && totals.seconds > 0) {
    if (totals.repeatSeconds === 0) {
      lines.push(
        `Work that does not repeat took all of this period — ` +
          `${formatDuration(totals.oneOffSeconds)} of one-off, multi-day or untasked time.`,
      );
    } else {
      const nonRepeating = Math.round((totals.oneOffSeconds / totals.seconds) * 100);
      lines.push(
        `Work that does not repeat took ${nonRepeating}% of this period; ` +
          `work that repeats the other ${Math.round(repeatShare * 100)}%.`,
      );
    }
  }

  const steady = [...groups]
    .filter((group) => group.totalDays >= 3 && group.consistency >= 0.5)
    .sort((a, b) => b.consistency - a.consistency || b.totalDays - a.totalDays)[0];
  if (steady) {
    lines.push(
      `${steady.title} appears on ${plural(steady.totalDays, 'day')} of the ` +
        `${plural(steady.spanDays, 'day')} since ${formatDayLabel(steady.firstDay)} — ` +
        `${Math.round(steady.consistency * 100)}% consistency.`,
    );
  }

  if (lines.length < 3) {
    const minutes = Math.round(totals.seconds / totals.sessions / 60);
    if (minutes >= 45) {
      lines.push(
        `The average focus block was ${minutes} minutes; blocks this long are worth splitting ` +
          `if the work does not need them.`,
      );
    } else if (minutes <= 15 && totals.sessions >= 4) {
      lines.push(
        `The average focus block was ${minutes} minutes — short enough that a longer block may ` +
          `protect the work from interruptions.`,
      );
    }
  }

  return lines.slice(0, 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// The report
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Turns raw sessions into everything the page reads.
 *
 * Only work sessions count (a break is not time on a task), and a session must
 * have a readable start and a positive duration to be placed on the page.
 */
export function buildTimeReport(input: TimeReportInput): TimeReport {
  const now = input.now ?? new Date();
  const today = dayKey(now);

  const tasksById = new Map(input.tasks.map((task) => [task.id, task]));
  const tasksByTitle = new Map<string, Task[]>();
  for (const task of input.tasks) {
    const key = normaliseTitle(task.title);
    if (!key) continue;
    const list = tasksByTitle.get(key);
    if (list) list.push(task);
    else tasksByTitle.set(key, [task]);
  }

  const views: TimeSessionView[] = [];
  for (const session of input.sessions) {
    if (session.type !== 'work' || session.durationActual <= 0) continue;
    const started = new Date(session.startedAt);
    if (Number.isNaN(started.getTime())) continue;

    const task = session.taskId ? tasksById.get(session.taskId) : undefined;
    const title = (task?.title?.trim() || session.taskTitle?.trim() || '')
      .replace(/\s+/g, ' ')
      .trim();

    views.push({
      id: session.id,
      taskId: session.taskId,
      title,
      startedAt: session.startedAt,
      day: dayKey(started),
      hour: started.getHours(),
      seconds: session.durationActual,
      interrupted: session.interrupted,
    });
  }

  views.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const earliest = views.length ? views[views.length - 1].day : today;
  const period = timePeriodFor(
    input.period,
    now,
    earliest,
    input.customFrom ?? null,
    input.customTo ?? null,
  );
  const periodFrom = period.from ?? earliest;
  const periodTo = period.to;
  const bucketDefs = bucketDefinitions(periodFrom, periodTo, period.grain, today, now.getHours());

  const groups: TimeGroup[] = [];
  for (const [key, sessions] of groupByTitle(views)) {
    const group = buildGroup(key, sessions, periodFrom, periodTo, bucketDefs, tasksByTitle);
    if (group) groups.push(group);
  }
  groups.sort(
    (a, b) =>
      b.periodSeconds - a.periodSeconds ||
      b.totalSeconds - a.totalSeconds ||
      a.title.localeCompare(b.title),
  );

  const periodSessions = views.filter(
    (session) => session.day >= periodFrom && session.day <= periodTo,
  );
  const allTimeDays = distinctDays(views).length;
  const allTimeTitles = new Set(
    views.map((session) => normaliseTitle(session.title)).filter((title) => title !== ''),
  );
  const periodDays = distinctDays(periodSessions).length;
  const repeatSeconds = groups
    .filter((group) => isRepeating(group.cadence))
    .reduce((total, group) => total + group.periodSeconds, 0);
  const repeatSessions = groups
    .filter((group) => isRepeating(group.cadence))
    .reduce((total, group) => total + group.periodSessionCount, 0);
  const periodSeconds = sumSeconds(periodSessions);

  const totals: TimeTotals = {
    seconds: periodSeconds,
    sessions: periodSessions.length,
    days: periodDays,
    tasks: groups.filter((group) => !group.isUntasked).length,
    allTimeSeconds: sumSeconds(views),
    allTimeSessions: views.length,
    allTimeDays,
    allTimeTasks: allTimeTitles.size,
    repeatSeconds,
    repeatSessions,
    oneOffSeconds: Math.max(0, periodSeconds - repeatSeconds),
    oneOffSessions: Math.max(0, periodSessions.length - repeatSessions),
  };

  return {
    period,
    groups,
    totals,
    insights: buildInsights(groups, totals, period),
    hasAnySessions: views.length > 0,
  };
}
