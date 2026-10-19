import type { Readable } from 'node:stream';

// Where uploaded document bytes live. The rest of the app only knows this
// interface, so swapping local disk for Cloudinary is a config change
// (STORAGE_DRIVER), not a code change in the documents module.
export interface FileStorage {
  // `key` is our random file name (e.g. "3f2c…e1.pdf"), stored in Document.storagePath
  save(key: string, data: Buffer, mimeType: string): Promise<void>;
  // Throws AppError 404 if the file is gone
  read(key: string): Promise<Readable>;
  // Never throws if the file is already gone
  remove(key: string): Promise<void>;
}
