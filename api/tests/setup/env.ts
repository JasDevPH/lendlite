import { assertIsTestDatabase, TEST_DATABASE_URL, TEST_UPLOAD_DIR } from './testEnv';

// Runs before each test file imports any app code. dotenv never overrides
// variables that are already set, so these win over api/.env.
assertIsTestDatabase(TEST_DATABASE_URL);

process.env.NODE_ENV = 'test'; // logger silent
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-validation';
process.env.UPLOAD_DIR = TEST_UPLOAD_DIR;
process.env.WEB_ORIGIN = 'http://localhost:3000';
