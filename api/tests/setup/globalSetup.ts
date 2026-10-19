import { execSync } from 'node:child_process';
import { assertIsTestDatabase, TEST_DATABASE_URL } from './testEnv';

// Runs ONCE before all test files: bring the test DB schema up to date.
export default function globalSetup(): void {
  assertIsTestDatabase(TEST_DATABASE_URL);

  // Same migrations as dev/prod (`migrate deploy` never generates new ones,
  // and creates the database if it doesn't exist yet)
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
