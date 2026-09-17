import { describe, it, expect } from 'vitest';
import {
  IMPORT_DEFAULTS,
  QUADRANT_LABELS,
  excelSerialToIsoDate,
  mapHeaders,
  normalizeHeader,
  parseAddToToday,
  parseDate,
  parseImportRows,
  parsePriority,
  parseQuadrant,
  parseRepeat,
  parseRepeatDays,
  parseStatus,
  parseTags,
  todayIsoDate,
} from '../../src/app/core/utils/task-import.mapper';
import { ImportCell } from '../../src/app/core/models/task-import.model';

/** Convenience: builds sheet rows from plain strings. */
function rows(...values: string[][]): ImportCell[][] {
  return values.map(row => row.map(text => ({ text, numeric: null })));
}

const cell = (text: string, numeric: number | null = null): ImportCell => ({ text, numeric });

function todayShift(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

describe('header mapping', () => {
  it('maps the template headers', () => {
    const result = mapHeaders(
      rows(
        [
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
        ],
        ['A task']
      )
    );
    expect(result.headerRowIndex).toBe(0);
    expect(result.missingTitle).toBe(false);
    expect(result.mapping.map(entry => entry.field)).toEqual([
      'title',
      'description',
      'priority',
      'quadrant',
      'deadline',
      'status',
      'repeat',
      'repeatDays',
      'repeatEndDate',
      'tags',
      'addToToday',
    ]);
    expect(result.mapping.find(entry => entry.field === 'priority')?.column).toBe('C');
  });

  it('ignores the format hints in decorated template headers', () => {
    const result = mapHeaders(
      rows(['Deadline (YYYY-MM-DD)', 'Repeat Days (Mon,Wed)', 'Tags (comma separated)', 'Title *'], ['a', 'b', 'c', 'd'])
    );
    expect(result.mapping.map(entry => entry.field)).toEqual(['title', 'deadline', 'repeatDays', 'tags']);
    expect(result.unknownHeaders).toEqual([]);
  });

  it('recognises common alternative header names', () => {
    const result = mapHeaders(rows(['Task', 'Notes', 'Prio', 'Due Date', 'Labels'], ['A task']));
    expect([...result.columns.keys()].sort()).toEqual(['deadline', 'description', 'priority', 'tags', 'title']);
  });

  it('ignores unknown columns and reports them', () => {
    const result = mapHeaders(rows(['Title', 'Owner', 'Sprint'], ['A task']));
    expect(result.unknownHeaders).toEqual(['Owner', 'Sprint']);
  });

  it('finds the header row below a report title', () => {
    const result = mapHeaders(
      rows(['Sprint 12 task export', ''], ['', ''], ['Title', 'Priority', 'Deadline'], ['Task one', 'P1', '2026-01-01'])
    );
    expect(result.headerRowIndex).toBe(2);
    const parsed = parseImportRows(
      rows(['Sprint 12 task export', ''], ['', ''], ['Title', 'Priority', 'Deadline'], ['Task one', 'P1', '2026-01-01']),
      result
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].rowNumber).toBe(4);
    expect(parsed.rows[0].task?.priority).toBe(1);
  });

  it('flags a sheet without a title column', () => {
    const result = mapHeaders(rows(['Owner', 'Notes'], ['x', 'y']));
    expect(result.missingTitle).toBe(true);
  });

  it('normalises decorated headers', () => {
    expect(normalizeHeader('Title *')).toBe('title');
    expect(normalizeHeader('Due Date (optional)')).toBe('duedate');
    expect(normalizeHeader('PRIORITY')).toBe('priority');
  });
});

describe('value parsers', () => {
  it('parses priority from labels, numbers and keywords', () => {
    expect(parsePriority('P1 — Critical').value).toBe(1);
    expect(parsePriority('p2 - high').value).toBe(2);
    expect(parsePriority('3').value).toBe(3);
    expect(parsePriority('P4').value).toBe(4);
    expect(parsePriority('critical').value).toBe(1);
    expect(parsePriority('low').value).toBe(4);
    expect(parsePriority('').value).toBe(3);
    expect(parsePriority('whenever').error).toMatch(/not recognised/);
  });

  it('parses status from labels and keywords', () => {
    expect(parseStatus('To Do').value).toBe('todo');
    expect(parseStatus('In Progress').value).toBe('in-progress');
    expect(parseStatus('doing').value).toBe('in-progress');
    expect(parseStatus('Done').value).toBe('done');
    expect(parseStatus('COMPLETED').value).toBe('done');
    expect(parseStatus('').value).toBe('todo');
    expect(parseStatus('maybe').error).toBeTruthy();
  });

  it('parses quadrants from form labels and matrix names', () => {
    expect(parseQuadrant('Urgent + Important').value).toBe('urgent-important');
    expect(parseQuadrant('Important').value).toBe('important');
    expect(parseQuadrant('Urgent').value).toBe('urgent');
    expect(parseQuadrant('Neither').value).toBe('neither');
    expect(parseQuadrant('Unassigned').value).toBeNull();
    expect(parseQuadrant('Q1').value).toBe('urgent-important');
    expect(parseQuadrant('eliminate').value).toBe('neither');
    expect(parseQuadrant('').value).toBeNull();
    expect(parseQuadrant('somewhere').error).toBeTruthy();
  });

  it('parses repeat frequencies', () => {
    expect(parseRepeat('No repeat').value).toBeNull();
    expect(parseRepeat('Daily').value).toBe('daily');
    expect(parseRepeat('weekly').value).toBe('weekly');
    expect(parseRepeat('Every month').value).toBe('monthly');
    expect(parseRepeat('').value).toBeNull();
    expect(parseRepeat('hourly').error).toBeTruthy();
  });

  it('parses repeat days from names and numbers', () => {
    expect(parseRepeatDays('Mon,Wed,Fri').value).toEqual([1, 3, 5]);
    expect(parseRepeatDays('monday wednesday').value).toEqual([1, 3]);
    expect(parseRepeatDays('1; 5').value).toEqual([1, 5]);
    expect(parseRepeatDays('').value).toEqual([]);
    expect(parseRepeatDays('Funday').error).toMatch(/not recognised/);
  });

  it('parses the Add to Today flag', () => {
    expect(parseAddToToday('Yes').value).toBe(true);
    expect(parseAddToToday('no').value).toBe(false);
    expect(parseAddToToday('').value).toBe(false);
    expect(parseAddToToday('perhaps').error).toBeTruthy();
  });

  it('splits and de-duplicates tags', () => {
    expect(parseTags('work, deep, work')).toEqual(['work', 'deep']);
    expect(parseTags('')).toEqual([]);
  });
});

describe('date parsing', () => {
  it('parses ISO dates', () => {
    expect(parseDate(cell('2026-03-14')).value).toBe('2026-03-14');
    expect(parseDate(cell('2026/3/4')).value).toBe('2026-03-04');
    expect(parseDate(cell('2026-03-14T09:30:00')).value).toBe('2026-03-14');
  });

  it('converts Excel serial dates', () => {
    // 46095 is how Excel stores 2026-03-14.
    expect(parseDate(cell('46095', 46095)).value).toBe('2026-03-14');
    expect(excelSerialToIsoDate(45658)).toBe('2025-01-01');
    expect(excelSerialToIsoDate(1)).toBe('1900-01-01');
  });

  it('parses day-first dates when the day cannot be a month', () => {
    expect(parseDate(cell('14/03/2026')).value).toBe('2026-03-14');
    expect(parseDate(cell('31-12-2026')).value).toBe('2026-12-31');
  });

  it('warns about ambiguous numeric dates', () => {
    const result = parseDate(cell('03/04/2026'));
    expect(result.value).toBe('2026-03-04');
    expect(result.warning).toMatch(/ambiguous/);
  });

  it('parses month names', () => {
    expect(parseDate(cell('14-Mar-2026')).value).toBe('2026-03-14');
    expect(parseDate(cell('March 4, 2026')).value).toBe('2026-03-04');
  });

  it('reports invalid dates and blanks', () => {
    expect(parseDate(cell('not a date')).error).toMatch(/not a valid date/);
    expect(parseDate(cell('2026-13-40')).error).toBeTruthy();
    expect(parseDate(cell('')).value).toBeNull();
    expect(parseDate(undefined).value).toBeNull();
  });
});

describe('row parsing', () => {
  // Title, Description, Priority, Quadrant, Deadline, Status, Repeat, Repeat Days, Tags, Add to Today
  const sheet = (dataRows: string[][]) =>
    rows(
      ['Title', 'Description', 'Priority', 'Quadrant', 'Deadline (YYYY-MM-DD)', 'Status', 'Repeat', 'Repeat Days (Mon,Wed)', 'Tags (comma separated)', 'Add to Today'],
      ...dataRows
    );

  it('produces a ready row with the app defaults', () => {
    const sheetRows = sheet([['Write the report']]);
    const parsed = parseImportRows(sheetRows, mapHeaders(sheetRows));
    expect(parsed.rowsExamined).toBe(1);
    expect(parsed.rows[0].status).toBe('ready');
    expect(parsed.rows[0].task).toMatchObject({
      title: 'Write the report',
      priority: 3,
      status: 'todo',
      quadrant: null,
      deadline: null,
      addToToday: false,
    });
  });

  it('maps every field', () => {
    const sheetRows = sheet([
      ['Ship release', 'Cut the build', 'P1', 'Urgent + Important', todayShift(3), 'In Progress', 'Weekly', 'Mon,Wed', 'work, release', 'Yes'],
    ]);
    const row = parseImportRows(sheetRows, mapHeaders(sheetRows)).rows[0];
    expect(row.status).toBe('ready');
    expect(row.task).toMatchObject({
      description: 'Cut the build',
      priority: 1,
      quadrant: 'urgent-important',
      deadline: todayShift(3),
      status: 'in-progress',
      tags: ['work', 'release'],
      addToToday: true,
      recurrence: { frequency: 'weekly', interval: 1, days: [1, 3], endDate: undefined },
    });
  });

  it('skips fully blank rows but keeps row numbers aligned', () => {
    const sheetRows = sheet([['First'], [''], ['Third']]);
    const parsed = parseImportRows(sheetRows, mapHeaders(sheetRows));
    expect(parsed.rowsExamined).toBe(2);
    expect(parsed.rows.map(row => row.rowNumber)).toEqual([2, 4]);
  });

  it('ignores rows without a title and counts them', () => {
    const sheetRows = sheet([['', 'a description but no title'], ['A real task'], ['', '', 'P1']]);
    const parsed = parseImportRows(sheetRows, mapHeaders(sheetRows));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].title).toBe('A real task');
    expect(parsed.rowsExamined).toBe(1);
    expect(parsed.rowsWithoutTitle).toBe(2);
  });

  it('errors on unrecognised values', () => {
    const sheetRows = sheet([['Task', '', 'sometime', 'nowhere', '2026-01-01', 'soon', 'hourly', '', '', 'maybe']]);
    const row = parseImportRows(sheetRows, mapHeaders(sheetRows)).rows[0];
    expect(row.status).toBe('error');
    expect(row.errors).toHaveLength(5);
  });

  it('warns about past deadlines but still imports', () => {
    const sheetRows = sheet([['Overdue task', '', '', '', todayShift(-5)]]);
    const row = parseImportRows(sheetRows, mapHeaders(sheetRows)).rows[0];
    expect(row.status).toBe('warning');
    expect(row.warnings.join(' ')).toMatch(/in the past/);
    expect(row.task?.deadline).toBe(todayShift(-5));
  });

  it('flags duplicates by normalised title', () => {
    const sheetRows = sheet([['Write   the Report']]);
    const parsed = parseImportRows(sheetRows, mapHeaders(sheetRows), {
      existingTitles: new Set(['write the report']),
    });
    expect(parsed.rows[0].status).toBe('duplicate');
    expect(parsed.rows[0].task).not.toBeNull();
  });

  it('warns when a title repeats inside the same file', () => {
    const sheetRows = sheet([['Same title'], ['Another task'], ['Same title']]);
    const parsed = parseImportRows(sheetRows, mapHeaders(sheetRows));
    expect(parsed.rows[0].status).toBe('ready');
    expect(parsed.rows[1].status).toBe('ready');
    expect(parsed.rows[2].status).toBe('warning');
    expect(parsed.rows[2].warnings.join(' ')).toMatch(/Row 2 in this file already uses the same title/);
    // The row stays importable — repeating a title can be intentional.
    expect(parsed.rows[2].task).not.toBeNull();
  });

  it('ignores untouched template rows instead of reporting them as errors', () => {
    const sheetRows = rows(
      [
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
      ],
      ['', '', 'P3 — Medium', 'Unassigned', '2026-03-14', 'To Do', 'No repeat', '', '2026-03-14', 'task', 'Yes'],
      ['', '', 'P3 — Medium', 'Unassigned', '2026-03-14', 'To Do', 'No repeat', '', '2026-03-14', 'task', 'Yes']
    );
    const parsed = parseImportRows(sheetRows, mapHeaders(sheetRows));
    expect(parsed.rows).toEqual([]);
    expect(parsed.rowsExamined).toBe(0);
    expect(parsed.rowsWithoutTitle).toBe(2);
  });

  it('accepts the template default values without warnings', () => {
    const sheetRows = rows(
      [
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
      ],
      [
        'A prefilled row',
        '',
        IMPORT_DEFAULTS.priority,
        IMPORT_DEFAULTS.quadrant,
        todayIsoDate(),
        IMPORT_DEFAULTS.status,
        IMPORT_DEFAULTS.repeat,
        '',
        todayIsoDate(),
        IMPORT_DEFAULTS.tags,
        IMPORT_DEFAULTS.addToToday,
      ]
    );
    const row = parseImportRows(sheetRows, mapHeaders(sheetRows)).rows[0];
    expect(row.status).toBe('ready');
    expect(row.task?.quadrant).toBeNull();
    expect(row.task?.addToToday).toBe(true);
    expect(row.task?.tags).toEqual(['task']);
    expect(row.task?.deadline).toBe(todayIsoDate());
    expect(QUADRANT_LABELS[0]).toBe('Unassigned');
  });

  it('allows past deadlines but flags them', () => {
    const sheetRows = sheet([['Overdue but allowed', '', '', '', '2001-02-03']]);
    const row = parseImportRows(sheetRows, mapHeaders(sheetRows)).rows[0];
    expect(row.status).toBe('warning');
    expect(row.task?.deadline).toBe('2001-02-03');
    expect(row.warnings.join(' ')).toMatch(/in the past/);
  });
});
