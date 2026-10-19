import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { TEST_UPLOAD_DIR } from '../setup/testEnv';

// Tests use the local disk storage (a temp folder), not the DB, so resetDb()
// doesn't remove the files. These keep the folder clean and countable.
export function clearUploads(): void {
  rmSync(TEST_UPLOAD_DIR, { recursive: true, force: true });
  mkdirSync(TEST_UPLOAD_DIR, { recursive: true });
}

export function countUploadedFiles(): number {
  return readdirSync(TEST_UPLOAD_DIR).length;
}
