import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { DbService } from '../../core/services/db.service';
import { TaskService } from '../../core/services/task.service';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { PomodoroSession } from '../../core/models/session.model';
import {
  AnalyticsReport,
  buildAnalytics,
  journalFocusCorrelation,
  localDay,
} from '../../core/utils/insights.util';

/**
 * Analytics.
 *
 * Everything on this page is derived from records the app already keeps —
 * pomodoro sessions, tasks, habits, habit check-ins and journal entries — and
 * every number is paired with a plain-language reading of it, so the page
 * answers "what should I change?" rather than just showing charts.
 */
@Component({
  selector: 'app-analytics',
  imports: [TooltipDirective, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header animate-fade-in">
      <div>
        <h1 class="gradient-text page-title">Analytics</h1>
        <p class="page-subtitle">What your data says — and what to do about it</p>
      </div>
      <div class="header-pills">
        <span class="pill">{{ totals().focusMinutes | number: '1.0-0' }} min focused all-time</span>
        <span class="pill">{{ totals().sessions }} focus sessions</span>
      </div>
    </div>

    <!-- ── Numbers ──────────────────────────────────────────────────────── -->
    <section class="kpi-grid" aria-label="Key numbers">
      @for (kpi of report().kpis; track kpi.key) {
        <article class="kpi-card">
          <span class="kpi-label">{{ kpi.label }}</span>
          <div class="kpi-row">
            <span class="kpi-value">{{ kpi.value }}</span>
            @if (kpi.deltaPercent !== null) {
              <span
                class="kpi-delta"
                [class.up]="kpi.deltaPercent > 0"
                [class.down]="kpi.deltaPercent < 0"
                [appTooltip]="kpi.deltaPercent >= 0 ? 'More than the previous period' : 'Less than the previous period'"
              >{{ kpi.deltaPercent > 0 ? '+' : '' }}{{ kpi.deltaPercent }}%</span>
            }
          </div>
          <svg class="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
            <polyline [attr.points]="sparkPoints(kpi.trend)" />
          </svg>
          <span class="kpi-hint">{{ kpi.hint }}</span>
        </article>
      }
    </section>

    <!-- ── Readings ─────────────────────────────────────────────────────── -->
    <section class="chart-card insights-card">
      <h3 class="chart-title">What the numbers say</h3>
      @if (report().insights.length) {
        <ul class="insight-list">
          @for (line of report().insights; track line) {
            <li>{{ line }}</li>
          }
        </ul>
      } @else {
        <p class="empty-note">
          Not enough history yet. Finish a few focus sessions, close some tasks and write a journal
          entry — the readings appear as soon as there is a pattern to describe.
        </p>
      }
    </section>

    <!-- ── Consistency heatmap ──────────────────────────────────────────── -->
    <section class="chart-card">
      <h3 class="chart-title">
        Focus consistency · last 12 weeks
        <span class="title-note">each square is one day · darker = more focus</span>
      </h3>
      <div class="heatmap-wrap">
        <div class="heat-weekdays">
          @for (name of weekdayNames; track name) { <span>{{ name }}</span> }
        </div>
        <div class="heatmap">
          @for (week of report().heatmapWeeks; track $index) {
            <div class="heat-col">
              @for (date of week; track date) {
                <span
                  class="heat-cell"
                  [class]="'l' + levelFor(date)"
                  [appTooltip]="labelFor(date)"
                ></span>
              }
            </div>
          }
        </div>
      </div>
      <div class="heat-legend">
        <span class="legend-label">Less</span>
        @for (level of [0, 1, 2, 3, 4]; track level) {
          <span class="heat-cell" [class]="'l' + level"></span>
        }
        <span class="legend-label">More</span>
        <span class="legend-scale">&lt;25m · 25m · 50m · 100m+</span>
      </div>
    </section>

    <div class="two-col">
      <!-- ── Peak hours ─────────────────────────────────────────────────── -->
      <section class="chart-card">
        <h3 class="chart-title">
          When you focus
          @if (report().peakWindow; as peak) {
            <span class="title-note">
              peak {{ twoDigit(peak.fromHour) }}:00–{{ twoDigit(peak.toHour) }}:00 · {{ peak.sharePercent }}% of all focus
            </span>
          }
        </h3>
        <div class="bar-chart hours">
          @for (bar of report().focusByHour; track bar.label) {
            <div class="bar-col" [appTooltip]="bar.label + ':00 · ' + bar.display">
              <span class="bar-fill" [class.peak]="bar.highlight" [style.height.%]="bar.percent"></span>
              @if ($index % 3 === 0) { <span class="bar-label">{{ bar.label }}</span> }
            </div>
          }
        </div>
      </section>

      <!-- ── Weekdays ───────────────────────────────────────────────────── -->
      <section class="chart-card">
        <h3 class="chart-title">Average focus by weekday <span class="title-note">last 12 weeks</span></h3>
        <div class="bar-chart weekdays">
          @for (bar of report().focusByWeekday; track bar.label) {
            <div class="bar-col" [appTooltip]="bar.label + ' · ' + bar.display + ' on average'">
              <span class="bar-value">{{ bar.display }}</span>
              <span class="bar-fill" [class.today]="bar.highlight" [style.height.%]="bar.percent"></span>
              <span class="bar-label">{{ bar.label }}</span>
            </div>
          }
        </div>
      </section>
    </div>

    <div class="two-col">
      <!-- ── Task flow ──────────────────────────────────────────────────── -->
      <section class="chart-card">
        <h3 class="chart-title">Task flow <span class="title-note">created vs closed, last 8 weeks</span></h3>
        <div class="bar-chart flow">
          @for (week of report().taskFlow; track week.label) {
            <div class="bar-col wide" [appTooltip]="week.label + ' · ' + week.created + ' created, ' + week.completed + ' closed'">
              <span class="flow-pair">
                <span class="bar-fill created" [style.height.%]="flowPercent(week.created)"></span>
                <span class="bar-fill completed" [style.height.%]="flowPercent(week.completed)"></span>
              </span>
              <span class="bar-label">{{ week.label }}</span>
            </div>
          }
        </div>
        <div class="legend-row">
          <span class="legend-dot created"></span> created
          <span class="legend-dot completed"></span> closed
        </div>
      </section>

      <!-- ── Quadrants ──────────────────────────────────────────────────── -->
      <section class="chart-card">
        <h3 class="chart-title">Where your work sits <span class="title-note">Eisenhower quadrants</span></h3>
        @for (quadrant of report().quadrants; track quadrant.key) {
          <div class="quad-row">
            <span class="quad-name">{{ quadrant.label }}</span>
            <span class="quad-track">
              <span class="quad-fill" [style.width.%]="quadrant.completionPercent" [style.background]="quadrant.color"></span>
            </span>
            <span class="quad-numbers">{{ quadrant.done }}/{{ quadrant.total }} · {{ quadrant.completionPercent }}%</span>
          </div>
        }
      </section>
    </div>

    <div class="two-col">
      <!-- ── Habits ─────────────────────────────────────────────────────── -->
      <section class="chart-card">
        <h3 class="chart-title">Habit consistency <span class="title-note">last 30 days</span></h3>
        @if (report().habits.length) {
          @for (habit of report().habits; track habit.id) {
            <div class="habit-row">
              <span class="habit-icon">{{ habit.icon }}</span>
              <span class="habit-name">{{ habit.name }}</span>
              <span class="habit-dots">
                @for (done of habit.days; track $index) {
                  <span class="habit-dot" [class.done]="done"></span>
                }
              </span>
              <span class="habit-stats">
                <strong>{{ habit.completionPercent }}%</strong>
                <small>{{ habit.currentStreak }}d streak · best {{ habit.bestStreak }}d</small>
              </span>
            </div>
          }
        } @else {
          <p class="empty-note">No habits tracked yet — add one on the Habits page to see consistency here.</p>
        }
      </section>

      <!-- ── Journalling ─────────────────────────────────────────────────── -->
      <section class="chart-card">
        <h3 class="chart-title">Journalling <span class="title-note">last 12 weeks</span></h3>
        @if (report().journal.entries) {
          <div class="journal-stats">
            <div><span class="js-value">{{ report().journal.entries }}</span><span class="js-label">days written</span></div>
            <div><span class="js-value">{{ report().journal.currentStreak }}</span><span class="js-label">day streak</span></div>
            <div><span class="js-value">{{ report().journal.words | number }}</span><span class="js-label">words</span></div>
            <div><span class="js-value">{{ report().journal.averageWords }}</span><span class="js-label">avg / entry</span></div>
          </div>
          <div class="bar-chart journal">
            @for (week of report().journal.weeks; track week.label) {
              <div class="bar-col" [appTooltip]="week.label + ' · ' + week.entries + ' entries, ' + week.words + ' words'">
                <span class="bar-fill journal" [style.height.%]="journalPercent(week.words)"></span>
                @if ($index % 2 === 0) { <span class="bar-label">{{ week.label }}</span> }
              </div>
            }
          </div>
          @if (journalCorrelation(); as correlation) {
            <p class="journal-note">
              Focus averages <strong>{{ correlation.journalledAverage }}m</strong> on the
              {{ correlation.journalledDays }} days you wrote, against
              <strong>{{ correlation.otherAverage }}m</strong> on the {{ correlation.otherDays }} days you did not.
            </p>
          }
        } @else {
          <p class="empty-note">Write a journal entry to unlock these numbers.</p>
        }
      </section>
    </div>

    <!-- ── Recent sessions ──────────────────────────────────────────────── -->
    <section class="chart-card">
      <h3 class="chart-title">
        Recent focus sessions
        <span class="title-note">{{ totals().averageSessionMinutes }} min average · {{ totals().abandonedPercent }}% interrupted</span>
      </h3>
      <div class="session-list">
        @for (session of recentSessions(); track session.id) {
          <div class="session-row">
            <span class="session-type">🎯</span>
            <div class="session-info">
              <span class="session-task" [appTooltip]="session.taskName || 'No task'">{{ session.taskName || 'No task' }}</span>
              <span class="session-time">{{ minutes(session.durationActual) }} · {{ formatTime(session.startedAt) }} · {{ dayLabel(session.startedAt) }}</span>
            </div>
            @if (session.interrupted) { <span class="interrupted-badge">interrupted</span> }
          </div>
        }
        @if (recentSessions().length === 0) {
          <p class="empty-note">No sessions yet — start the timer on the Dashboard.</p>
        }
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page-header {
      margin-bottom: var(--space-lg); display: flex; align-items: flex-start;
      justify-content: space-between; gap: 12px; flex-wrap: wrap;
    }
    .page-title { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
    .page-subtitle { color: var(--color-text-muted); margin-top: 4px; font-size: 0.85rem; }
    .header-pills { display: flex; gap: 8px; flex-wrap: wrap; }
    .pill {
      font-size: 0.65rem; padding: 4px 10px; border-radius: 999px;
      background: var(--glass-bg); border: 1px solid var(--glass-border); color: var(--color-text-secondary);
    }

    /* ── KPI cards ─────────────────────────────────────────────────────── */
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: var(--space-lg); }
    .kpi-card {
      display: flex; flex-direction: column; gap: 4px; padding: 14px;
      background: var(--glass-bg); border: 1px solid rgba(139,92,246,0.1); border-radius: 14px;
    }
    .kpi-label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); }
    .kpi-row { display: flex; align-items: baseline; gap: 8px; }
    .kpi-value {
      font-size: 1.4rem; font-weight: 800;
      background: linear-gradient(135deg, #8b5cf6, #06b6d4);
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
    }
    .kpi-delta { font-size: 0.66rem; font-weight: 700; padding: 1px 6px; border-radius: 999px; }
    .kpi-delta.up { color: #34d399; background: rgba(52,211,153,0.12); }
    .kpi-delta.down { color: #fca5a5; background: rgba(248,113,113,0.12); }
    .spark { width: 100%; height: 26px; }
    .spark polyline { fill: none; stroke: rgba(139,92,246,0.7); stroke-width: 1.6; vector-effect: non-scaling-stroke; }
    .kpi-hint { font-size: 0.62rem; color: var(--color-text-muted); }

    /* ── Cards ─────────────────────────────────────────────────────────── */
    .chart-card {
      padding: 18px; border-radius: 16px; margin-bottom: var(--space-lg);
      background: var(--glass-bg); backdrop-filter: blur(12px);
      border: 1px solid rgba(139,92,246,0.08);
    }
    .chart-title {
      font-size: 0.85rem; font-weight: 700; margin-bottom: 14px; color: var(--color-text-secondary);
      display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
    }
    .title-note { font-size: 0.62rem; font-weight: 500; color: var(--color-text-muted); }
    .empty-note { font-size: 0.72rem; color: var(--color-text-muted); line-height: 1.6; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-lg); }
    .two-col > .chart-card { margin-bottom: 0; }
    .two-col { margin-bottom: var(--space-lg); }

    /* ── Insights ──────────────────────────────────────────────────────── */
    .insights-card { border-color: rgba(139,92,246,0.22); }
    .insight-list { list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .insight-list li {
      position: relative; padding-left: 18px; font-size: 0.76rem; line-height: 1.55;
      color: var(--color-text-secondary);
    }
    .insight-list li::before {
      content: ''; position: absolute; left: 4px; top: 7px; width: 6px; height: 6px;
      border-radius: 50%; background: linear-gradient(135deg, #8b5cf6, #06b6d4);
    }

    /* ── Heatmap ───────────────────────────────────────────────────────── */
    .heatmap-wrap { display: flex; gap: 6px; }
    .heat-weekdays {
      display: grid; grid-template-rows: repeat(7, 12px); gap: 3px;
      font-size: 0.55rem; color: var(--color-text-muted); align-items: center;
    }
    .heatmap { display: flex; gap: 3px; }
    .heat-col { display: grid; grid-template-rows: repeat(7, 12px); gap: 3px; }
    .heat-cell { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
    .heat-cell.l0 { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.04); }
    .heat-cell.l1 { background: rgba(139,92,246,0.28); }
    .heat-cell.l2 { background: rgba(139,92,246,0.48); }
    .heat-cell.l3 { background: rgba(139,92,246,0.7); }
    .heat-cell.l4 { background: rgba(139,92,246,0.95); box-shadow: 0 0 8px rgba(139,92,246,0.35); }
    .heat-legend { display: flex; align-items: center; gap: 4px; margin-top: 10px; }
    .legend-label { font-size: 0.58rem; color: var(--color-text-muted); }
    .legend-scale { font-size: 0.58rem; color: var(--color-text-muted); margin-left: 8px; }

    /* ── Bars ──────────────────────────────────────────────────────────── */
    .bar-chart { display: flex; align-items: flex-end; gap: 4px; height: 130px; }
    .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 3px; }
    .bar-col.wide { min-width: 40px; }
    .bar-fill {
      width: 100%; max-width: 22px; min-height: 2px; border-radius: 5px 5px 0 0;
      background: linear-gradient(to top, rgba(139,92,246,0.35), rgba(6,182,212,0.5));
      border: 1px solid rgba(139,92,246,0.2); border-bottom: none;
    }
    .bar-fill.peak { background: linear-gradient(to top, rgba(52,211,153,0.4), rgba(6,182,212,0.6)); border-color: rgba(52,211,153,0.35); }
    .bar-fill.today { background: linear-gradient(to top, rgba(251,191,36,0.35), rgba(251,191,36,0.6)); border-color: rgba(251,191,36,0.35); }
    .bar-fill.journal { background: linear-gradient(to top, rgba(236,72,153,0.3), rgba(236,72,153,0.6)); border-color: rgba(236,72,153,0.3); }
    .bar-value { font-size: 0.58rem; color: var(--color-text-muted); white-space: nowrap; }
    .bar-label { font-size: 0.58rem; color: var(--color-text-muted); }
    .flow-pair { display: flex; align-items: flex-end; gap: 3px; width: 100%; height: 100%; justify-content: center; }
    .flow-pair .bar-fill { width: 12px; }
    .bar-fill.created { background: rgba(139,92,246,0.4); }
    .bar-fill.completed { background: rgba(52,211,153,0.55); }
    .legend-row { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 0.6rem; color: var(--color-text-muted); }
    .legend-dot { width: 9px; height: 9px; border-radius: 3px; display: inline-block; margin-left: 8px; }
    .legend-dot.created { background: rgba(139,92,246,0.5); }
    .legend-dot.completed { background: rgba(52,211,153,0.6); }

    /* ── Quadrants ─────────────────────────────────────────────────────── */
    .quad-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .quad-name { font-size: 0.68rem; color: var(--color-text-secondary); width: 112px; flex-shrink: 0; }
    .quad-track { flex: 1; height: 8px; border-radius: 999px; background: rgba(255,255,255,0.06); overflow: hidden; }
    .quad-fill { display: block; height: 100%; border-radius: inherit; transition: width 0.4s ease; }
    .quad-numbers { font-size: 0.62rem; color: var(--color-text-muted); width: 92px; text-align: right; flex-shrink: 0; }

    /* ── Habits ────────────────────────────────────────────────────────── */
    .habit-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
    .habit-icon { font-size: 0.95rem; }
    .habit-name { font-size: 0.72rem; font-weight: 600; color: var(--color-text-primary); width: 92px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .habit-dots { display: flex; gap: 2px; flex: 1; flex-wrap: wrap; }
    .habit-dot { width: 7px; height: 7px; border-radius: 2px; background: rgba(255,255,255,0.07); }
    .habit-dot.done { background: rgba(52,211,153,0.75); }
    .habit-stats { display: flex; flex-direction: column; align-items: flex-end; width: 96px; flex-shrink: 0; }
    .habit-stats strong { font-size: 0.75rem; color: var(--color-text-primary); }
    .habit-stats small { font-size: 0.56rem; color: var(--color-text-muted); }

    /* ── Journal ───────────────────────────────────────────────────────── */
    .journal-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
    .journal-stats > div { display: flex; flex-direction: column; align-items: center; }
    .js-value { font-size: 1.05rem; font-weight: 800; color: var(--color-text-primary); }
    .js-label { font-size: 0.56rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .journal-note { margin-top: 12px; font-size: 0.7rem; line-height: 1.55; color: var(--color-text-secondary); }
    .journal-note strong { color: var(--color-text-primary); }

    /* ── Sessions ──────────────────────────────────────────────────────── */
    .session-list { max-height: 280px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(139,92,246,0.35) transparent; }
    .session-row { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--glass-border); }
    .session-row:last-child { border-bottom: none; }
    .session-type { font-size: 1rem; }
    .session-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .session-task { font-size: 0.78rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .session-time { font-size: 0.66rem; color: var(--color-text-muted); margin-top: 2px; }
    .interrupted-badge {
      font-size: 0.58rem; padding: 2px 8px; border-radius: 10px; flex-shrink: 0;
      background: rgba(239,68,68,0.1); color: rgb(248,113,113); border: 1px solid rgba(239,68,68,0.2);
    }

    @media (max-width: 1100px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .two-col { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .kpi-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class AnalyticsComponent implements OnInit {
  private readonly db = inject(DbService);
  private readonly taskService = inject(TaskService);

  readonly sessions = signal<PomodoroSession[]>([]);
  private readonly habits = signal<any[]>([]);
  private readonly habitEntries = signal<any[]>([]);
  private readonly journal = signal<any[]>([]);

  protected readonly weekdayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  /** One pass over all records produces every number on the page. */
  readonly report = computed<AnalyticsReport>(() =>
    buildAnalytics({
      sessions: this.sessions(),
      tasks: this.taskService.tasks(),
      habits: this.habits(),
      habitEntries: this.habitEntries(),
      journal: this.journal(),
    })
  );

  protected readonly totals = computed(() => this.report().totals);

  private readonly heatByDate = computed(() => {
    const map = new Map<string, { level: number; label: string }>();
    for (const cell of this.report().heatmap) map.set(cell.date, { level: cell.level, label: cell.label });
    return map;
  });

  readonly recentSessions = computed(() => {
    const tasks = this.taskService.tasks();
    return this.sessions()
      .filter(session => session.type === 'work')
      .slice(0, 40)
      .map(session => ({
        ...session,
        taskName: session.taskId ? tasks.find(task => task.id === session.taskId)?.title ?? 'Unknown' : null,
      }));
  });

  readonly journalCorrelation = computed(() => {
    const byDay = new Map<string, number>();
    for (const session of this.sessions()) {
      if (session.type !== 'work') continue;
      const date = new Date(session.startedAt);
      if (Number.isNaN(date.getTime())) continue;
      const key = localDay(date);
      byDay.set(key, (byDay.get(key) ?? 0) + session.durationActual / 60);
    }
    if (!byDay.size) return null;
    const match = journalFocusCorrelation(
      byDay,
      this.journal().filter(entry => entry.content?.trim()).map(entry => entry.date)
    );
    return match.journalledDays >= 3 && match.otherDays >= 3 ? match : null;
  });

  async ngOnInit(): Promise<void> {
    await this.db.init();
    await this.taskService.loadTasks();
    const [sessions, habits, habitEntries, journal] = await Promise.all([
      this.db.getAllSessions(),
      this.db.getHabits(),
      this.db.getAllHabitEntries(),
      this.db.getJournalEntries(),
    ]);
    this.sessions.set(sessions);
    this.habits.set(habits);
    this.habitEntries.set(habitEntries);
    this.journal.set(journal);
  }

  // ── Template helpers ──────────────────────────────────────────────────────
  protected levelFor(date: string): number {
    return this.heatByDate().get(date)?.level ?? 0;
  }

  protected labelFor(date: string): string {
    return this.heatByDate().get(date)?.label ?? date;
  }

  protected twoDigit(value: number): string {
    return String(value).padStart(2, '0');
  }

  protected sparkPoints(values: number[]): string {
    if (!values.length) return '';
    const max = Math.max(1, ...values);
    const step = values.length > 1 ? 100 / (values.length - 1) : 100;
    return values
      .map((value, index) => `${(index * step).toFixed(1)},${(23 - (value / max) * 21).toFixed(1)}`)
      .join(' ');
  }

  private flowMax = computed(() =>
    Math.max(1, ...this.report().taskFlow.flatMap(week => [week.created, week.completed]))
  );

  protected flowPercent(value: number): number {
    return (value / this.flowMax()) * 100;
  }

  private journalMax = computed(() =>
    Math.max(1, ...this.report().journal.weeks.map(week => week.words))
  );

  protected journalPercent(words: number): number {
    return (words / this.journalMax()) * 100;
  }

  protected minutes(seconds: number): string {
    const total = Math.round(seconds / 60);
    return total >= 60 ? `${Math.floor(total / 60)}h ${total % 60}m` : `${total}m`;
  }

  protected formatTime(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  protected dayLabel(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const today = localDay(new Date());
    if (localDay(date) === today) return 'today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (localDay(date) === localDay(yesterday)) return 'yesterday';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
}
