/**
 * Insights engine.
 *
 * Pure functions that turn the raw records (pomodoro sessions, tasks, habits,
 * habit check-ins, journal entries) into the numbers, series and plain-language
 * takeaways the Analytics / Habits / Journal pages show.
 *
 * Everything is computed from data the app already stores — no estimates, no
 * invented metrics — and every function takes `now` so results are deterministic.
 */

export interface SessionLike {
  type: string;
  durationActual: number;
  startedAt: string;
  interrupted?: boolean;
}

export interface TaskLike {
  id?: string;
  status: string;
  quadrant: string | null;
  priority: number;
  deadline?: string | null;
  createdAt: string;
  completedAt: string | null;
  updatedAt?: string;
}

export interface HabitLike {
  id: string;
  name: string;
  icon: string;
  createdAt: string;
}

export interface HabitEntryLike {
  habitId: string;
  completedAt: string;
}

export interface JournalLike {
  date: string;
  content: string;
}

export interface BarDatum {
  label: string;
  value: number;
  display: string;
  /** 0-100, relative to the largest bar in the series. */
  percent: number;
  highlight?: boolean;
}

export interface HeatCell {
  date: string;
  minutes: number;
  level: 0 | 1 | 2 | 3 | 4;
  label: string;
}

export interface Kpi {
  key: string;
  label: string;
  value: string;
  /** Percentage change against the previous equal-length period, null when new. */
  deltaPercent: number | null;
  /** Sparkline series, oldest → newest. */
  trend: number[];
  hint: string;
}

export interface HabitStat {
  id: string;
  name: string;
  icon: string;
  completionPercent: number;
  currentStreak: number;
  bestStreak: number;
  totalCompletions: number;
  /** Oldest → newest, one entry per day of the window. */
  days: boolean[];
}

export interface JournalStats {
  entries: number;
  words: number;
  averageWords: number;
  currentStreak: number;
  longestStreak: number;
  /** Days written in the last 30 days, as a percentage. */
  consistencyPercent: number;
  weeks: { label: string; entries: number; words: number }[];
  bestWeekday: { label: string; averageWords: number } | null;
}

export interface QuadrantStat {
  key: string;
  label: string;
  color: string;
  total: number;
  done: number;
  completionPercent: number;
  focusMinutes: number;
}

export interface AnalyticsReport {
  kpis: Kpi[];
  focusByHour: BarDatum[];
  peakWindow: { fromHour: number; toHour: number; sharePercent: number } | null;
  focusByWeekday: BarDatum[];
  heatmap: HeatCell[];
  heatmapWeeks: string[][];
  taskFlow: { label: string; created: number; completed: number }[];
  quadrants: QuadrantStat[];
  habits: HabitStat[];
  journal: JournalStats;
  insights: string[];
  totals: {
    focusMinutes: number;
    focusMinutesPrevious: number;
    sessions: number;
    completedTasks: number;
    createdTasks: number;
    openTasks: number;
    overdueTasks: number;
    activeDays: number;
    focusStreak: number;
    bestDayLabel: string;
    bestDayMinutes: number;
    averageSessionMinutes: number;
    abandonedPercent: number;
  };
}

// ── Date helpers (local days — what the user experienced) ───────────────────

export function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dayOfIso(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : localDay(date);
}

export function addDays(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDay(date);
}

/** Monday-first week start. */
export function weekStart(key: string): string {
  const date = new Date(`${key}T00:00:00`);
  const shift = (date.getDay() + 6) % 7;
  return addDays(key, -shift);
}

function minutesBetween(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00`).getTime();
  const to = new Date(`${toKey}T00:00:00`).getTime();
  return Math.round((to - from) / 86_400_000);
}

function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

function shortDay(key: string): string {
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

// ── Sessions ────────────────────────────────────────────────────────────────

function workSessions(sessions: SessionLike[]): SessionLike[] {
  return sessions.filter(session => session.type === 'work');
}

function minutesByDay(sessions: SessionLike[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const session of workSessions(sessions)) {
    const key = dayOfIso(session.startedAt);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + session.durationActual / 60);
  }
  return map;
}

function sumRange(byDay: Map<string, number>, fromKey: string, days: number): number {
  let total = 0;
  for (let i = 0; i < days; i++) total += byDay.get(addDays(fromKey, i)) ?? 0;
  return total;
}

/** Consecutive days with focus time, ending today (or yesterday if today is empty). */
export function focusStreak(byDay: Map<string, number>, today: string): number {
  let cursor = byDay.has(today) ? today : addDays(today, -1);
  if (!byDay.has(cursor)) return 0;
  let streak = 0;
  while (byDay.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(days: boolean[]): number {
  let best = 0;
  let run = 0;
  for (const day of days) {
    run = day ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

export function currentStreak(days: boolean[], todayIndex: number): number {
  let streak = 0;
  let index = todayIndex;
  // A day that is still in progress should not break the streak.
  if (index >= 0 && !days[index]) index--;
  while (index >= 0 && days[index]) {
    streak++;
    index--;
  }
  return streak;
}

// ── Habits ──────────────────────────────────────────────────────────────────

export function buildHabitStats(
  habits: HabitLike[],
  entries: HabitEntryLike[],
  now: Date,
  windowDays = 30
): HabitStat[] {
  const today = localDay(now);
  const start = addDays(today, -(windowDays - 1));
  const perHabit = new Map<string, Set<string>>();

  for (const entry of entries) {
    const key = dayOfIso(entry.completedAt);
    if (!key) continue;
    const set = perHabit.get(entry.habitId) ?? new Set<string>();
    set.add(key);
    perHabit.set(entry.habitId, set);
  }

  return habits
    .map(habit => {
      const done = perHabit.get(habit.id) ?? new Set<string>();
      const days: boolean[] = [];
      for (let i = 0; i < windowDays; i++) days.push(done.has(addDays(start, i)));

      // Streak window looks at every recorded day, not just the 30-day window.
      const dayKeys = [...done].sort();
      const allDays: boolean[] = [];
      if (dayKeys.length) {
        const first = dayKeys[0];
        const span = Math.min(minutesBetween(first, today) + 1, 400);
        for (let i = 0; i < span; i++) allDays.push(done.has(addDays(first, i)));
      }

      const completed = days.filter(Boolean).length;
      return {
        id: habit.id,
        name: habit.name,
        icon: habit.icon,
        completionPercent: Math.round((completed / windowDays) * 100),
        currentStreak: currentStreak(allDays, allDays.length - 1),
        bestStreak: longestStreak(allDays),
        totalCompletions: done.size,
        days,
      };
    })
    .sort((a, b) => b.completionPercent - a.completionPercent || a.name.localeCompare(b.name));
}

// ── Journal ─────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function buildJournalStats(journal: JournalLike[], now: Date, weeks = 12): JournalStats {
  const today = localDay(now);
  const byDate = new Map<string, number>();
  let words = 0;

  for (const entry of journal) {
    const wordsInEntry = countWords(entry.content);
    if (wordsInEntry === 0) continue;
    byDate.set(entry.date, wordsInEntry);
    words += wordsInEntry;
  }

  const streakDays: boolean[] = [];
  const span = Math.min(400, Math.max(30, byDate.size ? minutesBetween([...byDate.keys()].sort()[0], today) + 1 : 30));
  for (let i = 0; i < span; i++) streakDays.push(byDate.has(addDays(today, -(span - 1 - i))));

  const last30 = streakDays.slice(-30);
  const written30 = last30.filter(Boolean).length;

  const buckets: { label: string; entries: number; words: number }[] = [];
  const thisWeek = weekStart(today);
  for (let i = weeks - 1; i >= 0; i--) {
    const from = addDays(thisWeek, -7 * i);
    const to = addDays(from, 6);
    let entryCount = 0;
    let wordCount = 0;
    for (const [date, dayWords] of byDate) {
      if (date >= from && date <= to) {
        entryCount++;
        wordCount += dayWords;
      }
    }
    buckets.push({
      label: new Date(`${from}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      entries: entryCount,
      words: wordCount,
    });
  }

  const byWeekday = new Map<number, { words: number; days: number }>();
  for (const [date, dayWords] of byDate) {
    const weekday = new Date(`${date}T00:00:00`).getDay();
    const bucket = byWeekday.get(weekday) ?? { words: 0, days: 0 };
    bucket.words += dayWords;
    bucket.days += 1;
    byWeekday.set(weekday, bucket);
  }
  let bestWeekday: JournalStats['bestWeekday'] = null;
  for (const [weekday, bucket] of byWeekday) {
    const average = bucket.words / bucket.days;
    if (!bestWeekday || average > bestWeekday.averageWords) {
      bestWeekday = {
        label: new Date(2024, 0, 7 + weekday).toLocaleDateString(undefined, { weekday: 'long' }),
        averageWords: Math.round(average),
      };
    }
  }

  return {
    entries: byDate.size,
    words,
    averageWords: byDate.size ? Math.round(words / byDate.size) : 0,
    currentStreak: currentStreak(streakDays, streakDays.length - 1),
    longestStreak: longestStreak(streakDays),
    consistencyPercent: Math.round((written30 / 30) * 100),
    weeks: buckets,
    bestWeekday,
  };
}

// ── Tasks ───────────────────────────────────────────────────────────────────

const QUADRANTS: { key: string; label: string; color: string }[] = [
  { key: 'urgent-important', label: 'Q1 · Do First', color: '#f87171' },
  { key: 'important', label: 'Q2 · Schedule', color: '#a78bfa' },
  { key: 'urgent', label: 'Q3 · Delegate', color: '#fbbf24' },
  { key: 'neither', label: 'Q4 · Eliminate', color: '#9ca3af' },
];

function completionDay(task: TaskLike): string {
  return task.completedAt ? dayOfIso(task.completedAt) : '';
}

// ── The report ──────────────────────────────────────────────────────────────

export function buildAnalytics(input: {
  sessions: SessionLike[];
  tasks: TaskLike[];
  habits: HabitLike[];
  habitEntries: HabitEntryLike[];
  journal: JournalLike[];
  now?: Date;
}): AnalyticsReport {
  const now = input.now ?? new Date();
  const today = localDay(now);
  const byDay = minutesByDay(input.sessions);
  const totalFocus = [...byDay.values()].reduce((sum, value) => sum + value, 0);

  const last7 = sumRange(byDay, addDays(today, -6), 7);
  const previous7 = sumRange(byDay, addDays(today, -13), 7);

  // ── Sparkline series for the KPI cards ───────────────────────────────────
  const dailySeries: number[] = [];
  for (let i = 13; i >= 0; i--) dailySeries.push(Math.round(byDay.get(addDays(today, -i)) ?? 0));

  const completedByDay = new Map<string, number>();
  const createdByDay = new Map<string, number>();
  for (const task of input.tasks) {
    const created = dayOfIso(task.createdAt);
    if (created) createdByDay.set(created, (createdByDay.get(created) ?? 0) + 1);
    const completed = completionDay(task);
    if (completed) completedByDay.set(completed, (completedByDay.get(completed) ?? 0) + 1);
  }

  const completedLast7 = sumRange(completedByDay, addDays(today, -6), 7);
  const completedPrevious7 = sumRange(completedByDay, addDays(today, -13), 7);

  const activeDays = byDay.size;
  const streak = focusStreak(byDay, today);

  // ── Focus by hour, with the peak two-hour window ─────────────────────────
  const hourMinutes = new Array(24).fill(0);
  for (const session of workSessions(input.sessions)) {
    const started = new Date(session.startedAt);
    if (Number.isNaN(started.getTime())) continue;
    hourMinutes[started.getHours()] += session.durationActual / 60;
  }
  const hourMax = Math.max(1, ...hourMinutes);
  const focusByHour: BarDatum[] = hourMinutes.map((minutes, hour) => ({
    label: String(hour).padStart(2, '0'),
    value: minutes,
    display: `${Math.round(minutes)}m`,
    percent: (minutes / hourMax) * 100,
  }));

  let peakWindow: AnalyticsReport['peakWindow'] = null;
  if (totalFocus > 0) {
    let bestStart = 0;
    let bestSum = -1;
    for (let hour = 0; hour < 23; hour++) {
      const sum = hourMinutes[hour] + hourMinutes[hour + 1];
      if (sum > bestSum) {
        bestSum = sum;
        bestStart = hour;
      }
    }
    if (bestSum > 0) {
      for (const bar of focusByHour) {
        const hour = Number(bar.label);
        bar.highlight = hour === bestStart || hour === bestStart + 1;
      }
      peakWindow = {
        fromHour: bestStart,
        toHour: bestStart + 2,
        sharePercent: Math.round((bestSum / totalFocus) * 100),
      };
    }
  }

  // ── Focus by weekday ─────────────────────────────────────────────────────
  const weekdayMinutes = new Array(7).fill(0);
  const weekdayDays = new Array(7).fill(0);
  const seenDays = new Set<string>();
  for (let i = 0; i < 84; i++) {
    const key = addDays(today, -i);
    const weekday = new Date(`${key}T00:00:00`).getDay();
    weekdayDays[weekday] += 1;
    if (seenDays.has(key)) continue;
    seenDays.add(key);
  }
  for (const [key, minutes] of byDay) {
    const weekday = new Date(`${key}T00:00:00`).getDay();
    weekdayMinutes[weekday] += minutes;
  }
  const weekdayAverages = weekdayMinutes.map((minutes, index) =>
    weekdayDays[index] ? minutes / weekdayDays[index] : 0
  );
  const weekdayMax = Math.max(1, ...weekdayAverages);
  const focusByWeekday: BarDatum[] = weekdayAverages.map((average, index) => ({
    label: new Date(2024, 0, 7 + index).toLocaleDateString(undefined, { weekday: 'short' }),
    value: average,
    display: formatDuration(average),
    percent: (average / weekdayMax) * 100,
    highlight: index === now.getDay(),
  }));

  // ── 12-week heatmap ──────────────────────────────────────────────────────
  const heatWeeks: string[][] = [];
  const heatStart = addDays(weekStart(today), -7 * 11);
  for (let week = 0; week < 12; week++) {
    const days: string[] = [];
    for (let day = 0; day < 7; day++) days.push(addDays(heatStart, week * 7 + day));
    heatWeeks.push(days);
  }
  const heatValues = [...byDay.values()];
  const heatPeak = Math.max(1, ...heatValues);
  void heatPeak;
  const heatmap: HeatCell[] = heatWeeks.flat().map(date => {
    const minutes = Math.round(byDay.get(date) ?? 0);
    // Absolute levels, not relative to the best day: the colour then means
    // "how many pomodoros did I finish", and stays comparable week to week.
    const level: HeatCell['level'] =
      minutes === 0 ? 0 : minutes < 25 ? 1 : minutes < 50 ? 2 : minutes < 100 ? 3 : 4;
    return { date, minutes, level, label: `${shortDay(date)} · ${formatDuration(minutes)} focused` };
  });

  // ── Task flow, per week for 8 weeks ──────────────────────────────────────
  const taskFlow: AnalyticsReport['taskFlow'] = [];
  const thisWeek = weekStart(today);
  for (let i = 7; i >= 0; i--) {
    const from = addDays(thisWeek, -7 * i);
    const to = addDays(from, 6);
    let created = 0;
    let completed = 0;
    for (const [date, count] of createdByDay) if (date >= from && date <= to) created += count;
    for (const [date, count] of completedByDay) if (date >= from && date <= to) completed += count;
    taskFlow.push({
      label: new Date(`${from}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      created,
      completed,
    });
  }

  // ── Quadrants ────────────────────────────────────────────────────────────
  const focusByTask = new Map<string, number>();
  for (const session of workSessions(input.sessions)) {
    const taskId = (session as SessionLike & { taskId?: string }).taskId;
    if (!taskId) continue;
    focusByTask.set(taskId, (focusByTask.get(taskId) ?? 0) + session.durationActual / 60);
  }
  const quadrants: QuadrantStat[] = QUADRANTS.map(quadrant => {
    const tasks = input.tasks.filter(task => task.quadrant === quadrant.key);
    const done = tasks.filter(task => task.status === 'done').length;
    const focusMinutes = tasks.reduce(
      (sum, task) => sum + (focusByTask.get(task.id ?? '') ?? 0),
      0
    );
    return {
      key: quadrant.key,
      label: quadrant.label,
      color: quadrant.color,
      total: tasks.length,
      done,
      completionPercent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
      focusMinutes,
    };
  });

  const habits = buildHabitStats(input.habits, input.habitEntries, now);
  const journal = buildJournalStats(input.journal, now);

  const openTasks = input.tasks.filter(task => task.status !== 'done');
  const overdueTasks = openTasks.filter(task => !!task.deadline && task.deadline < today).length;

  const workList = workSessions(input.sessions);
  const interrupted = workList.filter(session => session.interrupted).length;

  let bestDayLabel = '—';
  let bestDayMinutes = 0;
  for (const [date, minutes] of byDay) {
    if (minutes > bestDayMinutes) {
      bestDayMinutes = minutes;
      bestDayLabel = shortDay(date);
    }
  }

  // ── KPI cards ────────────────────────────────────────────────────────────
  const kpis: Kpi[] = [
    {
      key: 'focus7',
      label: 'Focus · last 7 days',
      value: formatDuration(last7),
      deltaPercent: previous7 > 0 ? Math.round(((last7 - previous7) / previous7) * 100) : null,
      trend: dailySeries,
      hint: `Previous 7 days: ${formatDuration(previous7)}`,
    },
    {
      key: 'completed7',
      label: 'Tasks closed · last 7 days',
      value: String(completedLast7),
      deltaPercent: completedPrevious7 > 0
        ? Math.round(((completedLast7 - completedPrevious7) / completedPrevious7) * 100)
        : null,
      trend: buildCountTrend(completedByDay, today, 14),
      hint: `${input.tasks.filter(task => task.status === 'done').length} closed in total`,
    },
    {
      key: 'streak',
      label: 'Focus streak',
      value: streak === 1 ? '1 day' : `${streak} days`,
      deltaPercent: null,
      trend: dailySeries,
      hint: `${activeDays} active day${activeDays === 1 ? '' : 's'} so far`,
    },
    {
      key: 'completion',
      label: 'Completion rate · 30 days',
      value: `${completionRate(input.tasks, today, 30)}%`,
      deltaPercent: null,
      trend: dailySeries,
      hint: `${openTasks.length} still open · ${overdueTasks} overdue`,
    },
    {
      key: 'habits',
      label: 'Habit consistency · 30 days',
      value: habits.length
        ? `${Math.round(habits.reduce((sum, habit) => sum + habit.completionPercent, 0) / habits.length)}%`
        : '—',
      deltaPercent: null,
      trend: dailySeries,
      hint: habits.length ? `${habits.length} habit${habits.length === 1 ? '' : 's'} tracked` : 'No habits yet',
    },
    {
      key: 'journal',
      label: 'Journal · 12 weeks',
      value: String(journal.entries),
      deltaPercent: null,
      trend: journal.weeks.map(week => week.entries),
      hint: journal.entries
        ? `${journal.words.toLocaleString()} words · ${journal.currentStreak}-day streak`
        : 'Nothing written yet',
    },
  ];

  return {
    kpis,
    focusByHour,
    peakWindow,
    focusByWeekday,
    heatmap,
    heatmapWeeks: heatWeeks,
    taskFlow,
    quadrants,
    habits,
    journal,
    insights: buildInsights({
      today,
      byDay,
      last7,
      previous7,
      peakWindow,
      focusByWeekday,
      weekdayAverages,
      tasks: input.tasks,
      quadrants,
      habits,
      journal,
      journalDays: new Set(
        input.journal.filter(entry => entry.content.trim().length > 0).map(entry => entry.date)
      ),
      streak,
      overdueTasks,
      abandonedPercent: workList.length ? Math.round((interrupted / workList.length) * 100) : 0,
    }),
    totals: {
      focusMinutes: totalFocus,
      focusMinutesPrevious: previous7,
      sessions: workList.length,
      completedTasks: input.tasks.filter(task => task.status === 'done').length,
      createdTasks: input.tasks.length,
      openTasks: openTasks.length,
      overdueTasks,
      activeDays,
      focusStreak: streak,
      bestDayLabel,
      bestDayMinutes: Math.round(bestDayMinutes),
      averageSessionMinutes: workList.length
        ? Math.round(workList.reduce((sum, session) => sum + session.durationActual / 60, 0) / workList.length)
        : 0,
      abandonedPercent: workList.length ? Math.round((interrupted / workList.length) * 100) : 0,
    },
  };
}

function buildCountTrend(byDay: Map<string, number>, today: string, days: number): number[] {
  const series: number[] = [];
  for (let i = days - 1; i >= 0; i--) series.push(byDay.get(addDays(today, -i)) ?? 0);
  return series;
}

function completionRate(tasks: TaskLike[], today: string, days: number): number {
  const from = addDays(today, -(days - 1));
  const created = tasks.filter(task => {
    const key = dayOfIso(task.createdAt);
    return key >= from && key <= today;
  });
  if (created.length) {
    const done = created.filter(task => task.status === 'done').length;
    return Math.round((done / created.length) * 100);
  }
  // Fall back to everything that is closed when nothing was created in the window.
  const done = tasks.filter(task => task.status === 'done').length;
  return tasks.length ? Math.round((done / tasks.length) * 100) : 0;
}

/**
 * Plain-language takeaways. Only stated when the data supports them, so the
 * page never claims something the numbers do not show.
 */
function buildInsights(context: {
  today: string;
  byDay: Map<string, number>;
  last7: number;
  previous7: number;
  peakWindow: AnalyticsReport['peakWindow'];
  focusByWeekday: BarDatum[];
  weekdayAverages: number[];
  tasks: TaskLike[];
  quadrants: QuadrantStat[];
  habits: HabitStat[];
  journal: JournalStats;
  journalDays: Set<string>;
  streak: number;
  overdueTasks: number;
  abandonedPercent: number;
}): string[] {
  const insights: string[] = [];
  const { peakWindow, last7, previous7 } = context;

  if (peakWindow && peakWindow.sharePercent >= 20) {
    insights.push(
      `Your sharpest window is ${String(peakWindow.fromHour).padStart(2, '0')}:00–${String(peakWindow.toHour).padStart(2, '0')}:00 — ${peakWindow.sharePercent}% of all your focus time lands there. Protect it.`
    );
  }

  if (previous7 > 0) {
    const delta = Math.round(((last7 - previous7) / previous7) * 100);
    insights.push(
      delta === 0
        ? `Focus time is flat against last week (${formatDuration(last7)} vs ${formatDuration(previous7)}).`
        : `Focus time is ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)}% versus last week (${formatDuration(last7)} vs ${formatDuration(previous7)}).`
    );
  }

  const sortedWeekdays = context.weekdayAverages
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const weakest = sortedWeekdays[0];
  const strongest = sortedWeekdays[sortedWeekdays.length - 1];
  if (weakest && strongest && strongest.value > 0) {
    const weakLabel = context.focusByWeekday[weakest.index].label;
    const strongLabel = context.focusByWeekday[strongest.index].label;
    insights.push(
      `${strongLabel} is your strongest day (${formatDuration(strongest.value)} on average) and ${weakLabel} the weakest (${formatDuration(weakest.value)}). Consider moving deep work off ${weakLabel}.`
    );
  }

  const weekAgo = addDays(context.today, -6);
  const createdThisWeek = context.tasks.filter(task => {
    const key = dayOfIso(task.createdAt);
    return key >= weekAgo && key <= context.today;
  });
  const closedThisWeek = createdThisWeek.filter(task => task.status === 'done').length;
  if (createdThisWeek.length) {
    const percent = Math.round((closedThisWeek / createdThisWeek.length) * 100);
    insights.push(
      `You closed ${closedThisWeek} of the ${createdThisWeek.length} tasks you created this week (${percent}%).`
    );
  }

  if (context.overdueTasks > 0) {
    insights.push(
      `${context.overdueTasks} task${context.overdueTasks === 1 ? ' is' : 's are'} past the deadline — the fastest win is to re-date or drop them.`
    );
  }

  const heaviestQuadrant = [...context.quadrants].sort((a, b) => b.total - a.total)[0];
  if (heaviestQuadrant && heaviestQuadrant.total > 0 && heaviestQuadrant.completionPercent < 40) {
    insights.push(
      `${heaviestQuadrant.label} holds ${heaviestQuadrant.total} tasks but only ${heaviestQuadrant.completionPercent}% are done — it is where your backlog lives.`
    );
  }

  if (context.habits.length) {
    const best = context.habits[0];
    const worst = context.habits[context.habits.length - 1];
    if (best.completionPercent > 0) {
      insights.push(
        `Best habit: ${best.name} at ${best.completionPercent}% over 30 days (${best.currentStreak}-day streak).`
      );
    }
    if (worst && worst !== best && worst.completionPercent < 50) {
      insights.push(
        `${worst.name} is slipping at ${worst.completionPercent}% — a smaller daily target usually fixes that faster than more motivation.`
      );
    }
  }

  if (context.journal.entries) {
    insights.push(
      `You journalled ${context.journal.entries} day${context.journal.entries === 1 ? '' : 's'}, averaging ${context.journal.averageWords} words${context.journal.currentStreak > 1 ? `, ${context.journal.currentStreak} days in a row` : ''}.`
    );

    // Correlation worth acting on: focus on journalled vs non-journalled days.
    const correlation = journalFocusCorrelation(context.byDay, context.journalDays);
    const difference = correlation.journalledAverage - correlation.otherAverage;
    if (
      correlation.journalledDays >= 3 &&
      correlation.otherDays >= 3 &&
      Math.abs(difference) >= 10
    ) {
      insights.push(
        difference > 0
          ? `On days you journal you focus ${difference} min longer on average (${correlation.journalledAverage}m vs ${correlation.otherAverage}m) — the review seems to set up the day.`
          : `You focus ${Math.abs(difference)} min less on journalling days (${correlation.journalledAverage}m vs ${correlation.otherAverage}m) — worth checking whether writing is eating focus time.`
      );
    }
  }

  if (context.streak > 1) {
    insights.push(`You have focused ${context.streak} days in a row — the habit is doing the work.`);
  }

  if (context.abandonedPercent >= 25) {
    insights.push(
      `${context.abandonedPercent}% of your focus sessions were interrupted. Shorter blocks (or silencing notifications) usually lift that.`
    );
  }

  return insights;
}

/** Focus minutes on journalled vs non-journalled days — an actionable correlation. */
export function journalFocusCorrelation(
  byDay: Map<string, number>,
  journalDays: Iterable<string>
): { journalledAverage: number; otherAverage: number; journalledDays: number; otherDays: number } {
  const journalled = new Set(journalDays);
  let withJournal = 0;
  let withJournalDays = 0;
  let withoutJournal = 0;
  let withoutJournalDays = 0;

  for (const [date, minutes] of byDay) {
    if (journalled.has(date)) {
      withJournal += minutes;
      withJournalDays++;
    } else {
      withoutJournal += minutes;
      withoutJournalDays++;
    }
  }

  return {
    journalledAverage: withJournalDays ? Math.round(withJournal / withJournalDays) : 0,
    otherAverage: withoutJournalDays ? Math.round(withoutJournal / withoutJournalDays) : 0,
    journalledDays: withJournalDays,
    otherDays: withoutJournalDays,
  };
}
