import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    // Compile TS on the fly, type-checking with the tests' own tsconfig (adds jest types)
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tests/tsconfig.json' }],
  },
  // 1. Once, before everything: point at the TEST database and migrate it
  globalSetup: '<rootDir>/tests/setup/globalSetup.ts',
  // 2. Before each test file loads any app code: set test env vars
  setupFiles: ['<rootDir>/tests/setup/env.ts'],
  // 3. Inside each test file: shared hooks (disconnect Prisma at the end)
  setupFilesAfterEnv: ['<rootDir>/tests/setup/afterEnv.ts'],
  // All test files share ONE database, so run them one at a time
  maxWorkers: 1,
  // Neon/Docker round-trips + bcrypt make some tests slower than the 5s default
  testTimeout: 30_000,
  clearMocks: true,
};

export default config;
