/**
 * Tiny RFC 4180-ish CSV reader used as a fallback import path.
 * Handles quoted fields, escaped quotes (`""`), CR/LF/CRLF line endings, a
 * UTF-8 BOM, and comma/semicolon/tab delimiters (auto-detected).
 */

const DELIMITERS = [',', ';', '\t'] as const;

export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 5000).split(/\r?\n/).slice(0, 5).join('\n');
  let best: string = DELIMITERS[0];
  let bestCount = -1;
  for (const delimiter of DELIMITERS) {
    // Count occurrences outside of quotes: a rough but effective heuristic.
    const count = sample.split(delimiter).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = delimiter;
    }
  }
  return best;
}

/** Splits CSV/TSV text into a grid of raw string cells. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const separator = delimiter ?? detectDelimiter(clean);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < clean.length; index++) {
    const character = clean[index];

    if (inQuotes) {
      if (character === '"') {
        if (clean[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
    } else if (character === separator) {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (character === '\r') {
      if (clean[index + 1] !== '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      }
    } else {
      field += character;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
