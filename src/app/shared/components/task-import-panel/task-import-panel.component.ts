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
import { TaskImportService } from '../../../core/services/task-import.service';
import {
  ImportCommitResult,
  ImportPreview,
  ImportRow,
} from '../../../core/models/task-import.model';

type Stage = 'idle' | 'reading' | 'preview' | 'importing' | 'done';
type RowFilter = 'all' | 'problems';

/** Rows rendered in the preview table (keeps large imports responsive). */
const MAX_PREVIEW_ROWS = 300;

/**
 * Modal that imports tasks from an Excel/CSV sheet.
 *
 * Two-step by design: the file is parsed and validated into a preview first, and
 * rows are only written to the database once the user confirms — so a mistyped
 * spreadsheet never silently pollutes the task list.
 */
@Component({
  selector: 'app-task-import-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <div class="import-backdrop" (click)="close()"></div>

    <div
      #modal
      class="import-modal"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-title"
    >
      <header class="import-header">
        <div class="header-text">
          <h2 id="import-title">Import tasks from Excel</h2>
          <p>Upload a spreadsheet, review every row, then confirm.</p>
        </div>
        <button class="icon-btn" type="button" (click)="close()" aria-label="Close import">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <!-- ── Pick a file ─────────────────────────────────────────────────── -->
      @if (stage() === 'idle') {
        <div
          class="dropzone"
          [class.active]="dragActive()"
          (dragover)="onDragOver($event)"
          (dragleave)="onDragLeave($event)"
          (drop)="onDrop($event)"
        >
          <div class="dropzone-icon" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p class="dropzone-title">Drop your .xlsx or .csv file here</p>
          <p class="dropzone-or">or</p>
          <button #browseButton class="btn btn-primary" type="button" (click)="browse()">Choose file</button>
          <input
            #fileInput
            type="file"
            class="hidden-input"
            accept=".xlsx,.xlsm,.xltx,.csv,.tsv,.txt"
            (change)="onFileSelected($event)"
          />
        </div>

        <div class="template-card">
          <div class="template-text">
            <span class="template-title">Start from the DeepWork template</span>
            <span class="template-hint">
              Every option is a dropdown and the app's default values are already selected — saves as
              {{ templateFileName }}.
            </span>
          </div>
          <button
            class="btn btn-outline"
            type="button"
            [title]="'Download ' + templateFileName"
            (click)="downloadTemplate()"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download template
          </button>
        </div>

        @if (errorMessage()) {
          <div class="alert" role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{{ errorMessage() }}</span>
          </div>
        }

        <ul class="tips">
          <li>Columns are matched by their header — Title, Description, Priority, Quadrant, Deadline, Status, Repeat, Tags, Add to Today.</li>
          <li>Common alternatives such as <em>Task</em>, <em>Due Date</em> or <em>Prio</em> work too, and extra columns are ignored.</li>
          <li>Nothing is saved until you confirm the preview.</li>
        </ul>
      }

      <!-- ── Reading ────────────────────────────────────────────────────── -->
      @if (stage() === 'reading') {
        <div class="loading-state">
          <div class="spinner" aria-hidden="true"></div>
          <p>Reading {{ fileName() }}…</p>
        </div>
      }

      <!-- ── Preview ────────────────────────────────────────────────────── -->
      @if (stage() === 'preview' && preview(); as data) {
        <div class="preview-summary">
          <div class="file-chip" [title]="data.fileName">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
            <span class="file-name">{{ data.fileName }}</span>
            <span class="file-sheet">{{ data.sheetName }}</span>
          </div>
          <div class="stat-chips">
            @if (data.readyCount) {
              <span class="stat ready">{{ data.readyCount }} ready</span>
            }
            @if (data.warningCount) {
              <span class="stat warning">{{ data.warningCount }} with warnings</span>
            }
            @if (data.duplicateCount) {
              <span class="stat duplicate">{{ data.duplicateCount }} duplicate</span>
            }
            @if (data.errorCount) {
              <span class="stat error">{{ data.errorCount }} skipped</span>
            }
          </div>
        </div>

        <p class="mapping-line">
          Mapped columns:
          @for (column of data.mapping; track column.field) {
            <span class="mapping-item">{{ column.label }} <em>{{ column.column }}</em></span>
          }
        </p>
        @if (data.unknownHeaders.length) {
          <p class="mapping-line muted">
            Ignored columns: {{ data.unknownHeaders.join(', ') }}
          </p>
        }

        <div class="table-toolbar">
          <span class="row-count">
            {{ data.rows.length }} row(s) with data
            @if (data.rowsWithoutTitle) {
              · {{ data.rowsWithoutTitle }} row(s) without a Title ignored
            }
          </span>
          <div class="filter-chips">
            <button
              type="button"
              class="chip"
              [class.active]="rowFilter() === 'all'"
              (click)="rowFilter.set('all')"
            >
              All
            </button>
            <button
              type="button"
              class="chip"
              [class.active]="rowFilter() === 'problems'"
              (click)="rowFilter.set('problems')"
            >
              Needs attention <span>{{ problemCount() }}</span>
            </button>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="col-row">Row</th>
                <th class="col-status">Status</th>
                <th>Title</th>
                <th class="col-small">Priority</th>
                <th class="col-small">Quadrant</th>
                <th class="col-small">Deadline</th>
                <th class="col-small">Repeat</th>
                <th class="col-notes">Notes</th>
              </tr>
            </thead>
            <tbody>
              @for (row of visibleRows(); track row.rowNumber) {
                <tr [class]="row.status">
                  <td class="col-row">{{ row.rowNumber }}</td>
                  <td class="col-status">
                    <span class="row-status" [class]="'row-status ' + row.status">{{ statusLabel(row.status) }}</span>
                  </td>
                  <td class="cell-title" [title]="row.cells.title || ''">
                    {{ row.cells.title || '—' }}
                  </td>
                  <td class="col-small">{{ row.cells.priority || '—' }}</td>
                  <td class="col-small">{{ row.cells.quadrant || '—' }}</td>
                  <td class="col-small">{{ row.cells.deadline || '—' }}</td>
                  <td class="col-small">{{ row.cells.repeat || '—' }}</td>
                  <td class="col-notes">
                    @for (message of row.errors; track message) {
                      <span class="note error">{{ message }}</span>
                    }
                    @for (message of row.warnings; track message) {
                      <span class="note warning">{{ message }}</span>
                    }
                    @if (row.status === 'duplicate') {
                      <span class="note duplicate">A task with this title already exists</span>
                    }
                    @if (!row.errors.length && !row.warnings.length && row.status === 'ready') {
                      <span class="note">Ready to import</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="8" class="empty-cell">No rows match this filter.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (hiddenRowCount() > 0) {
          <p class="mapping-line muted">
            Showing the first {{ maxPreviewRows }} of {{ data.rows.length }} rows.
          </p>
        }

        <div class="options">
          @if (data.duplicateCount) {
            <label class="option skip-duplicates">
              <input type="checkbox" [checked]="skipDuplicates()" (change)="onSkipDuplicates($event)" />
              Skip {{ data.duplicateCount }} row(s) whose title already exists
            </label>
          }
          @if (data.warningCount) {
            <label class="option include-warnings">
              <input type="checkbox" [checked]="includeWarnings()" (change)="onIncludeWarnings($event)" />
              Import {{ data.warningCount }} row(s) with warnings
            </label>
          }
        </div>

        <footer class="import-footer">
          <button class="btn btn-ghost" type="button" (click)="reset()">Choose a different file</button>
          <button
            class="btn btn-primary"
            type="button"
            [disabled]="selectedCount() === 0"
            (click)="startImport()"
          >
            Import {{ selectedCount() }} task(s)
          </button>
        </footer>
      }

      <!-- ── Importing ──────────────────────────────────────────────────── -->
      @if (stage() === 'importing') {
        <div class="loading-state">
          <div class="progress-track" role="progressbar" [attr.aria-valuenow]="progressDone()" [attr.aria-valuemax]="progressTotal()">
            <div class="progress-fill" [style.width.%]="progressPercent()"></div>
          </div>
          <p>Adding tasks… {{ progressDone() }} / {{ progressTotal() }}</p>
        </div>
      }

      <!-- ── Done ───────────────────────────────────────────────────────── -->
      @if (stage() === 'done' && result(); as outcome) {
        <div class="done-state">
          <div class="done-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20,6 9,17 4,12" />
            </svg>
          </div>
          <h3>{{ outcome.created }} task(s) added</h3>
          @if (outcome.skipped) {
            <p>{{ outcome.skipped }} row(s) were left out (errors or duplicates).</p>
          } @else {
            <p>Every row of {{ fileName() }} was imported.</p>
          }
        </div>
        <footer class="import-footer">
          <button class="btn btn-ghost" type="button" (click)="reset()">Import another file</button>
          <button class="btn btn-primary" type="button" (click)="close()">Done</button>
        </footer>
      }
    </div>
  `,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: 200;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .import-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(3px);
      }
      .import-modal {
        position: relative;
        z-index: 1;
        width: min(940px, 100%);
        max-height: min(760px, 92vh);
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 22px 24px;
        background: var(--color-bg-secondary);
        border: 1px solid var(--glass-border-accent);
        border-radius: var(--glass-radius);
        box-shadow: var(--glass-shadow), var(--glass-shadow-glow);
        overflow: hidden;
        animation: modal-in 0.18s ease-out;
        outline: none;
      }
      @keyframes modal-in {
        from { opacity: 0; transform: translateY(10px) scale(0.99); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .import-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }
      .header-text h2 { font-size: 1.1rem; font-weight: 700; }
      .header-text p { font-size: 0.74rem; color: var(--color-text-muted); }

      .icon-btn {
        width: 30px; height: 30px; border-radius: 8px; border: none; background: transparent;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        color: var(--color-text-muted); cursor: pointer; transition: all 0.2s;
      }
      .icon-btn:hover { background: var(--glass-bg-hover); color: var(--color-text-primary); }

      /* Pick a file */
      .dropzone {
        display: flex; flex-direction: column; align-items: center; gap: 8px;
        padding: 26px 20px; text-align: center;
        background: var(--glass-bg); border: 1.5px dashed rgba(139, 92, 246, 0.3);
        border-radius: var(--glass-radius-sm); transition: all 0.2s;
      }
      .dropzone.active {
        border-color: var(--color-accent-primary);
        background: var(--glass-bg-active);
      }
      .dropzone-icon {
        width: 48px; height: 48px; border-radius: 14px;
        display: flex; align-items: center; justify-content: center;
        background: rgba(139, 92, 246, 0.12); color: var(--timer-work-color);
      }
      .dropzone-title { font-size: 0.86rem; font-weight: 600; color: var(--color-text-primary); }
      .dropzone-or { font-size: 0.68rem; color: var(--color-text-muted); text-transform: uppercase; }
      .hidden-input { display: none; }

      .template-card {
        display: flex; align-items: center; justify-content: space-between; gap: 16px;
        padding: 14px 16px; border-radius: var(--glass-radius-sm);
        background: var(--glass-bg); border: 1px solid var(--glass-border);
      }
      .template-text { display: flex; flex-direction: column; min-width: 0; }
      .template-title { font-size: 0.8rem; font-weight: 600; color: var(--color-text-primary); }
      .template-hint { font-size: 0.7rem; color: var(--color-text-muted); }

      .alert {
        display: flex; align-items: flex-start; gap: 8px;
        padding: 12px 14px; border-radius: 10px; font-size: 0.76rem; line-height: 1.45;
        background: rgba(248, 113, 113, 0.1); border: 1px solid rgba(248, 113, 113, 0.3);
        color: var(--priority-p1-color);
      }
      .alert svg { flex-shrink: 0; margin-top: 1px; }

      .tips { display: flex; flex-direction: column; gap: 6px; padding-left: 18px; }
      .tips li { font-size: 0.72rem; color: var(--color-text-muted); line-height: 1.5; }

      /* Reading / importing */
      .loading-state {
        display: flex; flex-direction: column; align-items: center; gap: 14px;
        padding: 46px 20px; color: var(--color-text-secondary); font-size: 0.82rem;
      }
      .spinner {
        width: 32px; height: 32px; border-radius: 50%;
        border: 3px solid rgba(139, 92, 246, 0.2); border-top-color: var(--color-accent-primary);
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .progress-track {
        width: min(420px, 100%); height: 6px; border-radius: 999px;
        background: rgba(139, 92, 246, 0.15); overflow: hidden;
      }
      .progress-fill {
        height: 100%; border-radius: 999px;
        background: linear-gradient(90deg, #8b5cf6, #06b6d4);
        transition: width 0.2s ease;
      }

      /* Preview */
      .preview-summary {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
      }
      .file-chip {
        display: flex; align-items: center; gap: 8px; min-width: 0;
        padding: 6px 12px; border-radius: 999px;
        background: var(--glass-bg); border: 1px solid var(--glass-border);
        color: var(--color-text-secondary); font-size: 0.74rem;
      }
      .file-chip svg { flex-shrink: 0; }
      .file-name { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: var(--color-text-primary); }
      .stat-chips { display: flex; gap: 6px; }
      .stat {
        font-size: 0.68rem; padding: 4px 10px; border-radius: 999px;
        border: 1px solid transparent;
      }
      .stat.ready { color: var(--timer-long-break-color); background: rgba(52, 211, 153, 0.1); border-color: rgba(52, 211, 153, 0.25); }
      .stat.warning { color: var(--status-in-progress-color); background: rgba(251, 191, 36, 0.1); border-color: rgba(251, 191, 36, 0.25); }
      .stat.duplicate { color: var(--color-accent-primary); background: rgba(139, 92, 246, 0.12); border-color: rgba(139, 92, 246, 0.3); }
      .stat.error { color: var(--priority-p1-color); background: rgba(248, 113, 113, 0.1); border-color: rgba(248, 113, 113, 0.25); }

      .mapping-line { font-size: 0.7rem; color: var(--color-text-muted); line-height: 1.6; }
      .mapping-item { display: inline-block; margin-right: 8px; white-space: nowrap; }
      .mapping-item em { font-style: normal; font-family: var(--font-mono); }

      .table-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .row-count { font-size: 0.7rem; color: var(--color-text-muted); }
      .filter-chips { display: flex; gap: 6px; }
      .chip {
        padding: 4px 12px; font-size: 0.68rem; font-weight: 500;
        background: var(--glass-bg); border: 1px solid rgba(139, 92, 246, 0.1);
        border-radius: 20px; color: var(--color-text-muted); cursor: pointer; transition: all 0.2s;
      }
      .chip:hover { border-color: rgba(139, 92, 246, 0.3); color: var(--color-text-secondary); }
      .chip.active {
        background: rgba(139, 92, 246, 0.12); border-color: rgba(139, 92, 246, 0.4);
        color: var(--timer-work-color); font-weight: 600;
      }
      .chip span { opacity: 0.75; font-variant-numeric: tabular-nums; }

      .table-wrap {
        flex: 1; min-height: 120px; overflow: auto;
        border: 1px solid var(--glass-border); border-radius: var(--glass-radius-sm);
        background: var(--control-bg);
      }
      table { width: 100%; min-width: 900px; border-collapse: collapse; font-size: 0.72rem; }
      thead th {
        position: sticky; top: 0; z-index: 1; text-align: left;
        padding: 9px 10px; font-size: 0.62rem; font-weight: 700;
        letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-muted);
        background: var(--color-bg-tertiary); border-bottom: 1px solid var(--glass-border);
        white-space: nowrap;
      }
      tbody td {
        padding: 8px 10px; vertical-align: top;
        border-bottom: 1px solid rgba(139, 92, 246, 0.06);
        color: var(--color-text-secondary);
      }
      tbody tr.error { background: rgba(248, 113, 113, 0.06); }
      tbody tr.duplicate { background: rgba(139, 92, 246, 0.05); }
      .cell-title {
        color: var(--color-text-primary); font-weight: 500; max-width: 240px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .col-row { width: 46px; text-align: right; font-variant-numeric: tabular-nums; color: var(--color-text-muted); }
      .col-status { width: 92px; }
      .col-small { white-space: nowrap; }
      .row-status {
        display: inline-block; font-size: 0.6rem; font-weight: 700; padding: 2px 8px;
        border-radius: 8px; text-transform: uppercase;
      }
      .row-status.ready { background: rgba(52, 211, 153, 0.12); color: var(--timer-long-break-color); }
      .row-status.warning { background: rgba(251, 191, 36, 0.12); color: var(--status-in-progress-color); }
      .row-status.duplicate { background: rgba(139, 92, 246, 0.14); color: var(--color-accent-primary); }
      .row-status.error { background: rgba(248, 113, 113, 0.12); color: var(--priority-p1-color); }
      .note { display: block; font-size: 0.68rem; line-height: 1.45; }
      .note.error { color: var(--priority-p1-color); }
      .note.warning { color: var(--status-in-progress-color); }
      .empty-cell { padding: 20px; }

      .options { display: flex; flex-direction: column; gap: 6px; }
      .option {
        display: flex; align-items: center; gap: 8px;
        font-size: 0.74rem; color: var(--color-text-secondary); cursor: pointer;
      }

      .import-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }

      .done-state {
        display: flex; flex-direction: column; align-items: center; gap: 8px;
        padding: 34px 20px; text-align: center;
      }
      .done-icon {
        width: 54px; height: 54px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        background: rgba(52, 211, 153, 0.12); color: var(--timer-long-break-color);
      }
      .done-state h3 { font-size: 1rem; font-weight: 700; color: var(--color-text-primary); }
      .done-state p { font-size: 0.76rem; color: var(--color-text-muted); }

      .btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 18px; border-radius: 10px; font-size: 0.78rem; font-weight: 600;
        cursor: pointer; border: none; transition: all 0.2s; flex-shrink: 0;
      }
      .btn-primary { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; }
      .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(139, 92, 246, 0.3); }
      .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
      .btn-ghost { background: transparent; color: var(--color-text-muted); }
      .btn-ghost:hover { color: var(--color-text-primary); }
      .btn-outline {
        background: transparent; color: var(--color-text-secondary);
        border: 1px solid rgba(139, 92, 246, 0.3);
      }
      .btn-outline:hover { border-color: rgba(139, 92, 246, 0.6); color: var(--color-text-primary); }
    `,
  ],
})
export class TaskImportPanelComponent {
  private readonly importService = inject(TaskImportService);

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly modal = viewChild<ElementRef<HTMLElement>>('modal');

  /** Emitted when the user dismisses the panel. */
  readonly closed = output<void>();
  /** Emitted after tasks were written to the database. */
  readonly imported = output<ImportCommitResult>();

  readonly stage = signal<Stage>('idle');
  readonly preview = signal<ImportPreview | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly fileName = signal('');
  readonly dragActive = signal(false);
  readonly rowFilter = signal<RowFilter>('all');
  readonly skipDuplicates = signal(true);
  readonly includeWarnings = signal(true);
  readonly result = signal<ImportCommitResult | null>(null);
  readonly progress = signal<{ done: number; total: number }>({ done: 0, total: 0 });

  readonly maxPreviewRows = MAX_PREVIEW_ROWS;

  /** Name the template downloads as — the current date, e.g. `2026-09-13.xlsx`. */
  readonly templateFileName = this.importService.templateFileName();

  readonly problemCount = computed(
    () =>
      (this.preview()?.rows ?? []).filter(
        row => row.status === 'error' || row.status === 'warning' || row.status === 'duplicate'
      ).length
  );

  readonly visibleRows = computed<ImportRow[]>(() => {
    const rows = this.preview()?.rows ?? [];
    const filtered =
      this.rowFilter() === 'problems' ? rows.filter(row => row.status !== 'ready') : rows;
    return filtered.slice(0, MAX_PREVIEW_ROWS);
  });

  readonly hiddenRowCount = computed(() => {
    const rows = this.preview()?.rows ?? [];
    const filtered =
      this.rowFilter() === 'problems' ? rows.filter(row => row.status !== 'ready') : rows;
    return Math.max(0, filtered.length - MAX_PREVIEW_ROWS);
  });

  /** How many tasks the current options would create. */
  readonly selectedCount = computed(() => {
    const rows = this.preview()?.rows ?? [];
    return rows.filter(
      row =>
        row.task !== null &&
        (row.status === 'ready' ||
          (row.status === 'duplicate' && !this.skipDuplicates()) ||
          (row.status === 'warning' && this.includeWarnings()))
    ).length;
  });

  readonly progressDone = computed(() => this.progress().done);
  readonly progressTotal = computed(() => this.progress().total);
  readonly progressPercent = computed(() => {
    const { done, total } = this.progress();
    return total === 0 ? 0 : Math.round((done / total) * 100);
  });

  constructor() {
    afterNextRender(() => this.modal()?.nativeElement.focus());
  }

  // ── File selection ─────────────────────────────────────────────────────────

  browse(): void {
    this.fileInput()?.nativeElement.click();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragActive.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragActive.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.readFile(file);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file
    if (file) void this.readFile(file);
  }

  async readFile(file: File): Promise<void> {
    this.errorMessage.set(null);
    this.fileName.set(file.name);
    this.stage.set('reading');

    const preview = await this.importService.parseFile(file);
    if (preview.fatalError) {
      this.errorMessage.set(preview.fatalError);
      this.stage.set('idle');
      return;
    }
    if (preview.rows.length === 0) {
      this.errorMessage.set(
        preview.rowsWithoutTitle > 0
          ? `Found ${preview.rowsWithoutTitle} row(s) in "${preview.sheetName}", but none of them have a Title. Type a task in the Title column and try again.`
          : `No tasks were found in "${preview.sheetName}". Add your tasks below the header row and try again.`
      );
      this.stage.set('idle');
      return;
    }

    this.preview.set(preview);
    this.rowFilter.set('all');
    this.skipDuplicates.set(true);
    this.includeWarnings.set(true);
    this.stage.set('preview');
  }

  downloadTemplate(): void {
    this.importService.downloadTemplate();
  }

  // ── Options & actions ──────────────────────────────────────────────────────

  onSkipDuplicates(event: Event): void {
    this.skipDuplicates.set((event.target as HTMLInputElement).checked);
  }

  onIncludeWarnings(event: Event): void {
    this.includeWarnings.set((event.target as HTMLInputElement).checked);
  }

  async startImport(): Promise<void> {
    const preview = this.preview();
    if (!preview) return;

    const total = this.selectedCount();
    this.progress.set({ done: 0, total });
    this.stage.set('importing');

    const result = await this.importService.importRows(preview, {
      skipDuplicates: this.skipDuplicates(),
      includeWarnings: this.includeWarnings(),
      onProgress: (done, count) => this.progress.set({ done, total: count }),
    });

    this.result.set(result);
    this.stage.set('done');
    this.imported.emit(result);
  }

  reset(): void {
    this.preview.set(null);
    this.result.set(null);
    this.errorMessage.set(null);
    this.progress.set({ done: 0, total: 0 });
    this.stage.set('idle');
  }

  close(): void {
    // Never abandon a running import half-way through.
    if (this.stage() === 'importing') return;
    this.closed.emit();
  }

  statusLabel(status: ImportRow['status']): string {
    switch (status) {
      case 'ready':
        return 'Ready';
      case 'warning':
        return 'Warning';
      case 'duplicate':
        return 'Duplicate';
      default:
        return 'Skipped';
    }
  }
}
