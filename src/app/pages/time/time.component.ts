import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DbService } from '../../core/services/db.service';
import { TaskService } from '../../core/services/task.service';
import { PomodoroSession } from '../../core/models/session.model';
import { TimeCadence, TimePeriodKey } from '../../core/models/time-report.model';
import {
  TIME_PERIODS,
  buildTimeReport,
  dayKey,
  formatDayLabel,
  formatDuration,
  formatTimeOfDay,
} from '../../core/utils/time-report.util';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { VirtualWindowDirective } from '../../shared/directives/virtual-window.directive';

/**
 * Time, grouped by the work it paid for.
 *
 * The app already recorded every focus session against a task; what it could
 * not answer was "how much of my life has code review taken?", because a
 * repeating task arrives as a new row each day. This page groups those rows by
 * title, so a daily copy adds to the same total, and puts the answer in three
 * places at once: the all-time figure (till today), the period in view, and the
 * shape of the period as a bar per day/week/month/year.
 *
 * It is deliberately a page rather than another card on Analytics: it is about
 * one question, and the answer is a list long enough to read.
 */
@Component({
  selector: 'app-time',
  imports: [RouterLink, TooltipDirective, VirtualWindowDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown.escape)': 'onEscape($event)',
  },
  template: `
    <div class="time-layout">
      <div class="page-header">
        <div class="header-left">
          <h1 class="gradient-text page-title">Time by Task</h1>
          <span class="date-label">{{ currentPeriod().label }} · where your focus went</span>
        </div>
        <div class="header-stats">
          <span class="stat">{{ duration(totals().allTimeSeconds) }} tracked all time</span>
        </div>
      </div>

      <div class="period-bar" role="tablist" aria-label="Time period">
        @for (option of periodOptions; track option.key) {
          <button
            type="button"
            class="period-tab"
            role="tab"
            [class.active]="period() === option.key"
            [attr.aria-selected]="period() === option.key"
            (click)="setPeriod(option.key)"
          >
            {{ option.label }}
          </button>
        }
        @if (periodRange()) {
          <span class="period-range">{{ periodRange() }}</span>
        }
      </div>

      @if (period() === 'custom') {
        <div class="custom-range" aria-label="Custom date range">
          <label class="date-field">
            <span>From</span>
            <input
              type="date"
              [value]="customFrom()"
              [max]="maxDate"
              (change)="onCustomFrom($event)"
            />
          </label>
          <span class="range-dash" aria-hidden="true">→</span>
          <label class="date-field">
            <span>To</span>
            <input type="date" [value]="customTo()" [max]="maxDate" (change)="onCustomTo($event)" />
          </label>
          <span class="range-note">Pick one day for a single day, or two for a span.</span>
        </div>
      }

      @if (!hasAnySessions()) {
        <div class="empty-state">
          <svg
            width="46"
            height="46"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(139,92,246,0.35)"
            stroke-width="1.4"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12,6 12,12 16,14" />
          </svg>
          <h2>No focus time tracked yet</h2>
          <p>
            Start a focus session from the Dashboard and link it to a task. The time lands here,
            grouped by the work it paid for — including the work that comes back every day.
          </p>
          <a class="btn-primary" routerLink="/">Go to Dashboard</a>
        </div>
      } @else {
        <section class="summary-grid" aria-label="Time totals">
          <article class="summary-card accent">
            <span class="summary-label">Focused time</span>
            <strong class="summary-value">{{ duration(totals().seconds) }}</strong>
            <span class="summary-hint">{{
              period() === 'custom' ? 'selected range' : currentPeriod().label.toLowerCase()
            }}</span>
          </article>
          <article class="summary-card">
            <span class="summary-label">Sessions</span>
            <strong class="summary-value">{{ totals().sessions }}</strong>
            <span class="summary-hint">
              {{ totals().sessions === 1 ? 'one focus block' : 'focus blocks' }}
            </span>
          </article>
          <article class="summary-card">
            <span class="summary-label">Active days</span>
            <strong class="summary-value">{{ totals().days }}</strong>
            <span class="summary-hint">
              {{ totals().days === 1 ? 'day touched' : 'days touched' }}
            </span>
          </article>
          <article class="summary-card">
            <span class="summary-label">Tasks with time</span>
            <strong class="summary-value">{{ totals().tasks }}</strong>
            <span class="summary-hint">grouped by title</span>
          </article>
        </section>

        @if (insights().length > 0) {
          <section class="insight-card" aria-label="What this period says">
            <div class="insight-head">
              <span class="eyebrow">What this says</span>
              <h2>Read the shape, not only the total.</h2>
            </div>
            <ul class="insight-list">
              @for (line of insights(); track line) {
                <li>{{ line }}</li>
              }
            </ul>
          </section>
        }

        <div class="list-toolbar">
          <div class="search-box">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search the work you spend time on..."
              [value]="searchQuery()"
              (input)="onSearchInput($event)"
            />
            @if (searchQuery()) {
              <button
                class="clear-search"
                type="button"
                aria-label="Clear search"
                (click)="clearSearch()"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            }
          </div>
          <span class="result-count">
            {{ filteredGroups().length }} of {{ groups().length }} with time
          </span>
        </div>

        <div class="chart-legend" aria-label="Bar colour key">
          <span class="legend-item"><i class="swatch repeating"></i>Repeating work</span>
          <span class="legend-item"><i class="swatch one-off"></i>One-off</span>
          <span class="legend-item"><i class="swatch multi-day"></i>Multi-day</span>
          <span class="legend-item"><i class="swatch untasked"></i>Untasked</span>
          <span class="legend-item legend-current">
            <i class="swatch current"></i>Ring = current
            {{ currentPeriod().bucketHeader.toLowerCase() }}
          </span>
        </div>

        @if (groups().length === 0) {
          <div class="empty-state compact">
            <h2>No focus time {{ currentPeriod().description }}</h2>
            <p>
              You have {{ duration(totals().allTimeSeconds) }} tracked all time across
              {{ totals().allTimeSessions }} sessions. Try a wider window.
            </p>
            <button class="btn-primary" type="button" (click)="setPeriod('all')">
              Show all time
            </button>
          </div>
        } @else if (filteredGroups().length === 0) {
          <div class="empty-state compact">
            <h2>No tasks match this search</h2>
            <p>Try a different word, or clear the search.</p>
            <button class="btn-primary" type="button" (click)="clearSearch()">Clear search</button>
          </div>
        } @else {
          <div
            class="time-list"
            #timeViewport
            tabindex="0"
            role="region"
            aria-label="Task time list — scroll for more"
            [appWindow]="filteredGroups().length"
            [rowHeight]="rowHeight()"
            #timeWindow="appWindow"
          >
            <div
              class="time-list-canvas"
              [style.height.px]="timeWindow.canvasHeight(filteredGroups().length)"
            >
              @for (row of timeWindow.visible(filteredGroups()); track row.item.key) {
                @let group = row.item;
                <div class="time-row" [style.top.px]="row.top">
                  <article class="time-card" [class.selected]="selectedKey() === group.key">
                    <button
                      type="button"
                      class="time-card-head"
                      aria-haspopup="dialog"
                      (click)="openGroup(group.key)"
                    >
                      <span class="identity">
                        <span class="task-title">{{ group.title }}</span>
                        <span class="badges">
                          <span [class]="'cadence ' + group.cadence">
                            {{ group.cadenceLabel }}
                          </span>
                          @if (group.instanceCount > 1) {
                            <span class="meta">{{ group.instanceCount }} task rows</span>
                          }
                          @if (group.isUntasked) {
                            <span class="meta">link a task next time</span>
                          }
                        </span>
                      </span>

                      <span class="totals">
                        <strong>{{ duration(group.totalSeconds) }}</strong>
                        <span>
                          {{ group.totalSessionCount }}
                          {{ group.totalSessionCount === 1 ? 'session' : 'sessions' }} ·
                          {{ group.totalDays }} {{ group.totalDays === 1 ? 'day' : 'days' }}
                        </span>
                      </span>

                      <span class="timeframe">
                        <span class="tf-row">
                          <span class="tf-label">First</span>
                          <span>{{ dayLabel(group.firstAt) }}</span>
                        </span>
                        <span class="tf-row">
                          <span class="tf-label">Last</span>
                          <span>{{ dayLabel(group.lastAt) }}</span>
                        </span>
                      </span>

                      <span class="chevron" aria-hidden="true">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <polyline points="9,6 15,12 9,18" />
                        </svg>
                      </span>
                    </button>

                    <div class="chart-wrap">
                      <div
                        class="chart"
                        [class]="'chart ' + toneOf(group)"
                        role="img"
                        [attr.aria-label]="chartLabel(group)"
                      >
                        @for (bucket of group.buckets; track bucket.key) {
                          <span
                            class="chart-col"
                            [appTooltip]="
                              bucket.label +
                              ' · ' +
                              duration(bucket.seconds) +
                              (bucket.isCurrent
                                ? ' · current ' + currentPeriod().bucketHeader.toLowerCase()
                                : '')
                            "
                          >
                            <span
                              class="bar"
                              [class.empty]="bucket.seconds === 0"
                              [class.current]="bucket.isCurrent"
                              [style.height.%]="bucket.percent"
                            ></span>
                            <span class="axis" [class.current]="bucket.isCurrent">{{
                              bucket.axisLabel
                            }}</span>
                          </span>
                        }
                      </div>
                      <p class="chart-note">
                        {{ currentPeriod().label }} · by
                        {{ currentPeriod().bucketHeader.toLowerCase() }} ·
                        {{ duration(group.periodSeconds) }} in this window · open for the breakdown
                      </p>
                    </div>
                  </article>
                </div>
              }
            </div>
          </div>
        }

        <p class="method-note">
          Time is counted from work sessions — finished or stopped early — that were linked to a
          task. Repeating work is grouped by title, so each daily copy adds to the same row; a task
          that has been deleted keeps the title recorded on its sessions. Only the rows in view are
          in the page — scroll the list to reach the rest.
        </p>

        @if (selectedGroup(); as group) {
          <div class="detail-backdrop" (click)="closeDetail()" aria-hidden="true"></div>
          <aside
            class="detail-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="time-detail-title"
          >
            <header class="detail-sheet-head">
              <div class="detail-sheet-title">
                <span class="eyebrow">{{ group.cadenceLabel }}</span>
                <h2 id="time-detail-title">{{ group.title }}</h2>
                <p>
                  {{ dayLabel(group.firstDay) }} – {{ dayLabel(group.lastDay) }} ·
                  {{ group.totalSessionCount }}
                  {{ group.totalSessionCount === 1 ? 'session' : 'sessions' }} ·
                  {{ group.totalDays }} {{ group.totalDays === 1 ? 'day' : 'days' }}
                </p>
              </div>
              <button
                class="close-detail"
                type="button"
                aria-label="Close task details"
                #detailClose
                (click)="closeDetail()"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </header>

            <div class="detail-sheet-body">
              <div class="detail-grid">
                <div class="detail-stat">
                  <span class="detail-label">This period</span>
                  <strong>{{ duration(group.periodSeconds) }}</strong>
                  <small>
                    {{ group.periodSessionCount }}
                    {{ group.periodSessionCount === 1 ? 'session' : 'sessions' }} ·
                    {{ group.periodDays }} {{ group.periodDays === 1 ? 'day' : 'days' }}
                  </small>
                </div>
                <div class="detail-stat">
                  <span class="detail-label">All time</span>
                  <strong>{{ duration(group.totalSeconds) }}</strong>
                  <small>
                    {{ group.totalSessionCount }}
                    {{ group.totalSessionCount === 1 ? 'session' : 'sessions' }} ·
                    {{ group.totalDays }} {{ group.totalDays === 1 ? 'day' : 'days' }}
                  </small>
                </div>
                <div class="detail-stat">
                  <span class="detail-label">Average</span>
                  <strong>{{ duration(group.averageSessionSeconds) }}</strong>
                  <small>per session</small>
                </div>
                <div class="detail-stat">
                  <span class="detail-label">Consistency</span>
                  <strong>{{ percent(group.consistency) }}%</strong>
                  <small>{{ group.totalDays }} of {{ group.spanDays }} days in the span</small>
                </div>
              </div>

              <div class="detail-column">
                <h3>
                  Breakdown by {{ currentPeriod().bucketHeader.toLowerCase() }}
                  <span>{{ duration(group.periodSeconds) }}</span>
                </h3>
                <div class="table-scroll">
                  <table class="breakdown-table">
                    <thead>
                      <tr>
                        <th scope="col">{{ currentPeriod().bucketHeader }}</th>
                        <th scope="col">Time</th>
                        <th scope="col">Sessions</th>
                        <th scope="col">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (bucket of group.buckets; track bucket.key) {
                        <tr [class.current]="bucket.isCurrent">
                          <td>{{ bucket.label }}</td>
                          <td>{{ duration(bucket.seconds) }}</td>
                          <td>{{ bucket.sessions }}</td>
                          <td>{{ bucket.days }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="detail-column">
                <h3>
                  Recent sessions
                  <span>{{ group.periodSessionCount }} in this period</span>
                </h3>
                <ul class="session-list">
                  @for (session of group.periodSessions.slice(0, 8); track session.id) {
                    <li>
                      <span class="session-when">
                        {{ dayLabel(session.startedAt) }} · {{ timeLabel(session.startedAt) }}
                      </span>
                      <span class="session-amount">{{ duration(session.seconds) }}</span>
                      @if (session.interrupted) {
                        <span class="session-flag">Stopped early</span>
                      }
                    </li>
                  }
                </ul>
                @if (group.periodSessionCount > 8) {
                  <p class="more-sessions">
                    + {{ group.periodSessionCount - 8 }} more in this period
                  </p>
                }
              </div>
            </div>
          </aside>
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .time-layout {
        display: flex;
        flex-direction: column;
        gap: 18px;
        /* Room at the end for the floating quick-add button, so the last row is
           not read through it. */
        padding-bottom: 88px;
      }

      .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .header-left {
        display: flex;
        align-items: baseline;
        gap: 12px;
        flex-wrap: wrap;
      }
      .page-title {
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -0.5px;
      }
      .date-label {
        font-size: 12px;
        color: var(--color-text-muted);
      }
      .header-stats {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
      }
      .stat {
        font-size: 12px;
        color: var(--color-text-muted);
        background: rgba(139, 92, 246, 0.08);
        padding: 4px 12px;
        border-radius: 20px;
        white-space: nowrap;
      }

      /* ── The period selector ─────────────────────────────────────────── */
      .period-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .period-tab {
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        color: var(--color-text-secondary);
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        border-radius: 999px;
        padding: 7px 14px;
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease,
          border-color 0.15s ease;
      }
      .period-tab:hover {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary);
      }
      .period-tab.active {
        color: #fff;
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        border-color: transparent;
      }
      .period-range {
        margin-left: 4px;
        font-size: 11px;
        color: var(--color-text-muted);
      }

      /* ── Totals ──────────────────────────────────────────────────────── */
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }
      .summary-card {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 14px 16px;
        border-radius: 14px;
        background: var(--glass-bg);
        border: 1px solid rgba(139, 92, 246, 0.1);
        min-width: 0;
      }
      .summary-card.accent {
        background:
          linear-gradient(var(--glass-bg), var(--glass-bg)) padding-box,
          linear-gradient(135deg, rgba(139, 92, 246, 0.6), rgba(6, 182, 212, 0.35)) border-box;
        border: 1px solid transparent;
      }
      .summary-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-text-muted);
      }
      .summary-value {
        font-size: 24px;
        font-weight: 800;
        line-height: 1.15;
        background: linear-gradient(135deg, #8b5cf6, #06b6d4);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .summary-hint {
        font-size: 11px;
        color: var(--color-text-muted);
      }

      /* ── The reading ─────────────────────────────────────────────────── */
      .insight-card {
        position: relative;
        padding: 18px 20px;
        border-radius: 16px;
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.09), rgba(6, 182, 212, 0.05));
        border: 1px solid rgba(139, 92, 246, 0.22);
        overflow: hidden;
      }
      .insight-card::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 3px;
        background: linear-gradient(180deg, #8b5cf6, #06b6d4);
      }
      .insight-head {
        display: flex;
        align-items: baseline;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }
      .eyebrow {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-accent-primary);
      }
      .insight-head h2 {
        font-size: 15px;
        font-weight: 700;
        color: var(--color-text-primary);
      }
      .insight-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 7px;
      }
      .insight-list li {
        position: relative;
        padding-left: 16px;
        font-size: 13px;
        line-height: 1.55;
        color: var(--color-text-secondary);
      }
      .insight-list li::before {
        content: '';
        position: absolute;
        left: 2px;
        top: 8px;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--color-accent-secondary);
      }

      /* ── Toolbar ─────────────────────────────────────────────────────── */
      .list-toolbar {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .search-box {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 36px;
        background: var(--control-bg);
        border: 1px solid rgba(139, 92, 246, 0.12);
        border-radius: 8px;
        padding: 0 12px;
        flex: 1;
        max-width: 340px;
      }
      .search-box svg {
        color: var(--color-text-muted);
        flex-shrink: 0;
      }
      .search-box input {
        width: 100%;
        height: 20px;
        min-height: 0;
        padding: 0;
        line-height: 1.4;
        background: transparent;
        border: none;
        outline: none;
        color: var(--color-text-primary);
        font-size: 13px;
      }
      .search-box input::placeholder {
        color: var(--color-text-muted);
      }
      .clear-search {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border: none;
        background: transparent;
        color: var(--color-text-muted);
        cursor: pointer;
        padding: 2px;
      }
      .clear-search:hover {
        color: var(--color-text-primary);
      }
      .result-count {
        font-size: 11px;
        color: var(--color-text-muted);
      }

      /* ── Custom range ────────────────────────────────────────────────── */
      .custom-range {
        display: flex;
        align-items: flex-end;
        gap: 10px;
        flex-wrap: wrap;
        padding: 12px 14px;
        border-radius: 12px;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
      }
      .date-field {
        display: flex;
        flex-direction: column;
        gap: 5px;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-text-muted);
      }
      .date-field input {
        padding: 7px 9px;
        border-radius: 8px;
        border: 1px solid var(--glass-border);
        background: var(--control-bg);
        color: var(--color-text-primary);
        font: inherit;
        font-size: 12px;
        letter-spacing: normal;
        text-transform: none;
      }
      .date-field input:focus-visible {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: 1px;
      }
      .range-dash {
        padding-bottom: 8px;
        color: var(--color-text-muted);
      }
      .range-note {
        padding-bottom: 8px;
        font-size: 10px;
        color: var(--color-text-muted);
      }

      /* ── Colour legend ───────────────────────────────────────────────── */
      .chart-legend {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
        padding: 0 2px;
        font-size: 10px;
        color: var(--color-text-muted);
      }
      .legend-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .swatch {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 3px;
        background: #8b5cf6;
        flex-shrink: 0;
      }
      .swatch.one-off {
        background: #f59e0b;
      }
      .swatch.multi-day {
        background: #38bdf8;
      }
      .swatch.untasked {
        background: #94a3b8;
      }
      .swatch.current {
        background: transparent;
        border: 1px solid #8b5cf6;
        box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.35);
      }

      /* ── The virtual task window ──────────────────────────────────────
         The list is its own scroll region and only the rows inside it are
         created. Every card is a fixed 160px (224px below 900px), so the
         directive's row pitch and the DOM can agree without measuring. */
      .time-list {
        position: relative;
        height: 60vh;
        min-height: 320px;
        max-height: 760px;
        overflow-y: auto;
        overscroll-behavior-y: contain;
        scrollbar-gutter: stable;
        padding-right: 4px;
      }
      .time-list:focus-visible {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: 2px;
        border-radius: 14px;
      }
      .time-list-canvas {
        position: relative;
        width: 100%;
      }
      .time-row {
        position: absolute;
        left: 0;
        right: 0;
        height: 176px;
      }
      .time-card {
        height: 160px;
        border-radius: 14px;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        overflow: hidden;
        transition: border-color 0.15s ease;
      }
      .time-card:hover {
        border-color: rgba(139, 92, 246, 0.25);
      }
      .time-card.selected {
        border-color: rgba(139, 92, 246, 0.45);
        background: var(--glass-bg-active);
      }
      .time-card-head {
        display: grid;
        grid-template-columns: minmax(0, 1.7fr) minmax(0, 0.9fr) minmax(0, 1.1fr) 24px;
        align-items: center;
        gap: 14px;
        width: 100%;
        padding: 14px 16px;
        font: inherit;
        text-align: left;
        background: transparent;
        border: none;
        color: inherit;
        cursor: pointer;
      }
      .identity {
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
      }
      .task-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--color-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .badges {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .cadence,
      .meta {
        font-size: 10px;
        line-height: 1;
        padding: 4px 8px;
        border-radius: 999px;
        white-space: nowrap;
      }
      .meta {
        color: var(--color-text-muted);
        border: 1px solid var(--glass-border);
      }
      .cadence {
        color: var(--color-accent-secondary);
        background: rgba(6, 182, 212, 0.1);
        border: 1px solid rgba(6, 182, 212, 0.25);
      }
      .cadence.daily,
      .cadence.weekly,
      .cadence.monthly {
        color: var(--color-accent-primary);
        background: rgba(139, 92, 246, 0.12);
        border-color: rgba(139, 92, 246, 0.3);
      }
      .cadence.one-off {
        color: var(--color-text-secondary);
        background: var(--glass-bg);
        border-color: var(--glass-border);
      }
      .cadence.multi-day {
        color: #fbbf24;
        background: rgba(251, 191, 36, 0.1);
        border-color: rgba(251, 191, 36, 0.25);
      }
      .cadence.untasked {
        color: var(--color-text-muted);
        background: transparent;
        border: 1px dashed var(--glass-border);
      }
      .totals {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }
      .totals strong {
        font-size: 17px;
        font-weight: 800;
        color: var(--color-text-primary);
      }
      .totals span {
        font-size: 11px;
        color: var(--color-text-muted);
      }
      .timeframe {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }
      .tf-row {
        display: flex;
        align-items: baseline;
        gap: 6px;
        font-size: 11px;
        color: var(--color-text-secondary);
      }
      .tf-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-text-muted);
        min-width: 28px;
      }
      .chevron {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-muted);
      }
      .time-card:hover .chevron,
      .time-card.selected .chevron {
        color: var(--color-accent-primary);
      }

      /* ── The period chart ──────────────────────────────────────────────
         One solid colour per bar, chosen by what the work is: repeating
         (violet), one-off (amber), multi-day (blue) or untasked (slate). The
         only second mark a bar can carry is a ring, and it means "this is the
         current day/week/month/year" — never a second quantity. */
      .chart-wrap {
        padding: 0 16px 12px;
      }
      .chart {
        --bar-color: #8b5cf6;
        display: flex;
        align-items: flex-end;
        gap: 3px;
        height: 54px;
      }
      .chart.one-off {
        --bar-color: #f59e0b;
      }
      .chart.multi-day {
        --bar-color: #38bdf8;
      }
      .chart.untasked {
        --bar-color: #94a3b8;
      }
      .chart-col {
        display: flex;
        flex: 1 1 0;
        flex-direction: column;
        align-items: stretch;
        justify-content: flex-end;
        gap: 4px;
        height: 100%;
        min-width: 0;
        cursor: default;
      }
      .bar {
        display: block;
        width: 100%;
        min-height: 3px;
        border-radius: 3px 3px 1px 1px;
        background: var(--bar-color);
        transition: height 0.2s ease;
      }
      .bar.empty {
        min-height: 2px;
        opacity: 0.22;
      }
      .bar.current {
        box-shadow:
          0 0 0 1px var(--bar-color),
          0 0 10px rgba(139, 92, 246, 0.35);
      }
      .axis {
        font-size: 10px;
        line-height: 1;
        color: var(--color-text-muted);
        text-align: center;
        overflow: hidden;
        text-overflow: clip;
        white-space: nowrap;
      }
      .axis.current {
        color: var(--color-text-primary);
        font-weight: 700;
      }
      .chart-note {
        margin-top: 6px;
        font-size: 10px;
        color: var(--color-text-muted);
      }

      /* ── The task detail sheet ─────────────────────────────────────────
         The breakdown lives in one sheet rather than inside the row, which
         is what lets every row keep a fixed height and the list virtualise. */
      .detail-backdrop {
        position: fixed;
        inset: 0;
        z-index: 200;
        background: rgba(0, 0, 0, 0.48);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
      }
      .detail-sheet {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        z-index: 201;
        display: flex;
        flex-direction: column;
        width: min(560px, 94vw);
        background: var(--color-bg-secondary);
        border-left: 1px solid var(--glass-border);
        box-shadow: -24px 0 64px rgba(0, 0, 0, 0.42);
        animation: detail-in 0.18s ease-out;
      }
      @keyframes detail-in {
        from {
          transform: translateX(24px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      .detail-sheet-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        padding: 20px;
        border-bottom: 1px solid var(--glass-border);
      }
      .detail-sheet-title {
        min-width: 0;
      }
      .detail-sheet-title h2 {
        margin: 4px 0 5px;
        font-size: 18px;
        font-weight: 800;
        color: var(--color-text-primary);
        overflow-wrap: anywhere;
      }
      .detail-sheet-title p {
        font-size: 11px;
        line-height: 1.5;
        color: var(--color-text-muted);
      }
      .close-detail {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        border: 1px solid var(--glass-border);
        border-radius: 8px;
        background: var(--glass-bg);
        color: var(--color-text-secondary);
        cursor: pointer;
      }
      .close-detail:hover {
        color: var(--color-text-primary);
        border-color: var(--glass-border-accent);
      }
      .detail-sheet-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior-y: contain;
        display: flex;
        flex-direction: column;
        gap: 18px;
        padding: 18px 20px 32px;
      }
      .detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .detail-stat {
        display: flex;
        flex-direction: column;
        gap: 3px;
        padding: 10px 12px;
        border-radius: 10px;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        min-width: 0;
      }
      .detail-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-text-muted);
      }
      .detail-stat strong {
        font-size: 15px;
        font-weight: 700;
        color: var(--color-text-primary);
      }
      .detail-stat small {
        font-size: 10px;
        color: var(--color-text-muted);
      }
      .detail-column {
        min-width: 0;
      }
      .detail-column h3 {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 12px;
        font-weight: 700;
        color: var(--color-text-secondary);
      }
      .detail-column h3 span {
        font-size: 10px;
        font-weight: 500;
        color: var(--color-text-muted);
      }
      .table-scroll {
        overflow-x: auto;
      }
      .breakdown-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }
      .breakdown-table th,
      .breakdown-table td {
        padding: 6px 8px;
        text-align: left;
        white-space: nowrap;
        border-bottom: 1px solid var(--glass-border);
      }
      .breakdown-table th {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-text-muted);
        font-weight: 600;
      }
      .breakdown-table td {
        color: var(--color-text-secondary);
      }
      .breakdown-table td:nth-child(n + 2),
      .breakdown-table th:nth-child(n + 2) {
        text-align: right;
      }
      .breakdown-table tr.current td {
        color: var(--color-text-primary);
        background: rgba(139, 92, 246, 0.1);
      }
      .session-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
      }
      .session-list li {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 0;
        font-size: 11px;
        color: var(--color-text-secondary);
        border-bottom: 1px solid var(--glass-border);
      }
      .session-list li:last-child {
        border-bottom: none;
      }
      .session-when {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .session-amount {
        font-weight: 700;
        color: var(--color-text-primary);
      }
      .session-flag {
        font-size: 10px;
        color: #fbbf24;
      }
      .more-sessions {
        margin-top: 6px;
        font-size: 10px;
        color: var(--color-text-muted);
      }

      /* ── Empty states and notes ──────────────────────────────────────── */
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 64px 20px;
        text-align: center;
      }
      .empty-state.compact {
        padding: 40px 20px;
      }
      .empty-state h2 {
        font-size: 17px;
        font-weight: 700;
        color: var(--color-text-secondary);
      }
      .empty-state p {
        max-width: 420px;
        font-size: 13px;
        line-height: 1.6;
        color: var(--color-text-muted);
      }
      .btn-primary {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        border: none;
        border-radius: 10px;
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        color: #fff;
        cursor: pointer;
        text-decoration: none;
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease;
      }
      .btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(139, 92, 246, 0.3);
      }
      .method-note {
        max-width: 860px;
        font-size: 11px;
        line-height: 1.6;
        color: var(--color-text-muted);
      }

      /* ── Tablet and phone: the row keeps three lines ──────────────────── */
      @media (max-width: 900px) {
        .summary-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .time-list {
          height: 58vh;
        }
        .time-row {
          height: 240px;
        }
        .time-card {
          height: 224px;
        }
        .time-card-head {
          grid-template-columns: minmax(0, 1fr) auto 24px;
          row-gap: 8px;
        }
        .identity {
          grid-column: 1 / 3;
        }
        .totals {
          grid-column: 1;
        }
        .timeframe {
          grid-column: 2;
          align-items: flex-end;
        }
        .chevron {
          grid-column: 3;
          grid-row: 1;
        }
        .detail-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      /* ── Phone: one column, and controls a thumb can hit ─────────────── */
      @media (max-width: 640px) {
        .page-header {
          align-items: flex-start;
          flex-direction: column;
        }
        .header-stats {
          width: 100%;
        }
        .stat {
          white-space: normal;
        }
        .period-bar {
          gap: 6px;
        }
        .period-tab {
          min-height: 44px;
          padding: 8px 12px;
        }
        .period-range {
          width: 100%;
          margin-left: 0;
        }
        .search-box {
          max-width: 100%;
          min-height: 44px;
        }
        .search-box input {
          height: auto;
          min-height: 24px;
          min-width: 0;
        }
        .clear-search {
          min-width: 44px;
          min-height: 44px;
        }
        .time-card-head {
          grid-template-columns: minmax(0, 1fr) 24px;
          padding: 12px;
        }
        .identity {
          grid-column: 1;
        }
        .chevron {
          grid-column: 2;
        }
        .totals {
          grid-column: 1;
          grid-row: 2;
        }
        .timeframe {
          grid-column: 1;
          grid-row: 3;
          flex-direction: row;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
        }
        .chart-wrap {
          padding: 0 12px 12px;
        }
        .axis {
          font-size: 10px;
        }
        .time-list {
          height: 56vh;
          min-height: 280px;
        }
        .detail-sheet {
          width: 100%;
          border-left: none;
        }
        .detail-sheet-body {
          padding: 16px 14px 28px;
        }
        .detail-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .date-field input {
          min-height: 44px;
        }
        .close-detail {
          width: 44px;
          height: 44px;
        }
      }

      /* ── Very large screens: the page is read from across a room ─────── */
      @media (min-width: 1920px) {
        .page-header,
        .period-bar,
        .custom-range,
        .summary-grid,
        .insight-card,
        .list-toolbar,
        .chart-legend,
        .time-list,
        .method-note {
          width: 100%;
          max-width: 1600px;
          margin-inline: auto;
        }
        .page-title {
          font-size: var(--text-6xl);
        }
      }
      @media (min-width: 2560px) {
        .date-label,
        .stat,
        .result-count,
        .period-tab,
        .summary-hint,
        .chart-note,
        .method-note {
          font-size: var(--text-sm);
        }
        .task-title {
          font-size: var(--text-lg);
        }
        .totals strong,
        .detail-stat strong {
          font-size: var(--text-xl);
        }
        .chart {
          height: 72px;
        }
        /* The type and chart are taller at this size, so the fixed row grows
           with them; the directive is told the same number in its rowHeight. */
        .time-row {
          height: 216px;
        }
        .time-card {
          height: 200px;
        }
      }
    `,
  ],
})
export class TimeComponent implements OnInit {
  private readonly db = inject(DbService);
  private readonly taskService = inject(TaskService);
  private readonly destroyRef = inject(DestroyRef);

  readonly sessions = signal<PomodoroSession[]>([]);
  readonly period = signal<TimePeriodKey>('month');
  readonly searchQuery = signal('');
  readonly selectedKey = signal<string | null>(null);
  readonly customFrom = signal(TimeComponent.dayOffset(-6));
  readonly customTo = signal(dayKey(new Date()));

  protected readonly periodOptions = TIME_PERIODS;
  protected readonly maxDate = dayKey(new Date());

  /**
   * The list is a fixed-height virtual window. Cards are 160px tall on a wide
   * screen, 224px below 900px and 200px on a 2560px screen, so the row pitch is
   * the card plus its gap; the directive below only ever creates the rows
   * inside the viewport.
   */
  private readonly wideQuery: MediaQueryList | null =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 901px)')
      : null;
  private readonly hugeQuery: MediaQueryList | null =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 2560px)')
      : null;
  private readonly wide = signal(this.wideQuery?.matches ?? true);
  private readonly huge = signal(this.hugeQuery?.matches ?? false);
  protected readonly rowHeight = computed(() => (this.huge() ? 216 : this.wide() ? 176 : 240));
  private readonly listViewport = viewChild<ElementRef<HTMLElement>>('timeViewport');
  private readonly detailClose = viewChild<ElementRef<HTMLButtonElement>>('detailClose');

  /** One pass over sessions and tasks produces every number on the page. */
  readonly report = computed(() =>
    buildTimeReport({
      sessions: this.sessions(),
      tasks: this.taskService.tasks(),
      period: this.period(),
      customFrom: this.customFrom(),
      customTo: this.customTo(),
    }),
  );

  protected readonly totals = computed(() => this.report().totals);
  protected readonly groups = computed(() => this.report().groups);
  protected readonly insights = computed(() => this.report().insights);
  protected readonly currentPeriod = computed(() => this.report().period);
  protected readonly hasAnySessions = computed(() => this.report().hasAnySessions);
  protected readonly selectedGroup = computed(
    () => this.groups().find((group) => group.key === this.selectedKey()) ?? null,
  );

  protected readonly filteredGroups = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return this.groups();
    return this.groups().filter((group) => group.title.toLowerCase().includes(query));
  });

  protected readonly periodRange = computed(() => {
    const period = this.currentPeriod();
    if (!period.from) return '';
    return period.from === period.to
      ? this.dayLabel(period.from)
      : `${this.dayLabel(period.from)} – ${this.dayLabel(period.to)}`;
  });

  protected readonly duration = formatDuration;
  protected readonly dayLabel = formatDayLabel;
  protected readonly timeLabel = formatTimeOfDay;

  constructor() {
    this.listenTo(this.wideQuery, this.wide);
    this.listenTo(this.hugeQuery, this.huge);
    // A dialog that opens should take the keyboard with it; the close button is
    // the first thing a keyboard user needs. Deferred because the sheet is only
    // in the DOM after the render that follows `selectedKey`.
    effect(() => {
      if (!this.selectedKey()) return;
      setTimeout(() => this.detailClose()?.nativeElement.focus());
    });
  }

  async ngOnInit(): Promise<void> {
    await this.db.init();
    await this.taskService.loadTasks();
    await this.taskService.runDailyUpkeep();
    this.sessions.set(await this.db.getAllSessions());
  }

  protected setPeriod(period: TimePeriodKey): void {
    this.period.set(period);
    // A row that is not in the new window cannot stay open, and a new window
    // starts at its own top rather than at the old scroll offset.
    this.selectedKey.set(null);
    this.resetScroll();
  }

  protected onCustomFrom(event: Event): void {
    const value = this.clampDate((event.target as HTMLInputElement).value);
    if (!value) return;
    this.customFrom.set(value);
    if (value > this.customTo()) this.customTo.set(value);
    this.enterCustomRange();
  }

  protected onCustomTo(event: Event): void {
    const value = this.clampDate((event.target as HTMLInputElement).value);
    if (!value) return;
    this.customTo.set(value);
    if (value < this.customFrom()) this.customFrom.set(value);
    this.enterCustomRange();
  }

  protected openGroup(key: string): void {
    this.selectedKey.set(key);
  }

  protected closeDetail(): void {
    this.selectedKey.set(null);
  }

  /** Escape closes the detail sheet before it reaches the shell's shortcuts. */
  protected onEscape(event: Event): void {
    if (!this.selectedKey()) return;
    event.preventDefault();
    event.stopPropagation();
    this.closeDetail();
  }

  protected onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
    this.resetScroll();
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
    this.resetScroll();
  }

  protected percent(value: number): number {
    return Math.round(value * 100);
  }

  /** The colour family a card's bars wear, matching the legend and its badge. */
  protected toneOf(group: { cadence: TimeCadence }): string {
    switch (group.cadence) {
      case 'one-off':
        return 'one-off';
      case 'multi-day':
        return 'multi-day';
      case 'untasked':
        return 'untasked';
      default:
        return 'repeating';
    }
  }

  protected chartLabel(group: {
    title: string;
    buckets: { label: string; seconds: number }[];
  }): string {
    const total = group.buckets.reduce((sum, bucket) => sum + bucket.seconds, 0);
    return `${group.title}: ${this.duration(total)} in ${this.currentPeriod().label.toLowerCase()}`;
  }

  private enterCustomRange(): void {
    this.period.set('custom');
    this.selectedKey.set(null);
    this.resetScroll();
  }

  private resetScroll(): void {
    const viewport = this.listViewport()?.nativeElement;
    if (viewport) viewport.scrollTop = 0;
  }

  private listenTo(query: MediaQueryList | null, state: { set(value: boolean): void }): void {
    if (!query) return;
    const onChange = (event: MediaQueryListEvent): void => state.set(event.matches);
    query.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
  }

  private clampDate(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    return value > this.maxDate ? this.maxDate : value;
  }

  private static dayOffset(offset: number): string {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return dayKey(date);
  }
}
