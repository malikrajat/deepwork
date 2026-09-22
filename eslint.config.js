// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

/**
 * DeepWork's lint setup: TypeScript, Angular templates, and nothing else.
 *
 * The rule sets are the Angular project's own recommendations, with two
 * deliberate relaxations so that the linter reports *problems* rather than a
 * style the app has never used:
 *
 * - `no-explicit-any` is a warning: the storage layer talks to SQLite rows and
 *   `any` is how it reads them back.
 * - the template accessibility rules warn instead of failing the build, so the
 *   existing screens are reported without blocking every change until they are
 *   all fixed.
 */
module.exports = tseslint.config(
  {
    ignores: [
      'dist/**',
      '.angular/**',
      'coverage/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'src-tauri/**',
      // Kilo Code keeps its own worktrees inside the project folder; those are
      // separate checkouts, not this one's source.
      '.kilo/**',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      // Empty lifecycle hooks and empty catch blocks are deliberate here.
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {
      '@angular-eslint/template/click-events-have-key-events': 'warn',
      '@angular-eslint/template/interactive-supports-focus': 'warn',
      '@angular-eslint/template/label-has-associated-control': 'warn',
    },
  },
);
