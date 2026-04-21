// ESLint flat config. One source of truth for what's a bug vs what's style.
// Prettier handles all formatting; ESLint handles correctness + hygiene.
//
// Scope:
//   - `src/**` — game code, browser + bundler globals
//   - tests under __tests__ — same rules plus vitest globals
//   - `vite.config.js`, `eslint.config.js` — node-style configs
// Node tooling itself (rollup-plugin-visualizer) runs at bundle time, not game
// runtime, so it doesn't get a special bucket — the defaults work.

import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.vite/**', 'gameworld assets/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    rules: {
      // Correctness — these catch bugs, not style.
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-implicit-globals': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-floating-decimal': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'warn',
      'no-unreachable-loop': 'error',
      'no-promise-executor-return': 'error',
      'require-atomic-updates': 'off', // too noisy for our patterns

      // Hygiene
      'no-duplicate-imports': 'error',
      'no-useless-rename': 'error',
      'object-shorthand': ['warn', 'always'],
      'prefer-template': 'warn',
      'yoda': ['warn', 'never'],
    },
  },
  {
    // Test files get vitest globals. `describe`, `it`, `expect`, `beforeEach`.
    files: ['src/**/__tests__/**/*.js', 'src/**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Build-time node files.
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Prettier last so it wins formatting disagreements.
  prettier,
];
