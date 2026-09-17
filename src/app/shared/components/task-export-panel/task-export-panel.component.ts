import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  output,
  signal,
  ElementRef,
  viewChild,
  afterNextRender,
} from '@angular/core';
import { TaskExportService } from '../../../core/services/task-export.service';
import {
  ExportDateField,
  ExportPriorityFilter,
  ExportRangeKey,
  ExportStatusFilter,
  TaskExportOptions,
  TaskExportPlan,
  TaskExportRow,
} from '../../../core/models/task-export.model';
import { EXPORT_RANGE_PRESETS } from '../../../core/utils/task-export.util';

/** Rows shown in the on-screen preview (the CSV gets everything). */
const PREVIEW_ROWS = 8;

/**
 * Modal that exports the task list to CSV through `rm-ng-export-to-csv`.
 *
 * The user picks a quick date range (today, yesterday, this week, this month,
 * a custom span, …), which date the range applies to, and optional filters; the
 * panel then shows exactly how many tasks and which columns will be written
 * before the file is produced.
 */
@Component({
  selector: 'app-task-export-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <div class="export-backdrop" (click)="close()"></div>

    <div #modal class="export-modal" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <header class="export-header">
        <div>
          <h2 id="export-title">Export tasks</h2>
          <p>Choose a date range, then download the list as a CSV you can open in Excel.</p>
        </div>
        <button class="icon-btn" type="button" (click)="close()" aria-label="Close export">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <!-- Date range -->
      <section class="block">
        <div class="block-head">
          <span class="block-title">Date range</span>
          @if (activeRange(); as range) {
            <span class="block-hint">{{ range.hint }}</span>
          }
        </div>
        <div class="chips">
          @for (preset of presets; track preset.key) {
            <button
              type="button"
              class="chip"
              [class.active]="options().range === preset.key"
              (click)="setRange(preset.key)"
            >
              {{ preset.label }}
            </button>
          }
        </div>

        @if (options().range === 'custom') {
          <div class="custom-range">
            <label>
              <span>From</span>
              <input type="date" [value]="options().customFrom" (change)="setCustomFrom($event)" />
            </label>
            <span class="range-dash">→</span>
            <label>
              <span>To</span>
              <input type="date" [value]="options().customTo" (change)="setCustomTo($event)" />
            </label>
          </div>
        }
      </section>

      <!-- Filters -->
      <section class="block">
        <div class="block-head">
          <span class="block-title">What to include</span>
        </div>
        <div class="field-row">
          <label class="field">
            <span>Date to use</span>
            <select [value]="options().dateField" (change)="setDateField($event)">
              <option value="deadline">Deadline</option>
              <option value="created">Created date</option>
              <option value="completed">Completion date</option>
            </select>
          </label>
          <label class="field">
            <span>Status</span>
            <select [value]="options().status" (change)="setStatus($event)">
              <option value="all">All statuses</option>
              <option value="todo">To Do</option>
              <option value="in-progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </label>
          <label class="field">
            <span>Priority</span>
            <select [value]="options().priority" (change)="setPriority($event)">
              <option value="all">All priorities</option>
              <option value="1">P1 — Critical</option>
              <option value="2">P2 — High</option>
              <option value="3">P3 — Medium</option>
              <option value="4">P4 — Low</option>
            </select>
          </label>
        </div>

        <div class="options">
          <label class="option">
            <input type="checkbox" [checked]="options().includeUndated" (change)="toggleUndated($event)" />
            Also include tasks with no {{ dateFieldName() }} ({{ plan()?.undatedCount ?? 0 }})
          </label>
          <label class="option">
            <input type="checkbox" [checked]="options().includeSummary" (change)="toggleSummary($event)" />
            Add a totals block below the data
          </label>
        </div>
      </section>

      <!-- Preview -->
      @if (plan(); as current) {
        <section class="block preview">
          <div class="block-head">
            <span class="block-title">
              {{ current.rowCount }} task(s) will be exported
            </span>
            <span class="block-hint">{{ current.range.label }}</span>
          </div>

          @if (current.rowCount === 0) {
            <p class="empty-note">
              No tasks match this range. Try a wider range, or tick “also include tasks with no
              {{ dateFieldName() }}”.
            </p>
          } @else {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    @for (column of previewColumns; track column.key) {
                      <th>{{ column.label }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of previewRows(); track row['taskId']) {
                    <tr>
                      @for (column of previewColumns; track column.key) {
                        <td [title]="cellText(row, column.key)">{{ cellText(row, column.key) }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="more-note">
              Showing {{ previewRows().length }} of {{ current.rowCount }} row(s) ·
              {{ current.columns.length }} columns including Date, Day, Week, Month, Status, Priority,
              Quadrant, Deadline, Days To Deadline, Overdue, Tags, Repeat, Focus Minutes and more.
              @if (current.totalFocusMinutes) {
                Focus time in this range: {{ current.totalFocusMinutes }} minutes across
                {{ current.totalFocusSessions }} session(s).
              }
            </p>
          }
        </section>
      }

      @if (message(); as text) {
        <div class="status-line" role="status">{{ text }}</div>
      }

      <footer class="export-footer">
        <button class="btn btn-ghost" type="button" (click)="close()">Cancel</button>
        <button
          class="btn btn-primary"
          type="button"
          [disabled]="!plan()?.rowCount || busy()"
          (click)="runExport()"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {{ busy() ? 'Exporting…' : 'Export ' + (plan()?.rowCount ?? 0) + ' task(s) to CSV' }}
        </button>
      </footer>
    </div>
  `,
  styles: [
    `
      :host {
        position: fixed; inset: 0; z-index: 200;
        display: flex; align-items: center; justify-content: center; padding: 24px;
      }
      .export-backdrop {
        position: absolute; inset: 0; background: rgba(0, 0, 0, 0.55); backdrop-filter: blur(3px);
      }
      .export-modal {
        position: relative; z-index: 1;
        width: min(1000px, 100%); max-height: min(820px, 94vh);
        display: flex; flex-direction: column; gap: 14px; padding: 22px 24px;
        background: var(--color-bg-secondary); border: 1px solid var(--glass-border-accent);
        border-radius: var(--glass-radius); box-shadow: var(--glass-shadow), var(--glass-shadow-glow);
        overflow: auto; outline: none;
      }
      .export-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
      .export-header h2 { font-size: 1.1rem; font-weight: 700; }
      .export-header p { margin-top: 2px; font-size: 0.74rem; color: var(--color-text-muted); }
      .icon-btn {
        width: 30px; height: 30px; border-radius: 8px; border: none; background: transparent;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        color: var(--color-text-muted); cursor: pointer; transition: all 0.2s;
      }
      .icon-btn:hover { background: var(--glass-bg-hover); color: var(--color-text-primary); }

      .block { display: flex; flex-direction: column; gap: 8px; }
      .block-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
      .block-title { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); }
      .block-hint { font-size: 0.7rem; color: var(--color-text-muted); }

      .chips { display: flex; gap: 6px; flex-wrap: wrap; }
      .chip {
        padding: 5px 12px; font-size: 0.7rem; font-weight: 500;
        background: var(--glass-bg); border: 1px solid rgba(139, 92, 246, 0.1);
        border-radius: 20px; color: var(--color-text-muted); cursor: pointer; transition: all 0.2s;
      }
      .chip:hover { border-color: rgba(139, 92, 246, 0.3); color: var(--color-text-secondary); }
      .chip.active {
        background: rgba(139, 92, 246, 0.12); border-color: rgba(139, 92, 246, 0.4);
        color: var(--timer-work-color); font-weight: 600;
      }

      .custom-range { display: flex; align-items: flex-end; gap: 10px; }
      .custom-range label { display: flex; flex-direction: column; gap: 4px; font-size: 0.68rem; color: var(--color-text-muted); }
      .custom-range input {
        background: var(--control-bg); border: 1px solid rgba(139, 92, 246, 0.12);
        border-radius: 8px; padding: 7px 10px; color: var(--color-text-primary); font: inherit; font-size: 0.76rem;
      }
      .range-dash { color: var(--color-text-muted); padding-bottom: 8px; }

      .field-row { display: flex; gap: 10px; flex-wrap: wrap; }
      .field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 170px; }
      .field span { font-size: 0.68rem; color: var(--color-text-muted); }
      .field select {
        background: var(--control-bg); border: 1px solid rgba(139, 92, 246, 0.12);
        border-radius: 8px; padding: 7px 10px; color: var(--color-text-secondary); font: inherit; font-size: 0.76rem; cursor: pointer;
      }
      .options { display: flex; flex-direction: column; gap: 6px; }
      .option { display: flex; align-items: center; gap: 8px; font-size: 0.74rem; color: var(--color-text-secondary); cursor: pointer; }

      .preview { border-top: 1px solid var(--glass-border); padding-top: 12px; }
      .table-wrap { max-height: 240px; overflow: auto; border: 1px solid var(--glass-border); border-radius: 10px; background: var(--control-bg); }
      table { width: 100%; min-width: 700px; border-collapse: collapse; font-size: 0.7rem; }
      thead th {
        position: sticky; top: 0; z-index: 1; text-align: left; padding: 7px 9px;
        font-size: 0.6rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
        color: var(--color-text-muted); background: var(--color-bg-tertiary);
        border-bottom: 1px solid var(--glass-border); white-space: nowrap;
      }
      tbody td {
        padding: 6px 9px; border-bottom: 1px solid rgba(139, 92, 246, 0.06);
        color: var(--color-text-secondary); white-space: nowrap;
        max-width: 220px; overflow: hidden; text-overflow: ellipsis;
      }
      .more-note, .empty-note { font-size: 0.7rem; color: var(--color-text-muted); line-height: 1.6; }
      .status-line { font-size: 0.74rem; color: var(--timer-long-break-color); }

      .export-footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
      .btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 18px; border-radius: 10px; font-size: 0.78rem; font-weight: 600;
        cursor: pointer; border: none; transition: all 0.2s;
      }
      .btn-primary { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; }
      .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(139, 92, 246, 0.3); }
      .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
      .btn-ghost { background: transparent; color: var(--color-text-muted); }
      .btn-ghost:hover { color: var(--color-text-primary); }
    `,
  ],
})
export class TaskExportPanelComponent {
  private readonly exportService = inject(TaskExportService);
  private readonly modal = viewChild<ElementRef<HTMLElement>>('modal');

  /** Emitted when the user dismisses the panel. */
  readonly closed = output<void>();

  readonly presets = EXPORT_RANGE_PRESETS;
  /** Columns shown in the on-screen preview (the CSV always gets all of them). */
  readonly previewColumns = [
    { key: 'date', label: 'Date' },
    { key: 'day', label: 'Day' },
    { key: 'title', label: 'Task' },
    { key: 'status', label: 'Status' },
    { key: 'priority', label: 'Priority' },
    { key: 'quadrant', label: 'Quadrant' },
    { key: 'deadline', label: 'Deadline' },
    { key: 'tags', label: 'Tags' },
    { key: 'focusMinutes', label: 'Focus Min' },
  ];

  readonly options = signal<TaskExportOptions>({
    range: 'today',
    customFrom: '',
    customTo: '',
    dateField: 'deadline',
    status: 'all',
    priority: 'all',
    includeUndated: false,
    includeSummary: false,
  });
  readonly plan = signal<TaskExportPlan | null>(null);
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);

  readonly activeRange = computed(() => this.presets.find(preset => preset.key === this.options().range));
  readonly previewRows = computed<TaskExportRow[]>(() => (this.plan()?.rows ?? []).slice(0, PREVIEW_ROWS));
  readonly dateFieldName = computed(() => {
    switch (this.options().dateField) {
      case 'created':
        return 'created date';
      case 'completed':
        return 'completion date';
      default:
        return 'deadline';
    }
  });

  constructor() {
    void this.refresh();
    afterNextRender(() => this.modal()?.nativeElement.focus());
  }

  // ── Option changes ─────────────────────────────────────────────────────────

  setRange(range: ExportRangeKey): void {
    this.message.set(null);
    this.options.update(current => ({ ...current, range }));
    void this.refresh();
  }

  setCustomFrom(event: Event): void {
    this.options.update(current => ({ ...current, customFrom: (event.target as HTMLInputElement).value }));
    void this.refresh();
  }

  setCustomTo(event: Event): void {
    this.options.update(current => ({ ...current, customTo: (event.target as HTMLInputElement).value }));
    void this.refresh();
  }

  setDateField(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as ExportDateField;
    this.options.update(current => ({ ...current, dateField: value }));
    void this.refresh();
  }

  setStatus(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as ExportStatusFilter;
    this.options.update(current => ({ ...current, status: value }));
    void this.refresh();
  }

  setPriority(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as ExportPriorityFilter;
    this.options.update(current => ({ ...current, priority: value }));
    void this.refresh();
  }

  toggleUndated(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.options.update(current => ({ ...current, includeUndated: checked }));
    void this.refresh();
  }

  toggleSummary(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.options.update(current => ({ ...current, includeSummary: checked }));
    void this.refresh();
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  private async refresh(): Promise<void> {
    this.plan.set(await this.exportService.prepare(this.options()));
  }

  async runExport(): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    try {
      const result = await this.exportService.exportTasks(this.options());
      this.message.set(
        result
          ? `Exported ${result.rowCount} task(s) to ${result.fileName}`
          : 'Nothing to export for this range.'
      );
    } catch (error) {
      this.message.set(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.busy.set(false);
    }
  }

  cellText(row: TaskExportRow, key: string): string {
    const value = row[key];
    return value === undefined || value === null || value === '' ? '—' : String(value);
  }

  close(): void {
    this.closed.emit();
  }
}
