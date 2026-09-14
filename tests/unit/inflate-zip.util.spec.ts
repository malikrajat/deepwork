import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { inflateRaw, InflateError } from '../../src/app/core/utils/inflate.util';
import { crc32, unzip, zip, utf8Decode, utf8Encode, ZipError } from '../../src/app/core/utils/zip.util';

/** Builds a ZIP whose entries use real deflate compression, like Excel does. */
function buildDeflatedZip(entries: [string, string][]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const raw = Buffer.from(content, 'utf8');
    const deflated = deflateRawSync(raw, { level: 6 });
    const checksum = crc32(new Uint8Array(raw));

    const local = Buffer.alloc(30 + nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    nameBuffer.copy(local, 30);
    locals.push(local, deflated);

    const central = Buffer.alloc(46 + nameBuffer.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuffer.copy(central, 46);
    centrals.push(central);
    offset += local.length + deflated.length;
  }

  const localBuffer = Buffer.concat(locals);
  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(localBuffer.length, 16);

  return new Uint8Array(Buffer.concat([localBuffer, centralBuffer, end]));
}

describe('inflateRaw', () => {
  const samples: [string, Buffer][] = [
    ['short text', Buffer.from('Title,Priority', 'utf8')],
    ['repetitive text', Buffer.from('task one,task two\n'.repeat(3000), 'utf8')],
    ['binary-ish data', Buffer.from(Array.from({ length: 4000 }, (_, i) => (i * 7919) % 251))],
    ['all identical bytes', Buffer.alloc(50000, 65)],
    ['unicode text', Buffer.from('café — ünïcode 漢字 🎯 '.repeat(300), 'utf8')],
    ['single byte', Buffer.from('x', 'utf8')],
  ];

  for (const [label, source] of samples) {
    for (const level of [0, 1, 6, 9]) {
      it(`decompresses ${label} at level ${level}`, () => {
        const compressed = deflateRawSync(source, { level });
        expect(Buffer.from(inflateRaw(new Uint8Array(compressed))).equals(source)).toBe(true);
      });
    }
  }

  it('rejects input that is not a deflate stream', () => {
    expect(() => inflateRaw(new Uint8Array(Buffer.from('definitely not deflate', 'utf8')), 1024)).toThrow(
      InflateError
    );
  });

  it('rejects truncated streams', () => {
    const compressed = deflateRawSync(Buffer.from('some content to compress'));
    expect(() => inflateRaw(new Uint8Array(compressed.subarray(0, 4)), 1024)).toThrow(InflateError);
  });

  it('refuses to expand beyond the output cap', () => {
    const bomb = deflateRawSync(Buffer.alloc(2 * 1024 * 1024, 7));
    expect(() => inflateRaw(new Uint8Array(bomb), 1024)).toThrow(/exceeds/);
  });
});

describe('crc32', () => {
  it('matches the standard CRC-32 test vectors', () => {
    expect(crc32(new Uint8Array(Buffer.from('', 'utf8')))).toBe(0);
    expect(crc32(new Uint8Array(Buffer.from('hello world', 'utf8')))).toBe(0x0d4a1185);
    expect(
      crc32(new Uint8Array(Buffer.from('The quick brown fox jumps over the lazy dog', 'utf8')))
    ).toBe(0x414fa339);
  });

  it('is stable for utf-8 content', () => {
    const value = 'café ✓ 漢字';
    expect(crc32(utf8Encode(value))).toBe(crc32(utf8Encode(value)));
  });
});

describe('zip', () => {
  it('round-trips entries written by zip()', () => {
    const archive = zip([
      { name: 'a.txt', data: utf8Encode('alpha') },
      { name: 'nested/b.xml', data: utf8Encode('<b/>') },
    ]);
    const entries = unzip(archive);
    expect(entries.size).toBe(2);
    expect(utf8Decode(entries.get('a.txt')!)).toBe('alpha');
    expect(utf8Decode(entries.get('nested/b.xml')!)).toBe('<b/>');
  });

  it('preserves unicode entry names', () => {
    const archive = zip([{ name: 'unicode-ünïcode.txt', data: utf8Encode('ok') }]);
    expect(utf8Decode(unzip(archive).get('unicode-ünïcode.txt')!)).toBe('ok');
  });

  it('reads deflated entries written like Excel writes them', () => {
    const archive = buildDeflatedZip([['xl/worksheets/sheet1.xml', '<sheetData/>'.repeat(500)]]);
    const entries = unzip(archive);
    expect(utf8Decode(entries.get('xl/worksheets/sheet1.xml')!)).toBe('<sheetData/>'.repeat(500));
  });

  it('throws a ZipError for data that is not a zip archive', () => {
    expect(() => unzip(utf8Encode('plain text, not a zip at all — long enough to be checked'))).toThrow(
      ZipError
    );
  });

  it('round-trips utf-8 text helpers', () => {
    const value = 'Café ✓ 漢字 🎯';
    expect(utf8Decode(utf8Encode(value))).toBe(value);
  });
});
