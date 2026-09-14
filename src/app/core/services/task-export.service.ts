import { Injectable, inject } from '@angular/core';
import { CsvHeaderMapping, RmNgExportToCsvService } from 'rm-ng-export-to-csv';
import { DbService } from './db.service';
import { TaskService } from './task.service';
import { PomodoroSession } from '../models/session.model';
import {
  TaskExportOptions,
  TaskExportPlan,
  TaskExportResult,
  TaskExportRow,
} from '../models/task-export.model';
import {
  TASK_EXPORT_COLUMNS,
  buildFocusMap,
  buildSummaryRows,
  buildTaskRow,
  exportFileName,
  resolveRange,
  selectTasksForExport,
  todayIso,
} from '../utils/task-export.util';

/**
 * Exports the task list to CSV using `rm-ng-export-to-csv`.
 *
 * The service collects everything the sheet needs — tasks, timer sessions for
 * focus totals, and the date range — and hands the CSV library a flat row per
 * task plus its header mapping.
 */
@Injectable({ providedIn: 'root' })
export class TaskExportService {
  private readonly tasks = inject(TaskService);
  private readonly db = inject(DbService);
  private readonly csv = inject(RmNgExportToCsvService);

  /**
   * Builds the export in memory (no download) so the panel can show an accurate
   * count and preview before the user commits.
   */
  async prepare(options: TaskExportOptions): Promise<TaskExportPlan> {
    const today = todayIso();
    const range = resolveRange(options.range, options.customFrom, options.customTo, today);
    const sessions = await this.loadSessions();
    const focus = buildFocusMap(sessions);

    const { tasks, undatedCount } = selectTasksForExport({
      tasks: this.tasks.tasks(),
      options,
      today,
    });

    const rows = tasks.map(task => buildTaskRow(task, options.dateField, focus, today));
    const totalFocusMinutes = rows.reduce((total, row) => total + Number(row['focusMinutes'] ?? 0), 0);
    const totalFocusSessions = rows.reduce((total, row) => total + Number(row['focusSessions'] ?? 0), 0);

    return {
      rows,
      columns: [...TASK_EXPORT_COLUMNS],
      fileName: exportFileName(today),
      range,
      rowCount: rows.length,
      undatedCount,
      summary: options.includeSummary
        ? buildSummaryRows(tasks, range, options.dateField, focus)
        : [],
      totalFocusMinutes,
      totalFocusSessions,
    };
  }

  /** Writes the prepared rows to a CSV download. Returns null when there is nothing to export. */
  async exportTasks(options: TaskExportOptions): Promise<TaskExportResult | null> {
    const plan = await this.prepare(options);
    if (plan.rowCount === 0) return null;

    const data: TaskExportRow[] = [...plan.rows, ...plan.summary];
    this.csv.exportAsCSV(data, plan.fileName, this.headerMapping());
    return { rowCount: plan.rowCount, fileName: plan.fileName };
  }

  /**
   * Header mapping for the CSV service.
   *
   * Note: the library quotes every data cell but writes the header row verbatim,
   * so the BOM that makes Excel read the file as UTF-8 is carried by the first
   * header label (titles, tags and descriptions may contain non-ASCII text).
   */
  private headerMapping(): CsvHeaderMapping[] {
    return TASK_EXPORT_COLUMNS.map((column, index) => ({
      label: index === 0 ? `\uFEFF${column.label}` : column.label,
      key: column.key,
    }));
  }

  private async loadSessions(): Promise<PomodoroSession[]> {
    try {
      await this.db.init();
      return await this.db.getAllSessions();
    } catch {
      // Focus totals are a bonus column — never block an export on them.
      return [];
    }
  }
}
