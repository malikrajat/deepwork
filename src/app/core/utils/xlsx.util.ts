/**
 * Minimal, dependency-free SpreadsheetML (.xlsx) reader and writer.
 *
 * Why hand-rolled? The template we ship needs real Excel dropdowns
 * (`dataValidation`), which free spreadsheet libraries do not write; and the
 * importer needs a reader that works offline inside the Tauri webview without
 * shipping a ~1 MB third-party bundle. The XLSX container is just a ZIP of XML
 * parts, and both halves of that are implemented in `zip.util.ts`.
 *
 * Reading is namespace-agnostic (elements are matched by local name) and covers
 * what Excel, Google Sheets, LibreOffice and Numbers emit: shared strings,
 * inline strings, formula string results, booleans, numbers and sparse rows.
 */

import { unzip, zip, utf8Encode, utf8Decode, ZipInputFile } from './zip.util';

// ─────────────────────────────────────────────────────────────────────────────
// Public shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface XlsxCell {
  /** Text content of the cell, before any number formatting is applied. */
  text: string;
  /** Numeric value when the cell holds a number, otherwise null. */
  numeric: number | null;
}

export interface XlsxSheet {
  name: string;
  /** Sparse-safe rows: `rows[row][column]` is always defined for emitted rows. */
  rows: XlsxCell[][];
}

export interface ParsedWorkbook {
  sheets: XlsxSheet[];
}

export interface XlsxColumnSpec {
  header: string;
  /** Excel column width in character units. */
  width?: number;
  /** When present, a dropdown (`dataValidation` list) is attached to the column. */
  values?: readonly string[];
  /** Value pre-filled into generated rows. */
  defaultValue?: string;
  align?: 'left' | 'center';
  /** Wrap long text (used by the instructions sheet). */
  wrap?: boolean;
  /** Render with the muted italic style (used for helper columns). */
  muted?: boolean;
  /**
   * Treat the column as a real Excel date: `defaultValue` and any `YYYY-MM-DD`
   * cell value are written as date serials with a `yyyy-mm-dd` number format,
   * and the column gets a date validation accepting any past or future date.
   */
  date?: boolean;
  /** Adds a `textLength` validation so over-long entries are refused in Excel. */
  maxLength?: number;
  /** Input message shown when a cell of this column is selected. */
  hint?: string;
}

export interface XlsxSheetSpec {
  name: string;
  columns: XlsxColumnSpec[];
  /** Explicit data rows (one array of cell strings per row). */
  rows?: string[][];
  /** Extra blank rows pre-filled with each column's `defaultValue`. */
  defaultRows?: number;
  /** How many rows receive the dropdown validation (default 500). */
  validationRows?: number;
  freezeHeader?: boolean;
  /** Attach an auto-filter to the header row (default true when there is data). */
  autoFilter?: boolean;
}

export interface XlsxWorkbookSpec {
  title?: string;
  sheets: XlsxSheetSpec[];
}

export class XlsxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XlsxError';
  }
}

const MAX_ROWS = 20000;
const MAX_COLUMNS = 256;

// ─────────────────────────────────────────────────────────────────────────────
// XML helpers
// ─────────────────────────────────────────────────────────────────────────────

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return XML_ENTITIES[entity] ?? match;
  });
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Strip control characters that are illegal in XML 1.0.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

function parseXml(bytes: Uint8Array): Document {
  if (typeof DOMParser === 'undefined') {
    throw new XlsxError('This environment cannot parse .xlsx files (no XML parser available)');
  }
  const text = utf8Decode(bytes);
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const failure = doc.getElementsByTagName('parsererror')[0];
  if (failure || !doc.documentElement) {
    throw new XlsxError('The workbook contains malformed XML and could not be read');
  }
  return doc;
}

function childElements(element: Element, localName?: string): Element[] {
  const result: Element[] = [];
  for (let i = 0; i < element.children.length; i++) {
    const child = element.children[i];
    if (!localName || child.localName === localName) result.push(child);
  }
  return result;
}

function firstChild(element: Element, localName: string): Element | null {
  for (let i = 0; i < element.children.length; i++) {
    const child = element.children[i];
    if (child.localName === localName) return child;
  }
  return null;
}

function descendants(root: Document | Element, localName: string): Element[] {
  const all = root.getElementsByTagName('*');
  const result: Element[] = [];
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === localName) result.push(all[i]);
  }
  return result;
}

/** Concatenates every `<t>` descendant — handles rich-text runs (`<r><t>`). */
function richText(element: Element): string {
  const runs = descendants(element, 't');
  if (runs.length === 0) return element.textContent ?? '';
  return runs.map(run => run.textContent ?? '').join('');
}

/** Converts a cell reference such as `AB12` into a zero-based column index. */
function columnIndexFromRef(ref: string): number | null {
  const match = /^([A-Za-z]{1,3})/.exec(ref.trim());
  if (!match) return null;
  let index = 0;
  const letters = match[1].toUpperCase();
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

function columnLetter(index: number): string {
  let value = index + 1;
  let letters = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading
// ─────────────────────────────────────────────────────────────────────────────

function readSharedStrings(files: Map<string, Uint8Array>): string[] {
  const part = files.get('xl/sharedStrings.xml');
  if (!part) return [];
  const doc = parseXml(part);
  return descendants(doc, 'si').map(item => richText(item));
}

interface SheetReference {
  name: string;
  path: string;
}

/** Resolves the workbook's sheet list to archive paths, in workbook order. */
function readSheetReferences(files: Map<string, Uint8Array>): SheetReference[] {
  const relationships = new Map<string, string>();
  const relsPart = files.get('xl/_rels/workbook.xml.rels');
  if (relsPart) {
    try {
      const relsDoc = parseXml(relsPart);
      for (const rel of descendants(relsDoc, 'Relationship')) {
        const id = rel.getAttribute('Id');
        const target = rel.getAttribute('Target');
        if (!id || !target) continue;
        const normalized = target.startsWith('/')
          ? target.slice(1)
          : `xl/${target}`.replace(/\/[^/]+\/\.\.\//g, '/');
        relationships.set(id, normalized);
      }
    } catch {
      // Fall through to the worksheet-name fallback below.
    }
  }

  const references: SheetReference[] = [];
  const workbookPart = files.get('xl/workbook.xml');
  if (workbookPart) {
    try {
      const workbookDoc = parseXml(workbookPart);
      const relNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
      for (const sheet of descendants(workbookDoc, 'sheet')) {
        const name = sheet.getAttribute('name') ?? 'Sheet';
        const relId = sheet.getAttribute('r:id') ?? sheet.getAttributeNS(relNamespace, 'id');
        const path = relId ? relationships.get(relId) : undefined;
        if (path && files.has(path)) references.push({ name, path });
      }
    } catch {
      // Fall through to the worksheet-name fallback below.
    }
  }

  if (references.length === 0) {
    const worksheetNames = [...files.keys()]
      .filter(name => /^xl\/worksheets\/sheet\d*\.xml$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const path of worksheetNames) {
      const name = path.replace(/^xl\/worksheets\//, '').replace(/\.xml$/i, '');
      references.push({ name, path });
    }
  }

  return references;
}

function readSheet(files: Map<string, Uint8Array>, reference: SheetReference, sharedStrings: string[]): XlsxSheet {
  const part = files.get(reference.path);
  if (!part) return { name: reference.name, rows: [] };

  const doc = parseXml(part);
  const sheetData = descendants(doc, 'sheetData')[0];
  if (!sheetData) return { name: reference.name, rows: [] };

  const rows: XlsxCell[][] = [];
  let lastRowIndex = -1;

  for (const rowElement of childElements(sheetData, 'row')) {
    const rowRef = Number(rowElement.getAttribute('r') ?? '');
    let rowIndex = Number.isFinite(rowRef) && rowRef > 0 ? rowRef - 1 : lastRowIndex + 1;
    if (rowIndex > MAX_ROWS) break;
    lastRowIndex = rowIndex;

    while (rows.length <= rowIndex) rows.push([]);
    const row = rows[rowIndex];

    let lastColumnIndex = -1;
    for (const cellElement of childElements(rowElement, 'c')) {
      const refColumn = columnIndexFromRef(cellElement.getAttribute('r') ?? '');
      const columnIndex = refColumn ?? lastColumnIndex + 1;
      if (columnIndex >= MAX_COLUMNS) break;
      lastColumnIndex = columnIndex;

      const cell = readCell(cellElement, sharedStrings);
      while (row.length < columnIndex) row.push({ text: '', numeric: null });
      row[columnIndex] = cell;
    }
  }

  // Pad rows so every cell slot exists, then drop trailing empty rows.
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (!row[i]) row[i] = { text: '', numeric: null };
    }
  }
  while (rows.length > 0 && rows[rows.length - 1].every(cell => !cell || cell.text === '')) {
    rows.pop();
  }

  return { name: reference.name, rows };
}

function readCell(cellElement: Element, sharedStrings: string[]): XlsxCell {
  const type = cellElement.getAttribute('t') ?? 'n';

  if (type === 'inlineStr') {
    const inline = firstChild(cellElement, 'is');
    const text = inline ? richText(inline) : '';
    return { text, numeric: null };
  }

  if (type === 's') {
    const valueElement = firstChild(cellElement, 'v');
    const index = Number(valueElement?.textContent ?? '');
    const text =
      Number.isInteger(index) && index >= 0 && index < sharedStrings.length
        ? sharedStrings[index]
        : '';
    return { text, numeric: null };
  }

  if (type === 'b') {
    const valueElement = firstChild(cellElement, 'v');
    const isTrue = (valueElement?.textContent ?? '').trim() === '1';
    return { text: isTrue ? 'TRUE' : 'FALSE', numeric: isTrue ? 1 : 0 };
  }

  if (type === 'e') {
    const valueElement = firstChild(cellElement, 'v');
    return { text: valueElement?.textContent ?? '', numeric: null };
  }

  // Numbers and formula results of type `str`.
  const valueElement = firstChild(cellElement, 'v');
  const raw = (valueElement?.textContent ?? '').trim();
  if (raw === '') {
    // A formula cell may store its cached string in `<is>`.
    const inline = firstChild(cellElement, 'is');
    return { text: inline ? richText(inline) : '', numeric: null };
  }

  if (type === 'str') return { text: raw, numeric: null };

  const numeric = Number(raw);
  return { text: raw, numeric: Number.isFinite(numeric) ? numeric : null };
}

/** Reads every sheet of an `.xlsx` workbook (macros/`.xlsm` included). */
export function parseXlsxWorkbook(buffer: Uint8Array): ParsedWorkbook {
  const files = unzip(buffer);
  if (!files.has('xl/workbook.xml') && ![...files.keys()].some(key => key.startsWith('xl/worksheets/'))) {
    throw new XlsxError('This file is not an Excel workbook (.xlsx)');
  }

  const sharedStrings = readSharedStrings(files);
  const references = readSheetReferences(files);
  const sheets = references.map(reference => readSheet(files, reference, sharedStrings));
  if (sheets.length === 0) throw new XlsxError('The workbook does not contain any sheets');

  return { sheets };
}

/** Picks the sheet that should be imported: a sheet named "tasks", else the first. */
export function pickTaskSheet(workbook: ParsedWorkbook): XlsxSheet {
  const named = workbook.sheets.find(
    sheet => sheet.name.trim().toLowerCase() === 'tasks' || sheet.name.trim().toLowerCase() === 'task'
  );
  return named ?? workbook.sheets[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Writing
// ─────────────────────────────────────────────────────────────────────────────

/** Style indexes into `cellXfs` below. */
const STYLE = {
  default: 0,
  header: 1,
  body: 2,
  bodyCenter: 3,
  bodyWrap: 4,
  mutedWrap: 5,
  date: 6,
} as const;

/** Custom number format id used for `yyyy-mm-dd` date cells. */
const DATE_FORMAT_ID = 164;

/**
 * Converts an ISO `YYYY-MM-DD` string into an Excel date serial (1900 system),
 * so date columns hold real dates that Excel formats, sorts and validates.
 */
export function isoDateToExcelSerial(value: string): number | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  const serial = Math.round((utc - Date.UTC(1899, 11, 30)) / 86400000);
  return serial > 0 ? serial : null;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="${DATE_FORMAT_ID}" formatCode="yyyy\-mm\-dd"/></numFmts>
  <fonts count="3">
    <font><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF7C3AED"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF5F3FF"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFDDD6FE"/></left>
      <right style="thin"><color rgb="FFDDD6FE"/></right>
      <top style="thin"><color rgb="FFDDD6FE"/></top>
      <bottom style="thin"><color rgb="FFDDD6FE"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="${DATE_FORMAT_ID}" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function buildSheetXml(spec: XlsxSheetSpec): string {
  const columnCount = Math.max(spec.columns.length, 1);
  const defaultRowCount = spec.defaultRows ?? 0;
  const dataRows: string[][] = [];

  for (const row of spec.rows ?? []) dataRows.push(row);
  for (let i = 0; i < defaultRowCount; i++) {
    dataRows.push(spec.columns.map(column => column.defaultValue ?? ''));
  }

  const notes: string[] = [];
  const lastRow = Math.max(dataRows.length + 1, 1);
  const dimension = `A1:${columnLetter(columnCount - 1)}${Math.max(lastRow, 1)}`;
  const validationRows = spec.validationRows ?? 500;

  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  parts.push(
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
  );
  parts.push(`<dimension ref="${dimension}"/>`);

  parts.push('<sheetViews><sheetView workbookViewId="0">');
  if (spec.freezeHeader !== false) {
    parts.push('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
  }
  parts.push('</sheetView></sheetViews>');
  parts.push('<sheetFormatPr defaultRowHeight="15"/>');

  parts.push('<cols>');
  spec.columns.forEach((column, index) => {
    const width = column.width ?? (column.wrap ? 60 : 20);
    parts.push(`<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`);
  });
  parts.push('</cols>');

  parts.push('<sheetData>');

  // Header row
  parts.push('<row r="1" ht="30" customHeight="1">');
  spec.columns.forEach((column, index) => {
    parts.push(
      `<c r="${columnLetter(index)}1" s="${STYLE.header}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
        column.header
      )}</t></is></c>`
    );
  });
  parts.push('</row>');

  // Data rows
  dataRows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const isBlankRow = row.every(value => (value ?? '').toString().trim() === '');
    const cells: string[] = [];
    spec.columns.forEach((column, columnIndex) => {
      const value = row[columnIndex];
      if (value === undefined || value === null || value === '') return;
      const text = String(value);

      // Date columns hold real Excel dates so the cell shows a date picker and
      // sorts/filters correctly; unparseable text falls back to a plain string.
      if (column.date) {
        const serial = isoDateToExcelSerial(text);
        if (serial !== null) {
          cells.push(`<c r="${columnLetter(columnIndex)}${rowNumber}" s="${STYLE.date}"><v>${serial}</v></c>`);
          return;
        }
      }

      const style = column.align === 'center'
        ? STYLE.bodyCenter
        : column.muted
          ? STYLE.mutedWrap
          : column.wrap
            ? STYLE.bodyWrap
            : STYLE.body;
      cells.push(
        `<c r="${columnLetter(columnIndex)}${rowNumber}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
          text
        )}</t></is></c>`
      );
    });
    parts.push(
      `<row r="${rowNumber}"${isBlankRow ? ' ht="15" customHeight="1"' : ''}>${cells.join('')}</row>`
    );
  });

  parts.push('</sheetData>');

  if (spec.autoFilter !== false && dataRows.length > 0) {
    parts.push(`<autoFilter ref="A1:${columnLetter(columnCount - 1)}${dataRows.length + 1}"/>`);
  }

  // Per-column validation + input hint. Dropdowns for enumerated options, a
  // date rule for date columns, and a length cap for the free-text columns.
  const validated = spec.columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => column.values?.length || column.date || column.maxLength);
  if (validated.length && validationRows > 1) {
    parts.push(`<dataValidations count="${validated.length}">`);
    for (const { column, index } of validated) {
      const letter = columnLetter(index);
      const sqref = `${letter}2:${letter}${validationRows}`;
      const hint = column.hint
        ? ` showInputMessage="1" promptTitle="${escapeXml(column.header)}" prompt="${escapeXml(column.hint)}"`
        : '';
      const base = `allowBlank="1"${hint} showErrorMessage="1" errorStyle="stop" sqref="${sqref}"`;

      if (column.values && column.values.length > 0) {
        parts.push(
          `<dataValidation type="list" ${base} errorTitle="Invalid value" ` +
            `error="Choose one of the values from the dropdown list.">` +
            `<formula1>&quot;${escapeXml(column.values.join(','))}&quot;</formula1></dataValidation>`
        );
      } else if (column.date) {
        parts.push(
          `<dataValidation type="date" operator="greaterThanOrEqual" formula1="DATE(1900,1,1)" ${base} ` +
            `errorTitle="Invalid date" error="Enter a date as YYYY-MM-DD, or leave the cell blank."/>`
        );
      } else {
        parts.push(
          `<dataValidation type="textLength" operator="lessThanOrEqual" formula1="${column.maxLength}" ${base} ` +
            `errorTitle="Too long" error="This entry must be ${column.maxLength} characters or fewer."/>`
        );
      }
    }
    parts.push('</dataValidations>');
  }

  parts.push('<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>');
  parts.push('</worksheet>');
  return parts.join('');
}

function buildWorkbookXml(sheets: { name: string }[]): string {
  const entries = sheets
    .map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets>${entries}</sheets>` +
    '<calcPr calcId="0"/>' +
    '</workbook>'
  );
}

function buildContentTypes(sheetCount: number): string {
  const overrides = Array.from({ length: sheetCount }, (_, index) => {
    return `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    overrides +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>'
  );
}

const ROOT_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
  '</Relationships>';

function buildWorkbookRels(sheetCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, index) => {
    return `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`;
  }).join('');
  const stylesId = `rId${sheetCount + 1}`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets +
    `<Relationship Id="${stylesId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>'
  );
}

function buildCoreXml(title: string, created: Date): string {
  const stamp = created.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeXml(title)}</dc:title>` +
    '<dc:creator>DeepWork</dc:creator>' +
    '<cp:lastModifiedBy>DeepWork</cp:lastModifiedBy>' +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>` +
    '</cp:coreProperties>'
  );
}

const APP_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
  'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
  '<Application>DeepWork</Application>' +
  '</Properties>';

/**
 * Builds a complete `.xlsx` workbook.
 *
 * Entries are stored uncompressed, which is valid ZIP and keeps the generator
 * dependency-free (Excel, LibreOffice, Google Sheets and Numbers all accept it).
 */
export function buildXlsx(spec: XlsxWorkbookSpec, created = new Date()): Uint8Array {
  if (!spec.sheets.length) throw new XlsxError('A workbook needs at least one sheet');

  const files: ZipInputFile[] = [];
  const add = (name: string, xml: string) => files.push({ name, data: utf8Encode(xml) });

  add('[Content_Types].xml', buildContentTypes(spec.sheets.length));
  add('_rels/.rels', ROOT_RELS_XML);
  add('docProps/core.xml', buildCoreXml(spec.title ?? 'DeepWork workbook', created));
  add('docProps/app.xml', APP_XML);
  add('xl/workbook.xml', buildWorkbookXml(spec.sheets));
  add('xl/_rels/workbook.xml.rels', buildWorkbookRels(spec.sheets.length));
  add('xl/styles.xml', STYLES_XML);
  spec.sheets.forEach((sheet, index) => add(`xl/worksheets/sheet${index + 1}.xml`, buildSheetXml(sheet)));

  return zip(files, created);
}
