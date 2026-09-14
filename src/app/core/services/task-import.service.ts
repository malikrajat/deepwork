import { Injectable, inject } from '@angular/core';
import { TaskService } from './task.service';
import { Task, TaskQuadrant, TaskStatus } from '../models/task.model';
import {
  ImportCell,
  ImportCommitOptions,
  ImportCommitResult,
  ImportPreview,
  ImportRow,
} from '../models/task-import.model';
import { buildXlsx, parseXlsxWorkbook, pickTaskSheet, XlsxSheetSpec } from '../utils/xlsx.util';
import { parseCsv } from '../utils/csv.util';
import { utf8Decode } from '../utils/zip.util';
import {
  ADD_TO_TODAY_LABELS,
  IMPORT_DEFAULTS,
  IMPORT_FIELDS,
  QUADRANT_LABELS,
  PRIORITY_LABELS,
  REPEAT_LABELS,
  STATUS_LABELS,
  mapHeaders,
  normalizeTitle,
  parseImportRows,
  todayIsoDate,
} from '../utils/task-import.mapper';

/** Blank rows pre-filled with defaults in the generated template. */
export const TEMPLATE_BLANK_ROWS = 25;
/** How many rows of the template carry the dropdown validation. */
export const TEMPLATE_VALIDATION_ROWS = 500;

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 5000;

/** Spreadsheet → tasks. Also generates the downloadable Excel template. */
@Injectable({ providedIn: 'root' })
export class TaskImportService {
  private readonly taskService = inject(TaskService);

  // ───────────────────────────────────────────────────────────────────────────
  // Template
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Builds the `.xlsx` import template: one sheet to fill in (dropdowns for
   * every enumerated field, defaults pre-selected) plus an instructions sheet.
   */
  buildTemplate(): Uint8Array {
    return buildXlsx({
      title: 'DeepWork — task import template',
      sheets: [this.templateTasksSheet(), this.templateInstructionsSheet()],
    });
  }

  /**
   * File name of the generated template: the day it was created, e.g.
   * `2026-09-13.xlsx` — matching the date pre-filled in the date columns.
   */
  templateFileName(): string {
    return `${todayIsoDate()}.xlsx`;
  }

  /** Triggers a browser/Tauri download of the template. */
  downloadTemplate(): void {
    const bytes = this.buildTemplate();
    const blob = new Blob([bytes as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = this.templateFileName();
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private templateTasksSheet(): XlsxSheetSpec {
    const today = todayIsoDate();
    return {
      name: 'Tasks',
      freezeHeader: true,
      defaultRows: TEMPLATE_BLANK_ROWS,
      validationRows: TEMPLATE_VALIDATION_ROWS,
      columns: [
        {
          header: 'Title',
          width: 40,
          maxLength: 200,
          hint: 'Required. Type what needs to be done. Rows left blank here are ignored.',
        },
        {
          header: 'Description',
          width: 40,
          maxLength: 2000,
          hint: 'Optional details. Free text, up to 2000 characters.',
        },
        {
          header: 'Priority',
          values: PRIORITY_LABELS,
          defaultValue: IMPORT_DEFAULTS.priority,
          align: 'center',
          width: 18,
          hint: 'Pick a priority (or type 1-4, or high/medium/low). Default: P3 — Medium.',
        },
        {
          header: 'Quadrant',
          values: QUADRANT_LABELS,
          defaultValue: IMPORT_DEFAULTS.quadrant,
          align: 'center',
          width: 20,
          hint: 'Eisenhower quadrant. Choose Unassigned to decide later. Default: Unassigned.',
        },
        {
          header: 'Deadline (YYYY-MM-DD)',
          width: 20,
          date: true,
          defaultValue: today,
          hint: `A date, typed as YYYY-MM-DD or picked from the calendar. Past dates are allowed — they import and are marked overdue. Pre-filled with today (${today}).`,
        },
        {
          header: 'Status',
          values: STATUS_LABELS,
          defaultValue: IMPORT_DEFAULTS.status,
          align: 'center',
          width: 16,
          hint: 'Where the task starts. Default: To Do.',
        },
        {
          header: 'Repeat',
          values: REPEAT_LABELS,
          defaultValue: IMPORT_DEFAULTS.repeat,
          align: 'center',
          width: 16,
          hint: 'How often the task repeats. Default: No repeat.',
        },
        {
          header: 'Repeat Days (Mon,Wed)',
          width: 20,
          maxLength: 60,
          hint: 'Only used when Repeat = Weekly. Example: Mon,Wed,Fri — leave blank otherwise.',
        },
        {
          header: 'Repeat End Date (YYYY-MM-DD)',
          width: 22,
          date: true,
          defaultValue: today,
          hint: `Last day the repeat may create tasks. Leave blank to repeat forever. Pre-filled with today (${today}).`,
        },
        {
          header: 'Tags (comma separated)',
          width: 22,
          maxLength: 200,
          defaultValue: IMPORT_DEFAULTS.tags,
          hint: 'Labels for grouping, e.g. task, work, urgent. Pre-filled with task.',
        },
        {
          header: 'Add to Today',
          values: ADD_TO_TODAY_LABELS,
          defaultValue: IMPORT_DEFAULTS.addToToday,
          align: 'center',
          width: 18,
          hint: 'Yes also puts the task on your Today list. Default: Yes.',
        },
      ],
    };
  }

  private templateInstructionsSheet(): XlsxSheetSpec {
    const today = todayIsoDate();
    const example = (() => {
      const ahead = new Date();
      ahead.setDate(ahead.getDate() + 7);
      return todayIsoDate(ahead);
    })();
    const columns = [
      { header: 'Column', width: 18 },
      { header: 'Required', width: 11, align: 'center' as const },
      { header: 'Default', width: 18, align: 'center' as const },
      { header: 'Accepted values / format', width: 62, wrap: true, muted: true },
    ];

    const details: Record<string, string> = {
      title: 'The task text. Required — any row you leave blank here is ignored on import.',
      description: 'Free text, up to 2000 characters.',
      priority: `${PRIORITY_LABELS.join(' | ')} — you may also use 1-4, or words such as high/medium/low.`,
      quadrant: `${QUADRANT_LABELS.join(' | ')} — Eisenhower matrix placement.`,
      deadline: `A date, typed as YYYY-MM-DD (e.g. ${example}) or picked from the calendar. Past dates are allowed: they import normally and are marked overdue in the preview. Pre-filled with today (${today}).`,
      status: `${STATUS_LABELS.join(' | ')}.`,
      repeat: `${REPEAT_LABELS.join(' | ')}.`,
      repeatDays: 'Only for Weekly: e.g. Mon,Wed,Fri — or weekdays such as Monday Wednesday.',
      repeatEndDate: `Last day the repeat may still create a task (YYYY-MM-DD). Leave blank to repeat forever. Pre-filled with today (${today}).`,
      tags: 'Comma separated labels, e.g. task, work, urgent. Pre-filled with "task".',
      addToToday: 'Yes | No — Yes also adds the task to your Today list.',
    };

    const rows = IMPORT_FIELDS.map(field => {
      const defaultKey = field.key as keyof typeof IMPORT_DEFAULTS;
      const defaultValue =
        field.key === 'deadline' || field.key === 'repeatEndDate'
          ? today
          : defaultKey in IMPORT_DEFAULTS
            ? IMPORT_DEFAULTS[defaultKey]
            : '';
      return [field.label, field.required ? 'Yes' : 'No', String(defaultValue), details[field.key] ?? ''];
    });

    rows.push(['', '', '', '']);
    rows.push([
      'How to use',
      '',
      '',
      '1. Type your tasks in the "Tasks" sheet. Every option is a dropdown and the default value is already selected.',
    ]);
    rows.push(['', '', '', '2. Hover or click a cell to see what it expects; the same information is in this table.']);
    rows.push(['', '', '', '3. Save the file, then use Tasks → Import in DeepWork and pick the file.']);
    rows.push([
      '',
      '',
      '',
      '4. Check the preview, then confirm. Only this "Tasks" sheet is read; this instructions sheet is ignored.',
    ]);
    rows.push(['', '', '', '']);
    rows.push([
      'Good to know',
      '',
      '',
      'Nothing is saved until you confirm the preview, and rows without a Title are ignored.',
    ]);
    rows.push([
      '',
      '',
      '',
      'Column order does not matter, extra columns are ignored, and common header names (Task, Due Date, Prio, …) are recognised.',
    ]);
    rows.push([
      '',
      '',
      '',
      'Importing the same file twice creates duplicates — DeepWork warns you and can skip them automatically.',
    ]);
    rows.push([
      '',
      '',
      '',
      `Dates: any deadline is accepted, past or future. Today is ${today}.`,
    ]);

    return {
      name: 'Instructions',
      columns,
      rows,
      freezeHeader: true,
      autoFilter: false,
      validationRows: 0,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Reading
  // ───────────────────────────────────────────────────────────────────────────

  /** Reads and validates a spreadsheet without touching the database. */
  async parseFile(file: File): Promise<ImportPreview> {
    const fileName = file?.name || 'workbook.xlsx';
    const base: ImportPreview = {
      fileName,
      sheetName: '',
      format: 'xlsx',
      rowsExamined: 0,
      rowsWithoutTitle: 0,
      rows: [],
      mapping: [],
      unknownHeaders: [],
      readyCount: 0,
      warningCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      importableCount: 0,
      fatalError: null,
    };

    const fatal = (message: string): ImportPreview => ({ ...base, fatalError: message });

    try {
      if (file.size > MAX_FILE_BYTES) {
        return fatal('That file is larger than 10 MB. Split it into smaller files and import them one at a time.');
      }

      const lower = fileName.toLowerCase();
      if (lower.endsWith('.xls')) {
        return fatal(
          'Legacy .xls workbooks are not supported. In Excel use "Save As → Excel Workbook (.xlsx)", or export the sheet as CSV.'
        );
      }

      let rows: ImportCell[][];
      let format: ImportPreview['format'];
      let sheetName: string;

      const isCsv = lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt');
      if (isCsv) {
        rows = this.cellsFromCsv(await file.text());
        format = 'csv';
        sheetName = 'CSV file';
      } else {
        const buffer = new Uint8Array(await file.arrayBuffer());
        const looksLikeZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
        if (!looksLikeZip) {
          // Renamed CSV or plain text export.
          rows = this.cellsFromCsv(utf8Decode(buffer));
          format = 'csv';
          sheetName = 'Text file';
        } else {
          const sheet = pickTaskSheet(parseXlsxWorkbook(buffer));
          rows = sheet.rows.map(row => row.map(cell => ({ text: cell.text, numeric: cell.numeric })));
          format = 'xlsx';
          sheetName = sheet.name;
        }
      }

      if (rows.length > MAX_ROWS) {
        return fatal(`That sheet has more than ${MAX_ROWS} rows. Split it into smaller files.`);
      }

      const header = mapHeaders(rows);
      const headerTexts = (rows[header.headerRowIndex] ?? [])
        .map(cell => (cell?.text ?? '').trim())
        .filter(text => text !== '');

      if (header.missingTitle) {
        const found = headerTexts.length
          ? `Columns found: ${headerTexts.slice(0, 12).join(', ')}.`
          : 'The sheet appears to be empty.';
        return {
          ...base,
          format,
          sheetName,
          unknownHeaders: headerTexts,
          fatalError: `No Title column found. Add a column called "Title" (or Task, Name, Todo…) and try again. ${found}`,
        };
      }

      const existingTitles = new Set(this.taskService.tasks().map(task => normalizeTitle(task.title)));
      const parsed = parseImportRows(rows, header, { existingTitles });

      let readyCount = 0;
      let warningCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;
      for (const row of parsed.rows) {
        if (row.status === 'ready') readyCount++;
        else if (row.status === 'warning') warningCount++;
        else if (row.status === 'duplicate') duplicateCount++;
        else errorCount++;
      }

      return {
        ...base,
        format,
        sheetName,
        rowsExamined: parsed.rowsExamined,
        rowsWithoutTitle: parsed.rowsWithoutTitle,
        rows: parsed.rows,
        mapping: header.mapping,
        unknownHeaders: header.unknownHeaders,
        readyCount,
        warningCount,
        duplicateCount,
        errorCount,
        importableCount: readyCount + warningCount,
      };
    } catch (error) {
      return fatal(this.readableError(error));
    }
  }

  private cellsFromCsv(text: string): ImportCell[][] {
    return parseCsv(text).map(row =>
      row.map(value => {
        const trimmed = value.trim();
        const numeric = trimmed !== '' && /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : null;
        return { text: value, numeric };
      })
    );
  }

  private readableError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (/not a valid \.xlsx|not an Excel workbook|malformed|Corrupted|Unsupported compression|Zip64/i.test(message)) {
      return `${message} If the file opens in Excel, re-save it with "Save As → Excel Workbook (.xlsx)" and try again.`;
    }
    if (/password|encrypted/i.test(message)) {
      return 'This workbook is password protected. Remove the password in Excel and try again.';
    }
    return `Could not read this file. ${message}`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Writing
  // ───────────────────────────────────────────────────────────────────────────

  /** Persists the confirmed rows, returning how many tasks were created. */
  async importRows(preview: ImportPreview, options: ImportCommitOptions = {}): Promise<ImportCommitResult> {
    const skipDuplicates = options.skipDuplicates ?? true;
    const includeWarnings = options.includeWarnings ?? true;

    const selected = preview.rows.filter(row =>
      this.shouldImport(row, skipDuplicates, includeWarnings)
    );

    const highestOrder = this.taskService
      .tasks()
      .reduce((max, task) => (task.todayOrder !== null ? Math.max(max, task.todayOrder) : max), 0);
    let nextTodayOrder = highestOrder + 1;

    let created = 0;
    let skipped = 0;

    for (const row of preview.rows) {
      if (!this.shouldImport(row, skipDuplicates, includeWarnings) || !row.task) {
        skipped++;
        continue;
      }

      const task: Partial<Task> & { title: string } = {
        title: row.task.title,
        description: row.task.description,
        priority: row.task.priority,
        status: row.task.status as TaskStatus,
        quadrant: row.task.quadrant as TaskQuadrant | null,
        deadline: row.task.deadline,
        tags: row.task.tags,
        recurrence: row.task.recurrence,
        todayOrder: row.task.addToToday ? nextTodayOrder++ : null,
      };

      await this.taskService.createTask(task);
      created++;
      options.onProgress?.(created, selected.length);
    }

    return { created, skipped };
  }

  private shouldImport(row: ImportRow, skipDuplicates: boolean, includeWarnings: boolean): boolean {
    if (!row.task) return false;
    if (row.status === 'ready') return true;
    if (row.status === 'duplicate') return !skipDuplicates;
    if (row.status === 'warning') return includeWarnings;
    return false;
  }
}
