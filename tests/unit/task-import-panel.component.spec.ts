import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  TaskImportPanelComponent,
} from '../../src/app/shared/components/task-import-panel/task-import-panel.component';
import { TaskImportService } from '../../src/app/core/services/task-import.service';
import { DownloadService } from '../../src/app/core/services/download.service';
import { NotificationService } from '../../src/app/core/services/notification.service';
import { ImportPreview, ImportRow } from '../../src/app/core/models/task-import.model';

const SOURCE = resolve(
  __dirname,
  '../../src/app/shared/components/task-import-panel/task-import-panel.component.ts'
);

const row = (title: string, status: ImportRow['status'], rowNumber: number): ImportRow => ({
  rowNumber,
  status,
  title,
  task: {
    title,
    description: '',
    priority: 3,
    status: 'todo',
    quadrant: null,
    deadline: '2026-09-20',
    tags: ['task'],
    recurrence: null,
    addToToday: true,
  },
  errors: [],
  warnings: [],
  cells: { title },
});

const previewWith = (rows: ImportRow[]): ImportPreview => ({
  fileName: 'tasks.csv',
  sheetName: 'CSV file',
  format: 'csv',
  rowsExamined: rows.length,
  rowsWithoutTitle: 0,
  rows,
  mapping: [],
  unknownHeaders: [],
  readyCount: rows.filter(entry => entry.status === 'ready').length,
  warningCount: rows.filter(entry => entry.status === 'warning').length,
  duplicateCount: rows.filter(entry => entry.status === 'duplicate').length,
  errorCount: rows.filter(entry => entry.status === 'error').length,
  importableCount: rows.length,
  fatalError: null,
});

/**
 * A repeated title is the same work seen again on a later day, so the preview
 * labels it and still imports it. These tests pin that default down, since
 * getting it wrong silently swallows the day's tasks.
 *
 * NOTE: the template is not rendered here (see `desktop-prefs-panel.component.spec.ts`
 * for the JIT/signal-input constraint), so the panel is built inside an injection
 * context and the template's affordances are asserted against the source.
 */
describe('TaskImportPanelComponent', () => {
  let panel: TaskImportPanelComponent;
  let importService: {
    parseFile: ReturnType<typeof vi.fn>;
    importRows: ReturnType<typeof vi.fn>;
    templateFileName: ReturnType<typeof vi.fn>;
    downloadTemplate: ReturnType<typeof vi.fn>;
  };

  const setup = () => {
    TestBed.resetTestingModule();
    importService = {
      parseFile: vi.fn(async () => previewWith([])),
      importRows: vi.fn(async () => ({ created: 0, skipped: 0 })),
      templateFileName: vi.fn(() => '2026-09-20.xlsx'),
      downloadTemplate: vi.fn(async () => ({
        fileName: '2026-09-20.xlsx',
        folder: 'Downloads',
        location: 'C:\\Users\\Ada\\Downloads\\2026-09-20.xlsx',
      })),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: TaskImportService, useValue: importService },
        { provide: DownloadService, useValue: { describe: vi.fn(() => 'Downloads') } },
        { provide: NotificationService, useValue: { showToastMessage: vi.fn() } },
      ],
    });
    panel = TestBed.runInInjectionContext(() => new TaskImportPanelComponent());
  };

  beforeEach(() => setup());
  afterEach(() => TestBed.resetTestingModule());

  it('counts a repeated title as a task to import', () => {
    panel.preview.set(
      previewWith([row('Repeat me', 'duplicate', 2), row('Fresh task', 'ready', 3)])
    );

    expect(panel.skipDuplicates()).toBe(false);
    expect(panel.selectedCount()).toBe(2);
  });

  it('leaves repeated titles out only when the option is ticked', () => {
    panel.preview.set(
      previewWith([row('Repeat me', 'duplicate', 2), row('Fresh task', 'ready', 3)])
    );

    panel.onSkipDuplicates({ target: { checked: true } } as unknown as Event);

    expect(panel.selectedCount()).toBe(1);
  });

  it('starts a new file with repeated titles switched back on', async () => {
    panel.preview.set(previewWith([row('Repeat me', 'duplicate', 2)]));
    panel.onSkipDuplicates({ target: { checked: true } } as unknown as Event);
    importService.parseFile.mockResolvedValue(
      previewWith([row('Repeat me', 'duplicate', 2), row('Fresh task', 'ready', 3)])
    );

    await panel.readFile({ name: 'tasks.csv' } as File);

    expect(panel.skipDuplicates()).toBe(false);
    expect(panel.selectedCount()).toBe(2);
  });

  it('never counts rows that cannot be imported', () => {
    panel.preview.set(
      previewWith([
        row('Repeat me', 'duplicate', 2),
        row('Broken value', 'error', 3),
        row('Fresh task', 'ready', 4),
      ])
    );

    expect(panel.selectedCount()).toBe(2);
  });

  it('labels duplicates as imported in the preview, with an opt-out', () => {
    const source = readFileSync(SOURCE, 'utf8');

    expect(source).toContain('skipDuplicates = signal(false)');
    expect(source).toContain(
      'Skip these {{ data.duplicateCount }} row(s) instead of importing them'
    );
    expect(source).toContain('imported as a new task anyway');
  });
});
