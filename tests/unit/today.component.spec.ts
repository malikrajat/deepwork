import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('TodayComponent (file presence)', () => {
  it('source file should exist and export class', () => {
    const p = resolve(__dirname, '../../src/app/pages/today/today.component.ts');
    const src = readFileSync(p, 'utf8');
    expect(src.includes('export class TodayComponent')).toBe(true);
  });
});
