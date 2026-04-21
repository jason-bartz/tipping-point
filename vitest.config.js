import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default env is node (fast). DOM tests opt in via
    // `// @vitest-environment jsdom` on their first line.
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs}', 'src/**/__tests__/**/*.{js,mjs}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/fixtures/**'],
    coverage: {
      // v8 is fast (native) and needs no instrumentation rewrite.
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      // Focus coverage on the layers where we actually want test signal.
      // Pure math in model/ and data/ matter most; UI/audio/save are
      // integration-heavy and out-of-scope for unit coverage.
      include: ['src/model/**', 'src/data/**', 'src/save/**', 'src/config/**'],
      exclude: [
        '**/__tests__/**',
        '**/*.test.js',
        'src/data/events.js',       // declarative blob; integrity-tested elsewhere
        'src/data/profiles.js',     // declarative blob
        'src/data/activities.js',   // declarative blob
        'src/data/countries.js',    // declarative blob
        'src/data/news.js',         // declarative blob
        'src/data/collectables.js', // declarative blob
        'src/data/advisors.js',     // declarative blob
      ],
      // Ratchets. Raise over time; don't let them slip.
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 65,
        branches: 70,
      },
    },
  },
});
