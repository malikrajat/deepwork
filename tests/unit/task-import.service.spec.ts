import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { TaskImportService } from '../../src/app/core/services/task-import.service';
import { TaskService } from '../../src/app/core/services/task.service';
import { Task } from '../../src/app/core/models/task.model';
import { parseXlsxWorkbook, pickTaskSheet, isoDateToExcelSerial } from '../../src/app/core/utils/xlsx.util';
import { unzip, utf8Decode } from '../../src/app/core/utils/zip.util';
import { todayIsoDate } from '../../src/app/core/utils/task-import.mapper';

/** Minimal stand-in for a browser File backed by bytes or text. */
function fakeFile(name: string, contents: Uint8Array | string): File {
  const bytes =
    typeof contents === 'string' ? new TextEncoder().encode(contents) : contents;
  return {
    name,
    size: bytes.length,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => (typeof contents === 'string' ? contents : new TextDecoder().decode(bytes)),
  } as unknown as File;
}

const BOM = '\ufeff';

describe('TaskImportService', () => {
  let service: TaskImportService;
  let existing: Task[];
  let created: Partial<Task>[];

  const makeMockTaskService = () => ({
    tasks: () => existing,
    createTask: vi.fn(async (data: Partial<Task> & { title: string }) => {
      const task = {
        id: `generated-${created.length + 1}`,
        description: '',
        priority: 3,
        status: 'todo',
        quadrant: null,
        deadline: null,
        tags: [],
        recurrence: null,
        todayOrder: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
        ...data,
      } as Task;
      created.push(task);
      existing = [task, ...existing];
      return task;
    }),
  });

  beforeEach(() => {
    existing = [];
    created = [];
    TestBed.configureTestingModule({
      providers: [TaskImportService, { provide: TaskService, useValue: makeMockTaskService() }],
    });
    service = TestBed.inject(TaskImportService);
  });

  afterEach(() => TestBed.resetTestingModule());

  // ── Template ───────────────────────────────────────────────────────────────

  describe('template', () => {
    it('is a parseable xlsx with a Tasks and an Instructions sheet', () => {
      const workbook = parseXlsxWorkbook(service.buildTemplate());
      expect(workbook.sheets.map(sheet => sheet.name)).toEqual(['Tasks', 'Instructions']);
    });

    it('has every Add Task field as a column', () => {
      const sheet = pickTaskSheet(parseXlsxWorkbook(service.buildTemplate()));
      expect(sheet.rows[0].map(cell => cell.text)).toEqual([
        'Title',
        'Description',
        'Priority',
        'Quadrant',
        'Deadline (YYYY-MM-DD)',
        'Status',
        'Repeat',
        'Repeat Days (Mon,Wed)',
        'Repeat End Date (YYYY-MM-DD)',
        'Tags (comma separated)',
        'Add to Today',
      ]);
    });

    it('pre-fills rows with the application defaults', () => {
      const today = todayIsoDate();
      const sheet = pickTaskSheet(parseXlsxWorkbook(service.buildTemplate()));
      const firstDefaultRow = sheet.rows[1].map(cell => cell.text);
      expect(firstDefaultRow[0]).toBe(''); // Title is left for the user
      expect(firstDefaultRow[2]).toBe('P3 — Medium');
      expect(firstDefaultRow[3]).toBe('Unassigned');
      expect(firstDefaultRow[5]).toBe('To Do');
      expect(firstDefaultRow[6]).toBe('No repeat');
      expect(firstDefaultRow[9]).toBe('task');
      expect(firstDefaultRow[10]).toBe('Yes');
      // Template ships 25 blank rows ready to type into.
      expect(sheet.rows.length).toBe(26);
    });

    it('pre-fills Deadline and Repeat End Date as real dates set to today', () => {
      const today = todayIsoDate();
      const buffer = service.buildTemplate();
      const sheet = pickTaskSheet(parseXlsxWorkbook(buffer));
      // Dates are stored as Excel serials, not text.
      expect(sheet.rows[1][4].numeric).toBe(isoDateToExcelSerial(today));
      expect(sheet.rows[1][8].numeric).toBe(isoDateToExcelSerial(today));
      const stylesXml = utf8Decode(unzip(buffer).get('xl/styles.xml')!);
      expect(stylesXml).toContain('formatCode="yyyy-mm-dd"');
      expect(stylesXml).toContain('numFmtId="164"');
    });

    it('attaches dropdowns for every enumerated option', () => {
      const parts = unzip(service.buildTemplate());
      const sheetXml = utf8Decode(parts.get('xl/worksheets/sheet1.xml')!);
      expect((sheetXml.match(/<dataValidation /g) ?? []).length).toBe(11);
      expect((sheetXml.match(/type="list"/g) ?? []).length).toBe(5);
      expect(sheetXml).toContain('&quot;P1 — Critical,P2 — High,P3 — Medium,P4 — Low&quot;');
      expect(sheetXml).toContain('&quot;Unassigned,Urgent + Important,Important,Urgent,Neither&quot;');
      expect(sheetXml).toContain('&quot;To Do,In Progress,Done&quot;');
      expect(sheetXml).toContain('&quot;No repeat,Daily,Weekly,Monthly&quot;');
      expect(sheetXml).toContain('&quot;Yes,No&quot;');
      expect(sheetXml).toContain('state="frozen"');
    });

    it('documents the date and free-text columns inside the sheet', () => {
      const sheetXml = utf8Decode(unzip(service.buildTemplate()).get('xl/worksheets/sheet1.xml')!);
      // Date columns accept any date, past included.
      expect((sheetXml.match(/type="date"/g) ?? []).length).toBe(2);
      expect(sheetXml).toContain('formula1="DATE(1900,1,1)"');
      expect(sheetXml).toContain('Past dates are allowed');
      // Free-text columns get length caps and an input hint.
      expect((sheetXml.match(/type="textLength"/g) ?? []).length).toBe(4);
      expect(sheetXml).toContain('Only used when Repeat = Weekly');
      expect(sheetXml).toContain('Labels for grouping');
      expect(sheetXml).toContain('Required. Type what needs to be done');
    });

    it('documents each column on the instructions sheet', () => {
      const workbook = parseXlsxWorkbook(service.buildTemplate());
      const instructions = workbook.sheets[1];
      const labels = instructions.rows.map(row => row[0]?.text);
      expect(labels).toContain('Title');
      expect(labels).toContain('Add to Today');
      expect(labels).toContain('How to use');
      const priorityRow = instructions.rows.find(row => row[0]?.text === 'Priority');
      expect(priorityRow?.[2].text).toBe('P3 — Medium');
      const deadlineRow = instructions.rows.find(row => row[0]?.text === 'Deadline');
      expect(deadlineRow?.[2].text).toBe(todayIsoDate());
      expect(deadlineRow?.[3].text).toContain('Past dates are allowed');
      const tagsRow = instructions.rows.find(row => row[0]?.text === 'Tags');
      expect(tagsRow?.[2].text).toBe('task');
    });
  });

  // ── Reading files ──────────────────────────────────────────────────────────

  describe('parseFile', () => {
    it('parses an Excel workbook and reports a preview', async () => {
      const sheetRows = [
        ['Title', 'Description', 'Priority', 'Quadrant', 'Deadline', 'Status', 'Repeat', 'Tags', 'Add to Today'],
        ['Imported from Excel', 'via upload', 'P1', 'Urgent + Important', '2027-01-15', 'In Progress', 'Daily', 'work', 'Yes'],
        ['Second task', '', 'P4', 'Neither', '', 'To Do', 'No repeat', '', 'No'],
      ];
      const csv = sheetRows.map(row => row.join(',')).join('\n');
      const preview = await service.parseFile(fakeFile('tasks.csv', csv));

      expect(preview.fatalError).toBeNull();
      expect(preview.format).toBe('csv');
      expect(preview.rowsExamined).toBe(2);
      expect(preview.readyCount).toBe(2);
      expect(preview.importableCount).toBe(2);
      expect(preview.mapping.map(entry => entry.field)).toContain('title');
    });

    it('parses a generated xlsx workbook', async () => {
      const template = service.buildTemplate();
      const preview = await service.parseFile(fakeFile('deepwork-task-template.xlsx', template));
      expect(preview.fatalError).toBeNull();
      expect(preview.format).toBe('xlsx');
      expect(preview.sheetName).toBe('Tasks');
      // Only the pre-filled default rows exist and they have no titles.
      expect(preview.rows).toHaveLength(0);
      expect(preview.errorCount).toBe(0);
    });

    it('skips rows whose title is blank even when defaults are present', async () => {
      const template = service.buildTemplate();
      const preview = await service.parseFile(fakeFile('template.xlsx', template));
      expect(preview.rowsExamined).toBe(0);
      expect(preview.rows).toHaveLength(0);
      // The unused template rows are reported as ignored, not as errors.
      expect(preview.rowsWithoutTitle).toBe(25);
      expect(preview.errorCount).toBe(0);
    });

    it('handles quoted CSV values with commas and newlines', async () => {
      const csv =
        'Title,Description,Priority\n' +
        '"Fix, then ship","Line one\nLine two",P2\n';
      const preview = await service.parseFile(fakeFile('tasks.csv', csv));
      expect(preview.rows[0].task?.title).toBe('Fix, then ship');
      expect(preview.rows[0].task?.description).toBe('Line one\nLine two');
      expect(preview.rows[0].task?.priority).toBe(2);
    });

    it('handles a UTF-8 BOM and semicolon delimiters', async () => {
      const csv = `${BOM}Task;Priority;Deadline\nBuy milk;P4;2027-02-01\n`;
      const preview = await service.parseFile(fakeFile('european.csv', csv));
      expect(preview.rows[0].task?.title).toBe('Buy milk');
      expect(preview.rows[0].task?.priority).toBe(4);
      expect(preview.rows[0].task?.deadline).toBe('2027-02-01');
    });

    it('marks rows that duplicate existing tasks', async () => {
      existing = [
        {
          id: 'existing',
          title: 'Already here',
          description: '',
          priority: 3,
          status: 'todo',
          quadrant: null,
          deadline: null,
          tags: [],
          recurrence: null,
          todayOrder: null,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ];
      const preview = await service.parseFile(fakeFile('dupes.csv', 'Title\nAlready here\nFresh task\n'));
      expect(preview.duplicateCount).toBe(1);
      expect(preview.readyCount).toBe(1);
    });

    it('reports a helpful error when there is no Title column', async () => {
      const preview = await service.parseFile(fakeFile('tasks.csv', 'Owner,Sprint\nme,12\n'));
      expect(preview.fatalError).toMatch(/No Title column/);
      expect(preview.fatalError).toMatch(/Owner/);
      expect(preview.rows).toEqual([]);
    });

    it('rejects legacy .xls files with guidance', async () => {
      const preview = await service.parseFile(fakeFile('old.xls', 'whatever'));
      expect(preview.fatalError).toMatch(/not supported/);
    });

    it('reports unreadable binary files instead of throwing', async () => {
      const preview = await service.parseFile(
        fakeFile('broken.xlsx', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]))
      );
      expect(preview.fatalError).toMatch(/Could not read this file|not a valid/i);
    });

    it('rejects files above the size limit', async () => {
      const preview = await service.parseFile({
        name: 'huge.xlsx',
        size: 20 * 1024 * 1024,
        arrayBuffer: async () => new ArrayBuffer(0),
        text: async () => '',
      } as unknown as File);
      expect(preview.fatalError).toMatch(/larger than 10 MB/);
    });

    it('treats a renamed CSV as CSV', async () => {
      const preview = await service.parseFile(fakeFile('data.xlsx', 'Title\nNot really a zip\n'));
      expect(preview.fatalError).toBeNull();
      expect(preview.format).toBe('csv');
      expect(preview.rows[0].task?.title).toBe('Not really a zip');
    });
  });

  // ── Writing tasks ──────────────────────────────────────────────────────────

  describe('importRows', () => {
    const previewFrom = async (csv: string) => service.parseFile(fakeFile('tasks.csv', csv));

    it('creates one task per ready row', async () => {
      const preview = await previewFrom('Title,Priority\nFirst,P1\nSecond,P2\n');
      const result = await service.importRows(preview);
      expect(result.created).toBe(2);
      expect(created.map(task => task.title)).toEqual(['First', 'Second']);
      expect(created[0].priority).toBe(1);
    });

    it('reports progress', async () => {
      const preview = await previewFrom('Title\nA\nB\nC\n');
      const seen: number[] = [];
      await service.importRows(preview, { onProgress: done => seen.push(done) });
      expect(seen).toEqual([1, 2, 3]);
    });

    it('skips duplicates by default and imports them when asked', async () => {
      existing = [
        {
          id: 'existing',
          title: 'Repeat me',
          description: '',
          priority: 3,
          status: 'todo',
          quadrant: null,
          deadline: null,
          tags: [],
          recurrence: null,
          todayOrder: null,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ];
      const preview = await previewFrom('Title\nRepeat me\nNew one\n');
      expect((await service.importRows(preview)).created).toBe(1);

      created = [];
      const second = await service.importRows(preview, { skipDuplicates: false });
      expect(second.created).toBe(2);
    });

    it('can exclude rows that only produced warnings', async () => {
      const preview = await previewFrom('Title,Deadline\nPast due,2020-01-01\n');
      expect(preview.rows[0].status).toBe('warning');
      expect((await service.importRows(preview, { includeWarnings: false })).created).toBe(0);
      expect((await service.importRows(preview, { includeWarnings: true })).created).toBe(1);
    });

    it('never imports rows with errors', async () => {
      const preview = await previewFrom('Title,Priority\nBroken,sometime\nFine,P2\n');
      const result = await service.importRows(preview);
      expect(result.created).toBe(1);
      expect(created[0].title).toBe('Fine');
      expect(result.skipped).toBe(1);
    });

    it('adds "Add to Today" rows to the Today list with sequential ordering', async () => {
      existing = [
        {
          id: 'existing',
          title: 'On today already',
          description: '',
          priority: 3,
          status: 'todo',
          quadrant: null,
          deadline: null,
          tags: [],
          recurrence: null,
          todayOrder: 4,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ];
      const preview = await previewFrom(
        'Title,Add to Today\nFirst today,Yes\nNot today,No\nSecond today,Yes\n'
      );
      await service.importRows(preview);
      expect(created[0].todayOrder).toBe(5);
      expect(created[1].todayOrder).toBeNull();
      expect(created[2].todayOrder).toBe(6);
    });

    it('carries recurrence across', async () => {
      const preview = await previewFrom(
        'Title,Repeat,Repeat Days,Repeat End Date\nStandup,Weekly,"Mon,Wed,Fri",2027-06-30\n'
      );
      await service.importRows(preview);
      expect(created[0].recurrence).toEqual({
        frequency: 'weekly',
        interval: 1,
        days: [1, 3, 5],
        endDate: '2027-06-30',
      });
    });
  });
});
