/**
 * Minimal, dependency-free raw DEFLATE (RFC 1951) decoder.
 *
 * Needed so the app can read `.xlsx` workbooks (which are ZIP archives whose
 * entries are deflate-compressed) inside the Tauri webview, on every platform,
 * without pulling in a third-party spreadsheet library.
 *
 * The decoder follows the classic "puff" approach: canonical Huffman codes are
 * rebuilt as (count, symbol) tables and decoded one bit at a time with the
 * progressive `code |= bit` / `first = (first + count) << 1` walk.
 *
 * Hardened against malformed/decompression-bomb input:
 *  - every read is bounds-checked;
 *  - output growth is capped (`maxOutputBytes`);
 *  - lengths/distances are range-checked before use.
 */

const MAX_BITS = 15;

/** Base lengths for length symbols 257..285. */
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];

/** Extra bits for length symbols 257..285. */
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];

/** Base distances for distance symbols 0..29. */
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];

/** Extra bits for distance symbols 0..29. */
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

/** Order in which code-length-code lengths are stored in a dynamic block. */
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

export class InflateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InflateError';
  }
}

interface Huffman {
  /** counts[n] = number of symbols with code length n. */
  readonly counts: Int32Array;
  /** Symbols ordered by (code length, symbol value). */
  readonly symbols: Int32Array;
}

/** Builds canonical decoding tables from a list of per-symbol code lengths. */
function buildHuffman(lengths: ArrayLike<number>): Huffman {
  const counts = new Int32Array(MAX_BITS + 1);
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i];
    if (len < 0 || len > MAX_BITS) throw new InflateError('Invalid code length');
    counts[len]++;
  }
  counts[0] = 0;

  const offsets = new Int32Array(MAX_BITS + 2);
  for (let len = 1; len <= MAX_BITS; len++) {
    offsets[len + 1] = offsets[len] + counts[len];
  }

  const symbols = new Int32Array(lengths.length);
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const len = lengths[symbol];
    if (len !== 0) symbols[offsets[len]++] = symbol;
  }

  return { counts, symbols };
}

/** Pre-built literal/length table for fixed-Huffman (BTYPE=01) blocks. */
function buildFixedLiteralTable(): Huffman {
  const lengths = new Uint8Array(288);
  for (let i = 0; i < 144; i++) lengths[i] = 8;
  for (let i = 144; i < 256; i++) lengths[i] = 9;
  for (let i = 256; i < 280; i++) lengths[i] = 7;
  for (let i = 280; i < 288; i++) lengths[i] = 8;
  return buildHuffman(lengths);
}

let fixedLiteralTable: Huffman | null = null;
let fixedDistanceTable: Huffman | null = null;

/**
 * Decodes one symbol from `input`, reading bits LSB-first from the stream.
 * `readBit` returns the next compressed bit.
 */
function decodeSymbol(table: Huffman, readBit: () => number): number {
  let code = 0;
  let first = 0;
  let index = 0;

  for (let len = 1; len <= MAX_BITS; len++) {
    code |= readBit();
    const count = table.counts[len];
    if (code - first < count) return table.symbols[index + (code - first)];
    index += count;
    first = (first + count) << 1;
    code <<= 1;
  }

  throw new InflateError('Invalid Huffman code');
}

/**
 * Decompresses a raw DEFLATE stream (no zlib/gzip wrapper).
 *
 * @param input Compressed bytes (as stored in a ZIP entry with method 8).
 * @param maxOutputBytes Safety cap on decompressed size.
 */
export function inflateRaw(input: Uint8Array, maxOutputBytes = 64 * 1024 * 1024): Uint8Array {
  if (input.length === 0) throw new InflateError('Empty deflate stream');

  let pos = 0;
  let bitBuffer = 0;
  let bitCount = 0;

  const readBit = (): number => {
    if (bitCount === 0) {
      if (pos >= input.length) throw new InflateError('Unexpected end of deflate stream');
      bitBuffer = input[pos++];
      bitCount = 8;
    }
    const bit = bitBuffer & 1;
    bitBuffer >>>= 1;
    bitCount--;
    return bit;
  };

  const readBits = (count: number): number => {
    let value = 0;
    for (let i = 0; i < count; i++) value |= readBit() << i;
    return value;
  };

  // ── Growable output buffer ────────────────────────────────────────────────
  let output = new Uint8Array(Math.min(Math.max(input.length * 4, 1024), 256 * 1024));
  let outLen = 0;

  const ensure = (extra: number): void => {
    const required = outLen + extra;
    if (required > maxOutputBytes) {
      throw new InflateError('Decompressed data exceeds the allowed size');
    }
    if (required <= output.length) return;
    let capacity = output.length;
    while (capacity < required) capacity *= 2;
    const grown = new Uint8Array(Math.min(capacity, maxOutputBytes));
    grown.set(output.subarray(0, outLen));
    output = grown;
  };

  let isFinalBlock = false;

  do {
    isFinalBlock = readBits(1) === 1;
    const blockType = readBits(2);

    if (blockType === 0) {
      // ── Stored (uncompressed) block ──────────────────────────────────────
      // Discard remaining bits of the current byte, then read LEN/NLEN.
      bitBuffer = 0;
      bitCount = 0;
      if (pos + 4 > input.length) throw new InflateError('Truncated stored block header');
      const len = input[pos] | (input[pos + 1] << 8);
      const nlen = input[pos + 2] | (input[pos + 3] << 8);
      pos += 4;
      if ((len ^ 0xffff) !== nlen) throw new InflateError('Stored block length mismatch');
      if (pos + len > input.length) throw new InflateError('Truncated stored block data');
      ensure(len);
      output.set(input.subarray(pos, pos + len), outLen);
      outLen += len;
      pos += len;
      continue;
    }

    let literalTable: Huffman;
    let distanceTable: Huffman;

    if (blockType === 1) {
      // ── Fixed Huffman ────────────────────────────────────────────────────
      fixedLiteralTable ??= buildFixedLiteralTable();
      fixedDistanceTable ??= buildHuffman(new Uint8Array(30).fill(5));
      literalTable = fixedLiteralTable;
      distanceTable = fixedDistanceTable;
    } else if (blockType === 2) {
      // ── Dynamic Huffman ──────────────────────────────────────────────────
      const literalCount = readBits(5) + 257;
      const distanceCount = readBits(5) + 1;
      const codeLengthCount = readBits(4) + 4;

      const codeLengthLengths = new Uint8Array(19);
      for (let i = 0; i < codeLengthCount; i++) {
        codeLengthLengths[CLEN_ORDER[i]] = readBits(3);
      }
      const codeLengthTable = buildHuffman(codeLengthLengths);

      const lengths = new Uint8Array(literalCount + distanceCount);
      let index = 0;
      while (index < lengths.length) {
        const symbol = decodeSymbol(codeLengthTable, readBit);
        if (symbol < 16) {
          lengths[index++] = symbol;
        } else if (symbol === 16) {
          if (index === 0) throw new InflateError('Repeat with no previous code length');
          const previous = lengths[index - 1];
          const repeat = 3 + readBits(2);
          for (let i = 0; i < repeat; i++) lengths[index++] = previous;
        } else if (symbol === 17) {
          const repeat = 3 + readBits(3);
          for (let i = 0; i < repeat; i++) lengths[index++] = 0;
        } else {
          const repeat = 11 + readBits(7);
          for (let i = 0; i < repeat; i++) lengths[index++] = 0;
        }
        if (index > lengths.length) throw new InflateError('Code length overflow');
      }

      if (lengths[256] === 0) throw new InflateError('Missing end-of-block code');

      literalTable = buildHuffman(lengths.subarray(0, literalCount));
      distanceTable = buildHuffman(lengths.subarray(literalCount));
    } else {
      throw new InflateError('Invalid deflate block type');
    }

    // ── Decode the block body ────────────────────────────────────────────────
    for (;;) {
      const symbol = decodeSymbol(literalTable, readBit);

      if (symbol < 256) {
        ensure(1);
        output[outLen++] = symbol;
        continue;
      }
      if (symbol === 256) break; // end of block

      const lengthIndex = symbol - 257;
      if (lengthIndex >= LENGTH_BASE.length) throw new InflateError('Invalid length code');
      const length = LENGTH_BASE[lengthIndex] + readBits(LENGTH_EXTRA[lengthIndex]);

      const distanceSymbol = decodeSymbol(distanceTable, readBit);
      if (distanceSymbol >= DIST_BASE.length) throw new InflateError('Invalid distance code');
      const distance = DIST_BASE[distanceSymbol] + readBits(DIST_EXTRA[distanceSymbol]);
      if (distance > outLen) throw new InflateError('Distance points before start of output');

      ensure(length);
      for (let i = 0; i < length; i++) {
        output[outLen] = output[outLen - distance];
        outLen++;
      }
    }
  } while (!isFinalBlock);

  return output.slice(0, outLen);
}
