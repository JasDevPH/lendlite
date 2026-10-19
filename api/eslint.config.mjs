// ESLint 9 flat config for the API.
// Type-aware rules (they read TypeScript's types) catch real bugs a plain
// linter can't, e.g. a promise that's never awaited in an Express handler.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // Build output, deps, and the gitignored local helper scripts
  globalIgnores(['dist/**', 'coverage/**', 'node_modules/**', 'scripts/**']),

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        // The same three TypeScript projects `npm run typecheck` checks
        project: ['./tsconfig.json', './prisma/tsconfig.json', './tests/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // `_next`, `_req`: Express needs the parameter position even when unused
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Express 4 accepts async handlers; our asyncHandler forwards rejections to the error handler
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { arguments: false } }],
    },
  },

  // Root config files aren't part of any tsconfig project: lint them without type info
  { files: ['eslint.config.mjs', 'jest.config.ts'], extends: [tseslint.configs.disableTypeChecked] },

  {
    files: ['tests/**/*.ts'],
    languageOptions: { globals: globals.jest },
    rules: {
      // Supertest's res.body is `any` by design; asserting on it is the point of the test
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      // expect(spy).toHaveBeenCalled() style references are fine in tests
      '@typescript-eslint/unbound-method': 'off',
    },
  },
]);
