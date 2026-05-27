import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('TasksComponent (file presence)', () => {
  it('source file should exist and export class', () => {
    const p = resolve(__dirname, '../../src/app/pages/tasks/tasks.component.ts');
    const src = readFileSync(p, 'utf8');
    expect(src.includes('export class TasksComponent')).toBe(true);
  });
});
