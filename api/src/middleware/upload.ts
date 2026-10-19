import { extname } from 'node:path';
import multer from 'multer';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

// Allow-list: each accepted MIME type and the extensions that may carry it.
// Spec: PDF/JPG/PNG only, checked by mimetype AND extension.
const ALLOWED_TYPES: Record<string, readonly string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

export const MAX_UPLOAD_BYTES = env.MAX_UPLOAD_MB * 1024 * 1024;

// Keep the upload in memory (max 5 MB) until it has passed every check; only
// then does the documents service store it (disk or Cloudinary). Nothing
// rejected is ever written anywhere, so there's nothing to clean up.
const storage = multer.memoryStorage();

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
