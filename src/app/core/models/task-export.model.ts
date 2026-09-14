/**
 * Types for the task export (CSV via `rm-ng-export-to-csv`).
 */

import { TaskStatus } from './task.model';

/** Quick date-range choices offered in the export panel. */
export type ExportRangeKey =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'thisWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'all'
  | 'custom';

/** Which task date the range is applied to (and used for the Date/Day columns). */
export type ExportDateField = 'deadline' | 'created' | 'completed';

export type ExportStatusFilter = 'all' | TaskStatus;
export type ExportPriorityFilter = 'all' | '1' | '2' | '3' | '4';

export interface ExportRangePreset {
  key: ExportRangeKey;
  label: string;
  /** Shown under the chips for the active preset. */
  hint: string;
}

export interface TaskExportOptions {
  range: ExportRangeKey;
  /** `YYYY-MM-DD`, only used when `range` is `custom`. */
  customFrom: string;
  customTo: string;
  dateField: ExportDateField;
  status: ExportStatusFilter;
  priority: ExportPriorityFilter;
  /** Keep tasks that have no value in the selected date field. */
  includeUndated: boolean;
  /** Append a totals block below the data rows. */
  includeSummary: boolean;
}

export interface ResolvedRange {
  /** Inclusive start (`YYYY-MM-DD`), or null for "all time". */
  from: string | null;
  /** Inclusive end (`YYYY-MM-DD`), or null for "all time". */
  to: string | null;
  label: string;
}

export interface TaskExportColumn {
  /** Key in the exported row object. */
  key: string;
  /** Column header written to the CSV (kept free of commas and quotes). */
  label: string;
}

/** A row of the export — flat key/value pairs as required by the CSV service. */
export type TaskExportRow = Record<string, string | number>;

export interface TaskExportPlan {
  rows: TaskExportRow[];
  columns: TaskExportColumn[];
  fileName: string;
  range: ResolvedRange;
  /** Tasks that matched the filters. */
  rowCount: number;
  /** Tasks kept only because "include undated" was on. */
  undatedCount: number;
  /** Totals block appended when `includeSummary` is enabled. */
  summary: TaskExportRow[];
  totalFocusMinutes: number;
  totalFocusSessions: number;
}

export interface TaskExportResult {
  rowCount: number;
  fileName: string;
}
