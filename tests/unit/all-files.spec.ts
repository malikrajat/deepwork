import fg from 'fast-glob';
import path from 'path';
import { pathToFileURL } from 'url';
import { describe, test, expect } from 'vitest';

const pattern = 'src/**/*.ts';

const files = await fg(pattern, {
  ignore: [
    '**/*.spec.ts',
    '**/*.d.ts',
    'src-tauri/**',
    'dist/**',
    'node_modules/**',
    'tests/**',
    'src/app/pages/**',
    'src/app/shared/components/**',
    'src/app/shared/pipes/**',
    'src/main.ts',
    'src/app/app.ts',
    'src/app/app.config.ts',
    'src/app/app.routes.ts'
  ],
});

describe('Smoke import all files', () => {
  for (const file of files) {
    test(`import ${file}`, async () => {
      const url = pathToFileURL(path.resolve(file)).href;
      const mod = await import(url);
      expect(mod).toBeDefined();
    });
  }
});
