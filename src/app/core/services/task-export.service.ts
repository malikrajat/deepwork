import { Injectable, inject } from '@angular/core';
import { DbService } from './db.service';
import { TaskService } from './task.service';
import { DownloadService } from './download.service';
import { PomodoroSession } from '../models/session.model';
import {
  TaskExportOptions,
  TaskExportPlan,
  TaskExportResult,
  TaskExportRow,
} from '../models/task-export.model';
import {
  buildCsvContent,
  buildFocusMap,
  buildSummaryRows,
  buildTaskRow,
  exportColumnsWithBom,
  exportFileName,
  resolveRange,
  selectTasksForExport,
  todayIso,
} from '../utils/task-export.util';

/** Content type Excel expects for a CSV. */
const CSV_MIME = 'text/csv;charset=utf-8;';

/**
 * Exports the task list to CSV.
 *
 * The service collects everything the sheet needs — tasks, timer sessions for
 * focus totals, and the date range — flattens it to a row per task, serialises it
 * to CSV text, and hands the bytes to `DownloadService`, which writes the file
 * and returns the path the user is told about.
 */
@Injectable({ providedIn: 'root' })
export class TaskExportService {
  private readonly tasks = inject(TaskService);
  private readonly db = inject(DbService);
  private readonly downloads = inject(DownloadService);

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
      columns: exportColumnsWithBom(),
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

  /** Writes the prepared rows to a CSV file. Returns null when there is nothing to export. */
  async exportTasks(options: TaskExportOptions): Promise<TaskExportResult | null> {
    const plan = await this.prepare(options);
    if (plan.rowCount === 0) return null;

    const data: TaskExportRow[] = [...plan.rows, ...plan.summary];
    const download = await this.downloads.save(
      plan.fileName,
      buildCsvContent(data, plan.columns),
      CSV_MIME
    );
    return { rowCount: plan.rowCount, fileName: plan.fileName, download };
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
