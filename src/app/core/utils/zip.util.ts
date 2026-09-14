/**
 * Minimal, dependency-free ZIP container support (PKWARE APPNOTE).
 *
 * This is deliberately scoped to what Office Open XML (`.xlsx`, `.docx`, …)
 * workbooks need:
 *   - reading: central-directory driven extraction, supporting stored (0) and
 *     deflate (8) entries — the two methods Excel/Google Sheets/LibreOffice use;
 *   - writing: stored (uncompressed) entries only, which is a fully valid ZIP
 *     and keeps template generation free of any compression dependency.
 */

import { inflateRaw } from './inflate.util';

// ─── UTF-8 helpers (with fallbacks for environments without TextEncoder) ─────

const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

export function utf8Encode(text: string): Uint8Array {
  if (textEncoder) return textEncoder.encode(text);

  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return new Uint8Array(bytes);
}

export function utf8Decode(bytes: Uint8Array): string {
  if (textDecoder) return textDecoder.decode(bytes);

  let result = '';
  for (let i = 0; i < bytes.length; ) {
    const byte = bytes[i++];
    let code: number;
    if (byte < 0x80) {
      code = byte;
    } else if (byte >= 0xc0 && byte < 0xe0) {
      code = ((byte & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if (byte >= 0xe0 && byte < 0xf0) {
      code = ((byte & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else {
      code =
        ((byte & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
      code -= 0x10000;
      result += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
      continue;
    }
    result += String.fromCharCode(code);
  }
  return result;
}

// ─── CRC-32 (used for ZIP entry checksums) ──────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

// ─── Reading ────────────────────────────────────────────────────────────────

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

/**
 * Extracts every file entry of a ZIP archive into a map keyed by entry name.
 * Directory entries are skipped; zip64 archives are rejected with a clear error
 * (no spreadsheet app produces them for hand-written task lists).
 */
export function unzip(buffer: Uint8Array, maxEntryBytes = 64 * 1024 * 1024): Map<string, Uint8Array> {
  if (buffer.length < 22) throw new ZipError('File is too small to be a valid .xlsx workbook');

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // ── Locate the End Of Central Directory record ──────────────────────────
  let eocd = -1;
  const searchFrom = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= searchFrom; i--) {
    if (readUint32(view, i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new ZipError('Not a valid .xlsx workbook (missing ZIP end-of-directory record)');
  }

  const entryCount = readUint16(view, eocd + 10);
  const centralSize = readUint32(view, eocd + 12);
  const centralOffset = readUint32(view, eocd + 16);

  if (centralOffset === 0xffffffff || entryCount === 0xffff) {
    throw new ZipError('Zip64 workbooks are not supported');
  }
  if (centralOffset + centralSize > buffer.length) {
    throw new ZipError('Corrupted .xlsx workbook (directory points outside the file)');
  }

  const entries = new Map<string, Uint8Array>();
  let pointer = centralOffset;

  for (let index = 0; index < entryCount; index++) {
    if (pointer + 46 > buffer.length || readUint32(view, pointer) !== CENTRAL_SIGNATURE) {
      throw new ZipError('Corrupted .xlsx workbook (bad central directory entry)');
    }

    const method = readUint16(view, pointer + 10);
    const compressedSize = readUint32(view, pointer + 20);
    const uncompressedSize = readUint32(view, pointer + 24);
    const nameLength = readUint16(view, pointer + 28);
    const extraLength = readUint16(view, pointer + 30);
    const commentLength = readUint16(view, pointer + 32);
    const localOffset = readUint32(view, pointer + 42);

    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new ZipError('Zip64 workbooks are not supported');
    }

    const nameStart = pointer + 46;
    const name = utf8Decode(buffer.subarray(nameStart, nameStart + nameLength));
    pointer = nameStart + nameLength + extraLength + commentLength;

    if (name.endsWith('/')) continue; // directory entry

    // ── Resolve the actual data offset from the local header ──────────────
    if (localOffset + 30 > buffer.length || readUint32(view, localOffset) !== LOCAL_SIGNATURE) {
      throw new ZipError(`Corrupted .xlsx workbook (bad local header for ${name})`);
    }
    const localNameLength = readUint16(view, localOffset + 26);
    const localExtraLength = readUint16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;

    if (dataStart + compressedSize > buffer.length) {
      throw new ZipError(`Corrupted .xlsx workbook (truncated entry ${name})`);
    }
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    let data: Uint8Array;
    if (method === 0) {
      data = raw.slice();
    } else if (method === 8) {
      data = inflateRaw(raw, maxEntryBytes);
    } else {
      throw new ZipError(`Unsupported compression method (${method}) in ${name}`);
    }

    if (uncompressedSize !== 0 && data.length !== uncompressedSize) {
      throw new ZipError(`Corrupted .xlsx workbook (size mismatch for ${name})`);
    }

    entries.set(name, data);
  }

  return entries;
}

// ─── Writing ────────────────────────────────────────────────────────────────

export interface ZipInputFile {
  name: string;
  data: Uint8Array;
}

/** Packs files into a ZIP archive using stored (uncompressed) entries. */
export function zip(files: ZipInputFile[], modified = new Date()): Uint8Array {
  const dosTime =
    (modified.getHours() << 11) | (modified.getMinutes() << 5) | (Math.floor(modified.getSeconds() / 2));
  const dosDate =
    ((Math.max(modified.getFullYear(), 1980) - 1980) << 9) |
    ((modified.getMonth() + 1) << 5) |
    modified.getDate();

  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const nameBytes = utf8Encode(file.name);
    const checksum = crc32(file.data);
    const size = file.data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, LOCAL_SIGNATURE, true);
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0x0800, true); // flags: UTF-8 file names
    localView.setUint16(8, 0, true); // method: stored
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, size, true);
    localView.setUint32(22, size, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true); // extra field length
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, file.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, CENTRAL_SIGNATURE, true);
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true); // stored
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true); // extra
    centralView.setUint16(32, 0, true); // comment
    centralView.setUint16(34, 0, true); // disk number start
    centralView.setUint16(36, 0, true); // internal attributes
    centralView.setUint32(38, 0, true); // external attributes
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(nameBytes, 46);

    centralChunks.push(centralHeader);
    localOffset += localHeader.length + size;
  }

  const centralSize = centralChunks.reduce((total, chunk) => total + chunk.length, 0);

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, EOCD_SIGNATURE, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);

  const all = [...localChunks, ...centralChunks, endRecord];
  const totalLength = all.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of all) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
