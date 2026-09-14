/**
 * Types for the Excel/CSV task importer.
 *
 * The flow is deliberately two-phase: `TaskImportService.parseFile()` turns a
 * spreadsheet into a fully validated preview (nothing is written to the
 * database), and `TaskImportService.importRows()` persists the rows the user
 * confirmed.
 */

import { RecurrenceConfig, TaskQuadrant, TaskStatus } from './task.model';

/** Canonical field keys the importer understands. */
export type ImportFieldKey =
  | 'title'
  | 'description'
  | 'priority'
  | 'quadrant'
  | 'deadline'
  | 'status'
  | 'repeat'
  | 'repeatDays'
  | 'repeatEndDate'
  | 'tags'
  | 'addToToday';

/** A single spreadsheet cell reduced to the two things the importer needs. */
export interface ImportCell {
  /** Text content exactly as stored in the file. */
  text: string;
  /** Numeric value when the cell holds a number (used for Excel date serials). */
  numeric: number | null;
}

export type ImportRowStatus =
  /** Every value parsed cleanly and the row can be imported. */
  | 'ready'
  /** Importable, but something deserves attention (past deadline, ambiguous date…). */
  | 'warning'
  /** A task with the same title already exists (skipped when de-duplicating). */
  | 'duplicate'
  /** Cannot be imported (missing title, unrecognised value…). */
  | 'error';

/** The task payload produced by a successfully parsed row. */
export interface ImportedTask {
  title: string;
  description: string;
  priority: 1 | 2 | 3 | 4;
  status: TaskStatus;
  quadrant: TaskQuadrant | null;
  deadline: string | null;
  tags: string[];
  recurrence: RecurrenceConfig | null;
  /** When true the task is also placed on the Today list. */
  addToToday: boolean;
}

export interface ImportRow {
  /** 1-based row number as displayed by Excel. */
  rowNumber: number;
  status: ImportRowStatus;
  title: string;
  task: ImportedTask | null;
  errors: string[];
  warnings: string[];
  /** Original cell text keyed by field, for the preview table. */
  cells: Partial<Record<ImportFieldKey, string>>;
}

export interface ImportColumnMapping {
  field: ImportFieldKey;
  label: string;
  /** Header text found in the sheet. */
  header: string;
  /** Spreadsheet column letter, e.g. `C`. */
  column: string;
}

export type ImportSourceFormat = 'xlsx' | 'csv';

export interface ImportPreview {
  fileName: string;
  sheetName: string;
  format: ImportSourceFormat;
  /** Number of non-empty data rows found below the header. */
  rowsExamined: number;
  /**
   * Rows that were ignored because their Title cell was empty — the template's
   * own spare rows, or rows the user left unfinished.
   */
  rowsWithoutTitle: number;
  rows: ImportRow[];
  mapping: ImportColumnMapping[];
  /** Headers that matched no known field (ignored on import). */
  unknownHeaders: string[];
  readyCount: number;
  warningCount: number;
  duplicateCount: number;
  errorCount: number;
  /** Rows that can be imported right now (ready + warnings). */
  importableCount: number;
  /** Set when the file as a whole could not be read. */
  fatalError: string | null;
}

export interface ImportCommitOptions {
  /** Skip rows whose title already exists (default true). */
  skipDuplicates?: boolean;
  /** Import rows that produced warnings (default true). */
  includeWarnings?: boolean;
  /** Called after each task is written, for progress reporting. */
  onProgress?: (created: number, total: number) => void;
}

export interface ImportCommitResult {
  created: number;
  skipped: number;
}
