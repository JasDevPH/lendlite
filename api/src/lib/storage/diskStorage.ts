import { createReadStream, mkdirSync } from 'node:fs';
import { stat, unlink, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { AppError } from '../../utils/AppError';
import type { FileStorage } from './fileStorage';

// Local folder storage: development and tests (no account or network needed)
export function createDiskStorage(uploadDir: string): FileStorage {
  // Absolute path, so it doesn't depend on where the process was started from
  const root = resolve(uploadDir);
  mkdirSync(root, { recursive: true });

  // Refuse any key that would escape the upload folder ("../../app.ts"):
  // defence in depth against a tampered DB row
  function pathFor(key: string): string {
    const absolute = resolve(root, key);
    if (!absolute.startsWith(root + sep)) throw new AppError(404, 'NOT_FOUND', 'Document not found');
    return absolute;
  }

  return {
    async save(key, data) {
      // 'wx' = fail if the file exists: never silently overwrite a document
      await writeFile(pathFor(key), data, { flag: 'wx' });
    },
    async read(key) {
      const path = pathFor(key);
      try {
        await stat(path);
      } catch {
        // Row exists but the file is gone: a clean 404, not a crash
        throw new AppError(404, 'NOT_FOUND', 'Document file is missing');
      }
      return createReadStream(path);
    },
    async remove(key) {
      await unlink(pathFor(key)).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') throw err;
      });
    },
  };
}
