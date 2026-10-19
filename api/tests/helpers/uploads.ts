import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { UPLOAD_ROOT } from '../../src/middleware/upload';

// Uploaded files live on disk (a temp folder in tests), not in the DB, so
// resetDb() doesn't remove them. These keep the folder clean and countable.
export function clearUploads(): void {
  rmSync(UPLOAD_ROOT, { recursive: true, force: true });
  mkdirSync(UPLOAD_ROOT, { recursive: true });
}

export function countUploadedFiles(): number {
  return readdirSync(UPLOAD_ROOT).length;
}
