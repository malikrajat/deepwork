/**
 * Pure spreadsheet → task mapping and validation.
 *
 * Kept free of Angular/IO so it can be unit-tested directly. The importer is
 * tolerant by design: it recognises the template's own dropdown labels, plain
 * keywords (`high`, `done`, `weekly`, …) and many common header aliases, so
 * task lists that already exist in Excel usually import without editing.
 */

import { PRIORITY_CONFIG, STATUS_CONFIG } from '../constants/theme.constants';
import { TaskQuadrant, TaskStatus } from '../models/task.model';
import {
  ImportCell,
  ImportColumnMapping,
  ImportFieldKey,
  ImportRow,
  ImportedTask,
} from '../models/task-import.model';

// ─────────────────────────────────────────────────────────────────────────────
// Option sets (single source of truth for the template and the parser)
// ─────────────────────────────────────────────────────────────────────────────

/** Priority labels exactly as offered by the Add Task form. */
export const PRIORITY_LABELS: readonly string[] = ([1, 2, 3, 4] as const).map(
  priority => PRIORITY_CONFIG[priority].label
);

/** Status labels exactly as shown in the app. */
export const STATUS_LABELS: readonly string[] = (['todo', 'in-progress', 'done'] as TaskStatus[]).map(
  status => STATUS_CONFIG[status].label
);

/** Quadrant labels exactly as offered by the Add Task form dropdown. */
export const QUADRANT_LABELS: readonly string[] = [
  'Unassigned',
  'Urgent + Important',
  'Important',
  'Urgent',
  'Neither',
];

/** Repeat labels exactly as offered by the Add Task form dropdown. */
export const REPEAT_LABELS: readonly string[] = ['No repeat', 'Daily', 'Weekly', 'Monthly'];

export const ADD_TO_TODAY_LABELS: readonly string[] = ['Yes', 'No'];

/** Today as an ISO `YYYY-MM-DD` string (used as the template's date default). */
export function todayIsoDate(today = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

/**
 * Values pre-filled into the template rows — mirrors the Add Task form defaults.
 * Deadline and Repeat End Date default to the day the template is downloaded,
 * so a task list typed today is scheduled for today out of the box.
 */
export const IMPORT_DEFAULTS = {
  priority: PRIORITY_CONFIG[3].label,
  quadrant: QUADRANT_LABELS[0],
  status: STATUS_CONFIG.todo.label,
  repeat: REPEAT_LABELS[0],
  addToToday: ADD_TO_TODAY_LABELS[0],
  tags: 'task',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Header recognition
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportFieldDefinition {
  key: ImportFieldKey;
  label: string;
  required: boolean;
  aliases: readonly string[];
}

export const IMPORT_FIELDS: readonly ImportFieldDefinition[] = [
  {
    key: 'title',
    label: 'Title',
    required: true,
    aliases: ['title', 'task', 'tasks', 'taskname', 'name', 'tasktitle', 'todo', 'item', 'workitem', 'summary', 'subject', 'activity', 'what'],
  },
  {
    key: 'description',
    label: 'Description',
    required: false,
    aliases: ['description', 'desc', 'details', 'detail', 'notes', 'note', 'comment', 'comments', 'memo', 'body', 'remarks'],
  },
  {
    key: 'priority',
    label: 'Priority',
    required: false,
    aliases: ['priority', 'prio', 'pri', 'prioritylevel', 'importance', 'urgentlevel'],
  },
  {
    key: 'quadrant',
    label: 'Quadrant',
    required: false,
    aliases: ['quadrant', 'quad', 'eisenhower', 'eisenhowerquadrant', 'matrix', 'matrixquadrant', 'category', 'bucket'],
  },
  {
    key: 'deadline',
    label: 'Deadline',
    required: false,
    aliases: ['deadline', 'due', 'duedate', 'dueon', 'deadlineon', 'date', 'targetdate', 'completeby', 'mustbedoneby'],
  },
  {
    key: 'status',
    label: 'Status',
    required: false,
    aliases: ['status', 'state', 'stage', 'taskstatus', 'progress'],
  },
  {
    key: 'repeat',
    label: 'Repeat',
    required: false,
    aliases: ['repeat', 'recurrence', 'recurring', 'frequency', 'repeats', 'repeatfrequency', 'repeatevery'],
  },
  {
    key: 'repeatDays',
    label: 'Repeat Days',
    required: false,
    aliases: ['repeatdays', 'days', 'weekdays', 'daysofweek', 'recurrencedays', 'repeaton', 'repeatondays'],
  },
  {
    key: 'repeatEndDate',
    label: 'Repeat End Date',
    required: false,
    aliases: ['repeatenddate', 'enddate', 'recurrenceend', 'recurrenceenddate', 'repeatuntil', 'until', 'repeattend'],
  },
  {
    key: 'tags',
    label: 'Tags',
    required: false,
    aliases: ['tags', 'tag', 'labels', 'label', 'keywords', 'contexts'],
  },
  {
    key: 'addToToday',
    label: 'Add to Today',
    required: false,
    aliases: ['addtotoday', 'today', 'todaylist', 'focustoday', 'istoday', 'fortoday', 'starred'],
  },
];

/** Lower-cases, unifies dashes and strips decoration such as `*` or `(optional)`. */
export function normalizeHeader(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[*?:]/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

const HEADER_INDEX = new Map<string, ImportFieldKey>();
for (const field of IMPORT_FIELDS) {
  HEADER_INDEX.set(normalizeHeader(field.label), field.key);
  for (const alias of field.aliases) HEADER_INDEX.set(normalizeHeader(alias), field.key);
}

export function columnLetter(index: number): string {
  let value = index + 1;
  let letters = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

export interface HeaderMappingResult {
  headerRowIndex: number;
  mapping: ImportColumnMapping[];
  unknownHeaders: string[];
  /** Canonical field key → column index in the row. */
  columns: Map<ImportFieldKey, number>;
  missingTitle: boolean;
}

/**
 * Finds the header row and maps its cells onto canonical fields.
 *
 * The header is not assumed to be the first row: spreadsheets that carry a
 * report title or blank spacer rows above the table are common, so the first
 * ten rows are scored by how many cells they recognise.
 */
export function mapHeaders(rows: ImportCell[][]): HeaderMappingResult {
  const limit = Math.min(rows.length, 10);
  let bestIndex = -1;
  let bestScore = 0;
  let fallbackIndex = -1;

  for (let index = 0; index < limit; index++) {
    const row = rows[index] ?? [];
    const texts = row.map(cell => (cell?.text ?? '').trim());
    if (texts.every(text => text === '')) continue;
    if (fallbackIndex < 0) fallbackIndex = index;

    let score = 0;
    texts.forEach(text => {
      if (HEADER_INDEX.has(normalizeHeader(text))) score++;
    });
    // Prefer rows that also contain a Title column.
    if (texts.some(text => HEADER_INDEX.get(normalizeHeader(text)) === 'title')) score += 0.5;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  const headerRowIndex = bestIndex >= 0 ? bestIndex : fallbackIndex >= 0 ? fallbackIndex : 0;
  const headerRow = rows[headerRowIndex] ?? [];

  const mapping: ImportColumnMapping[] = [];
  const unknownHeaders: string[] = [];
  const columns = new Map<ImportFieldKey, number>();
  const seen = new Set<ImportFieldKey>();

  headerRow.forEach((cell, index) => {
    const raw = (cell?.text ?? '').trim();
    if (raw === '') return;
    const key = HEADER_INDEX.get(normalizeHeader(raw));
    if (!key) {
      unknownHeaders.push(raw);
      return;
    }
    if (seen.has(key)) return; // first matching column wins
    seen.add(key);
    columns.set(key, index);
    const definition = IMPORT_FIELDS.find(field => field.key === key)!;
    mapping.push({ field: key, label: definition.label, header: raw, column: columnLetter(index) });
  });

  // Keep the mapping in the canonical field order for a stable preview.
  mapping.sort(
    (a, b) =>
      IMPORT_FIELDS.findIndex(field => field.key === a.field) -
      IMPORT_FIELDS.findIndex(field => field.key === b.field)
  );

  return {
    headerRowIndex,
    mapping,
    unknownHeaders,
    columns,
    missingTitle: !columns.has('title'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Value parsing
// ─────────────────────────────────────────────────────────────────────────────

interface ParseResult<T> {
  value: T | null;
  error: string | null;
}

const ok = <T>(value: T): ParseResult<T> => ({ value, error: null });
const fail = <T>(message: string): ParseResult<T> => ({ value: null, error: message });

function normalizeValue(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const PRIORITY_KEYWORDS: Record<string, 1 | 2 | 3 | 4> = {
  critical: 1,
  highest: 1,
  blocker: 1,
  urgent: 1,
  asap: 1,
  high: 2,
  important: 2,
  medium: 3,
  normal: 3,
  moderate: 3,
  low: 4,
  lowest: 4,
  minor: 4,
  trivial: 4,
};

const STATUS_KEYWORDS: Record<string, TaskStatus> = {
  todo: 'todo',
  to: 'todo',
  open: 'todo',
  pending: 'todo',
  notstarted: 'todo',
  backlog: 'todo',
  new: 'todo',
  inprogress: 'in-progress',
  doing: 'in-progress',
  started: 'in-progress',
  wip: 'in-progress',
  active: 'in-progress',
  ongoing: 'in-progress',
  done: 'done',
  complete: 'done',
  completed: 'done',
  finished: 'done',
  closed: 'done',
  resolved: 'done',
};

const QUADRANT_KEYWORDS: Record<string, TaskQuadrant | null> = {
  unassigned: null,
  none: null,
  na: null,
  no: null,
  urgentimportant: 'urgent-important',
  urgentandimportant: 'urgent-important',
  dofirst: 'urgent-important',
  q1: 'urgent-important',
  importantnoturgent: 'important',
  important: 'important',
  schedule: 'important',
  q2: 'important',
  urgentnotimportant: 'urgent',
  urgent: 'urgent',
  delegate: 'urgent',
  q3: 'urgent',
  neither: 'neither',
  noturgentnotimportant: 'neither',
  eliminate: 'neither',
  q4: 'neither',
};

const REPEAT_KEYWORDS: Record<string, 'daily' | 'weekly' | 'monthly' | null> = {
  norepeat: null,
  none: null,
  never: null,
  no: null,
  '-': null,
  daily: 'daily',
  day: 'daily',
  everyday: 'daily',
  weekly: 'weekly',
  week: 'weekly',
  everyweek: 'weekly',
  monthly: 'monthly',
  month: 'monthly',
  everymonth: 'monthly',
};

const DAY_KEYWORDS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const TRUTHY = new Set(['yes', 'y', 'true', '1', 'x', '✓', 'on', 'today']);
const FALSY = new Set(['no', 'n', 'false', '0', '', 'off', '-']);

export function parsePriority(text: string): ParseResult<1 | 2 | 3 | 4> {
  const normalized = normalizeValue(text);
  if (normalized === '') return ok(3);

  const labelIndex = PRIORITY_LABELS.findIndex(label => normalizeValue(label) === normalized);
  if (labelIndex >= 0) return ok((labelIndex + 1) as 1 | 2 | 3 | 4);

  const numeric = /^(?:p\s*)?([1-4])$/.exec(normalized);
  if (numeric) return ok(Number(numeric[1]) as 1 | 2 | 3 | 4);

  const keyword = PRIORITY_KEYWORDS[normalized.replace(/[^a-z]/g, '')];
  if (keyword) return ok(keyword);

  return fail(`Priority "${text.trim()}" is not recognised (use ${PRIORITY_LABELS.join(', ')} or 1-4)`);
}

export function parseStatus(text: string): ParseResult<TaskStatus> {
  const normalized = normalizeValue(text);
  if (normalized === '') return ok('todo');

  const labelIndex = STATUS_LABELS.findIndex(label => normalizeValue(label) === normalized);
  if (labelIndex >= 0) return ok((['todo', 'in-progress', 'done'] as TaskStatus[])[labelIndex]);

  const keyword = STATUS_KEYWORDS[normalized.replace(/[^a-z]/g, '')];
  if (keyword) return ok(keyword);

  return fail(`Status "${text.trim()}" is not recognised (use ${STATUS_LABELS.join(', ')})`);
}

export function parseQuadrant(text: string): ParseResult<TaskQuadrant | null> {
  const normalized = normalizeValue(text);
  if (normalized === '') return ok(null);

  const labelIndex = QUADRANT_LABELS.findIndex(label => normalizeValue(label) === normalized);
  if (labelIndex >= 0) {
    const quadrants: (TaskQuadrant | null)[] = [null, 'urgent-important', 'important', 'urgent', 'neither'];
    return ok(quadrants[labelIndex]);
  }

  const keyword = normalized.replace(/[^a-z0-9]/g, '');
  if (keyword in QUADRANT_KEYWORDS) return ok(QUADRANT_KEYWORDS[keyword]);

  return fail(`Quadrant "${text.trim()}" is not recognised (use ${QUADRANT_LABELS.join(', ')})`);
}

export function parseRepeat(text: string): ParseResult<'daily' | 'weekly' | 'monthly' | null> {
  const normalized = normalizeValue(text);
  if (normalized === '') return ok(null);

  const labelIndex = REPEAT_LABELS.findIndex(label => normalizeValue(label) === normalized);
  if (labelIndex >= 0) {
    const frequencies: ('daily' | 'weekly' | 'monthly' | null)[] = [null, 'daily', 'weekly', 'monthly'];
    return ok(frequencies[labelIndex]);
  }

  const keyword = normalized.replace(/[^a-z-]/g, '');
  if (keyword in REPEAT_KEYWORDS) return ok(REPEAT_KEYWORDS[keyword]);

  return fail(`Repeat "${text.trim()}" is not recognised (use ${REPEAT_LABELS.join(', ')})`);
}

/** Parses `Mon,Wed,Fri`, `Monday Wednesday`, or `1,3,5` (0 = Sunday). */
export function parseRepeatDays(text: string): ParseResult<number[]> {
  const normalized = normalizeValue(text);
  if (normalized === '') return ok([]);

  const days = new Set<number>();
  const tokens = normalized.split(/[,;/|]+|\s+/).filter(Boolean);
  for (const token of tokens) {
    const clean = token.replace(/[^a-z0-9]/g, '');
    if (clean === '') continue;
    if (/^[0-6]$/.test(clean)) {
      days.add(Number(clean));
      continue;
    }
    if (clean === '7') {
      days.add(0); // some lists treat Sunday as 7
      continue;
    }
    if (clean in DAY_KEYWORDS) {
      days.add(DAY_KEYWORDS[clean]);
      continue;
    }
    return fail(`Repeat day "${token.trim()}" is not recognised (use Mon,Tue,Wed,Thu,Fri,Sat,Sun)`);
  }

  return ok([...days].sort((a, b) => a - b));
}

export function parseAddToToday(text: string): ParseResult<boolean> {
  const normalized = normalizeValue(text);
  if (TRUTHY.has(normalized)) return ok(true);
  if (FALSY.has(normalized)) return ok(false);
  return fail(`Add to Today "${text.trim()}" is not recognised (use Yes or No)`);
}

export function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,;|]/)
        .map(tag => tag.trim())
        .filter(tag => tag !== '')
        .map(tag => tag.slice(0, 40))
    ),
  ].slice(0, 20);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Converts an Excel serial date (1900 date system) to an ISO `YYYY-MM-DD`. */
export function excelSerialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  // Serial 60 is the fictitious 1900-02-29, hence the epoch shift below 60.
  const epoch = serial > 59 ? Date.UTC(1899, 11, 30) : Date.UTC(1899, 11, 31);
  const date = new Date(epoch + Math.round(serial) * 86400000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export interface DateParse {
  value: string | null;
  error: string | null;
  /** Set when a `dd/mm` vs `mm/dd` guess was made. */
  warning: string | null;
}

const MONTH_NAMES = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

/** Parses the date formats users actually type into spreadsheets. */
export function parseDate(cell: ImportCell | undefined): DateParse {
  if (!cell) return { value: null, error: null, warning: null };
  const raw = (cell.text ?? '').trim();
  const numeric = cell.numeric;

  // A real Excel date cell arrives as a serial number.
  if (numeric !== null && numeric !== undefined && !/[a-z]/i.test(raw) && /^\d+(\.\d+)?$/.test(raw)) {
    const iso = excelSerialToIsoDate(numeric);
    if (iso) return { value: iso, error: null, warning: null };
    return { value: null, error: `Deadline "${raw}" is not a valid date`, warning: null };
  }

  if (raw === '') return { value: null, error: null, warning: null };

  // ISO / year-first: 2026-03-14, 2026/03/14, 2026-03-14T09:00
  const yearFirst = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(raw);
  if (yearFirst) {
    const iso = toIsoDate(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));
    return iso
      ? { value: iso, error: null, warning: null }
      : { value: null, error: `Deadline "${raw}" is not a valid date`, warning: null };
  }

  // Day/month-first or month/day-first: 14/03/2026, 3/14/2026, 14-03-26
  const numericFirst = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(raw);
  if (numericFirst) {
    const first = Number(numericFirst[1]);
    const second = Number(numericFirst[2]);
    let year = Number(numericFirst[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;

    let day: number;
    let month: number;
    let warning: string | null = null;
    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else if (second > 12 && first <= 12) {
      day = second;
      month = first;
    } else {
      // Genuinely ambiguous — Excel's own default is month first.
      month = first;
      day = second;
      warning = `Deadline "${raw}" is ambiguous; read as ${year}-${pad(month)}-${pad(day)} (month/day). Use YYYY-MM-DD to be certain.`;
    }
    const iso = toIsoDate(year, month, day);
    return iso
      ? { value: iso, error: null, warning }
      : { value: null, error: `Deadline "${raw}" is not a valid date`, warning: null };
  }

  // Day-month-name: 14-Mar-2026, 14 Mar 2026, Mar 14 2026, March 14, 2026
  const lower = raw.toLowerCase();
  if (MONTH_NAMES.some(name => lower.includes(name))) {
    const cleaned = raw.replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/,/g, ' ');
    const parsed = new Date(cleaned);
    if (!Number.isNaN(parsed.getTime())) {
      return {
        value: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
        error: null,
        warning: null,
      };
    }
  }

  return { value: null, error: `Deadline "${raw}" is not a valid date (use YYYY-MM-DD)`, warning: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Row parsing
// ─────────────────────────────────────────────────────────────────────────────

export interface ParseRowsOptions {
  /** Normalised titles of tasks that already exist — used to flag duplicates. */
  existingTitles?: Set<string>;
}

export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').trim();
}

function cellText(row: ImportCell[], index: number | undefined): string {
  if (index === undefined) return '';
  return (row[index]?.text ?? '').trim();
}

function cellAt(row: ImportCell[], index: number | undefined): ImportCell | undefined {
  if (index === undefined) return undefined;
  return row[index];
}

function toDateOnly(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/**
 * Converts data rows into validated import rows.
 *
 * @param rows All sheet rows including the header.
 * @param mapping Result of {@link mapHeaders}.
 */
export function parseImportRows(
  rows: ImportCell[][],
  mapping: HeaderMappingResult,
  options: ParseRowsOptions = {}
): { rows: ImportRow[]; rowsExamined: number; rowsWithoutTitle: number } {
  const result: ImportRow[] = [];
  const columns = mapping.columns;
  const today = toDateOnly(new Date());
  /** First row number seen for each title, so repeats inside one file are visible. */
  const seenTitles = new Map<string, number>();
  let rowsExamined = 0;
  let rowsWithoutTitle = 0;

  for (let index = mapping.headerRowIndex + 1; index < rows.length; index++) {
    const row = rows[index] ?? [];
    const rawCells: Partial<Record<ImportFieldKey, string>> = {};
    columns.forEach((columnIndex, key) => {
      const text = cellText(row, columnIndex);
      if (text !== '') rawCells[key] = text;
    });

    const hasContent = Object.keys(rawCells).length > 0;
    if (!hasContent) continue;

    const rowNumber = index + 1;
    const errors: string[] = [];
    const warnings: string[] = [];

    const priority = parsePriority(cellText(row, columns.get('priority')));
    const status = parseStatus(cellText(row, columns.get('status')));
    const quadrant = parseQuadrant(cellText(row, columns.get('quadrant')));
    const repeat = parseRepeat(cellText(row, columns.get('repeat')));
    const repeatDays = parseRepeatDays(cellText(row, columns.get('repeatDays')));
    const repeatDayValues = repeatDays.value ?? [];
    const addToToday = parseAddToToday(cellText(row, columns.get('addToToday')));
    const description = cellText(row, columns.get('description')).slice(0, 2000);
    const tags = parseTags(cellText(row, columns.get('tags')));
    const title = cellText(row, columns.get('title'));

    // The template ships spare rows pre-filled with default values (deadline,
    // tags, priority…), so a missing Title is the only signal that a row was
    // never used. Those rows are counted and ignored rather than reported as
    // errors — the panel surfaces the count so nothing disappears silently.
    if (title === '') {
      rowsWithoutTitle++;
      continue;
    }

    rowsExamined++;

    if (title.length > 200) {
      errors.push('Title is longer than 200 characters');
    }

    if (priority.error) errors.push(priority.error);
    if (status.error) errors.push(status.error);
    if (quadrant.error) errors.push(quadrant.error);
    if (repeat.error) errors.push(repeat.error);
    if (repeatDays.error) errors.push(repeatDays.error);

    const deadline = parseDate(cellAt(row, columns.get('deadline')));
    if (deadline.error) errors.push(deadline.error);
    if (deadline.warning) warnings.push(deadline.warning);
    if (deadline.value && deadline.value < today) {
      warnings.push(`Deadline ${deadline.value} is in the past`);
    }

    const repeatEnd = parseDate(cellAt(row, columns.get('repeatEndDate')));
    if (repeatEnd.error) errors.push(repeatEnd.error.replace('Deadline', 'Repeat end date'));
    if (addToToday.error) errors.push(addToToday.error);
    if (repeatEnd.value && repeat.value && repeatEnd.value < (deadline.value ?? today)) {
      warnings.push(`Repeat ends ${repeatEnd.value}, before the deadline`);
    }
    if (repeatDayValues.length > 0 && repeat.value !== 'weekly') {
      warnings.push('Repeat days only apply to weekly repeats');
    }

    const duplicate =
      title !== '' &&
      options.existingTitles !== undefined &&
      options.existingTitles.has(normalizeTitle(title));

    // Repeating a title inside the same sheet is usually an accident, so surface
    // it — but keep the row importable, because legitimate files do repeat one.
    if (title !== '') {
      const normalizedTitle = normalizeTitle(title);
      const firstRow = seenTitles.get(normalizedTitle);
      if (firstRow !== undefined) {
        warnings.push(`Row ${firstRow} in this file already uses the same title`);
      } else {
        seenTitles.set(normalizedTitle, rowNumber);
      }
    }

    let rowStatus: ImportRow['status'];
    if (errors.length > 0) rowStatus = 'error';
    else if (duplicate) rowStatus = 'duplicate';
    else if (warnings.length > 0) rowStatus = 'warning';
    else rowStatus = 'ready';

    const task: ImportedTask | null =
      errors.length > 0
        ? null
        : {
            title,
            description,
            priority: priority.value ?? 3,
            status: status.value ?? 'todo',
            quadrant: quadrant.value,
            deadline: deadline.value,
            tags,
            recurrence: repeat.value
              ? {
                  frequency: repeat.value,
                  interval: 1,
                  days:
                    repeat.value === 'weekly' && repeatDayValues.length > 0
                      ? repeatDayValues
                      : undefined,
                  endDate: repeatEnd.value ?? undefined,
                }
              : null,
            addToToday: addToToday.value ?? false,
          };

    result.push({ rowNumber, status: rowStatus, title, task, errors, warnings, cells: rawCells });
  }

  return { rows: result, rowsExamined, rowsWithoutTitle };
}
