import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite 8 transforms TypeScript with Oxc, not esbuild, and Oxc reads
  // `experimentalDecorators` from a tsconfig. Without naming one, the specs under
  // `tests/` fall outside every project and their inline `@Component` decorators
  // are emitted untouched — which V8 rejects as "Invalid or unexpected token".
  tsconfig: './tsconfig.spec.json',
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/unit/**/*.spec.ts'],
    // The dictation feature was removed from `src/` (the dictation and speech
    // services are gone), and these three specs still import it, so they cannot
    // load. Delete them with the feature, or restore the sources to get them
    // running again — until then they are skipped rather than failing the run.
    exclude: [
      'tests/unit/speech.service.spec.ts',
      'tests/unit/speech-log.spec.ts',
      'tests/unit/quick-add-dictation.spec.ts',
    ],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'istanbul',
      // Every file the app ships is measured, whether or not a test happens to
      // import it, so the percentage cannot be raised by leaving files out.
      all: true,
      include: ['src/app/**/*.ts'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      // A failed test run still produces the report the CI summary needs.
      reportOnFailure: true,
      /**
       * The coverage gate.
       *
       * Two rules, and they are different on purpose:
       *
       * 1. **Nothing may go backwards.** The plain numbers are the floor the
       *    suite reaches today; raise them as tests are added.
       * 2. **The logic layer must stay at 90%.** `core/utils` is the code that
       *    can be pinned down exactly — analytics, CSV export, xlsx/zip, dates,
       *    windowing — and it is where 90% is both meaningful and already met.
       *
       * The whole app is reported next to it (about 48% of statements at the
       * time of writing). Reaching 90% there means unit-testing the rendered
       * pages and the browser shell, which the Playwright suite covers instead;
       * when the remaining page tests exist, add `statements: 90` and friends
       * to the top-level numbers here and this becomes the 90% overall gate.
       */
      thresholds: {
        statements: 47,
        branches: 42,
        functions: 38,
        lines: 48,
        'src/app/core/utils/**': {
          statements: 90,
          branches: 75,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
