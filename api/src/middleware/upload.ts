import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import multer from 'multer';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

// Absolute path, so it doesn't depend on where the process was started from
export const UPLOAD_ROOT = resolve(env.UPLOAD_DIR);
mkdirSync(UPLOAD_ROOT, { recursive: true });

// Allow-list: each accepted MIME type and the extensions that may carry it.
// Spec: PDF/JPG/PNG only, checked by mimetype AND extension.
const ALLOWED_TYPES: Record<string, readonly string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

export const MAX_UPLOAD_BYTES = env.MAX_UPLOAD_MB * 1024 * 1024;

const storage = multer.diskStorage({
  destination: UPLOAD_ROOT,
  // Random name: never trust the client's filename on disk (path traversal like
  // "../../app.ts", overwriting another file, odd characters). The original name
  // is kept only in the DB for display.
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
  },
});

function fileFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void {
  const allowedExtensions = ALLOWED_TYPES[file.mimetype];
  const extension = extname(file.originalname).toLowerCase();

  // Both must match: a .pdf name with an image/png type (or vice versa) is rejected
  if (!allowedExtensions || !allowedExtensions.includes(extension)) {
    return cb(new AppError(400, 'INVALID_FILE_TYPE', 'Only PDF, JPG and PNG files are allowed'));
  }
  cb(null, true);
}

// Single file in the multipart field "file". Text fields (e.g. `type`) arrive in req.body.
export const uploadSingleFile = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_UPLOAD_BYTES, // over the limit → MulterError LIMIT_FILE_SIZE → 413
    files: 1,
    fields: 5, // we only expect `type`; caps junk form fields
  },
}).single('file');
