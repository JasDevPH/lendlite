import { pipeline } from 'node:stream/promises';
import { logger } from '../../lib/logger';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { uploadDocumentBodySchema } from './documents.schema';
import * as documentsService from './documents.service';

// POST /applications/:id/documents  (multipart: field "file" + text field "type")
export const upload = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const file = req.file;
  if (!file) {
    throw new AppError(400, 'FILE_REQUIRED', 'Attach a file in the "file" form field');
  }

  // Validated here, not via validate() middleware: multer must parse the
  // multipart body first. The file is still only in memory at this point.
  const { type } = uploadDocumentBodySchema.parse(req.body);
  const document = await documentsService.uploadDocument(id, req.user!, file, type);
  res.status(201).json({ data: document });
});

// GET /documents/:id/download
export const download = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const document = await documentsService.getDocumentForDownload(id, req.user!);

  // Personal financial documents: never let browsers/proxies cache them
  res.set('Cache-Control', 'private, no-store');
  // attachment: the browser saves it rather than rendering it inline (safer)
  res.attachment(document.fileName);
  res.type(document.mimeType);
  res.set('Content-Length', String(document.sizeBytes));
  // Stream (disk or Cloudinary) straight to the client, never fully in memory.
  // If it breaks mid-way the headers are already sent: log and drop the connection.
  pipeline(document.content, res).catch((err) => logger.warn({ err, documentId: id }, 'Document download interrupted'));
});
