import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Default: the local Docker Postgres (port 5433), separate `lendlite_test` database.
// CI overrides it with TEST_DATABASE_URL.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lendlite:lendlite@localhost:5433/lendlite_test';

// Safety net: tests TRUNCATE every table. Refuse to run against anything that
// isn't clearly a test database (e.g. the Neon dev DB from .env).
export function assertIsTestDatabase(url: string): void {
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to run tests against "${dbName}": database name must end with "_test"`);
  }
}

export const TEST_UPLOAD_DIR = join(tmpdir(), 'lendlite-test-uploads');
