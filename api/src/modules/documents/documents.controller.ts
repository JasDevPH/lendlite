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

  // Multer has ALREADY saved the file. If anything below fails (bad `type`,
  // not the owner, not a draft, wrong magic bytes, DB error), delete it.
  try {
    // Validated here, not via validate() middleware: multer must parse the
    // multipart body first, and a failure must still trigger the cleanup
    const { type } = uploadDocumentBodySchema.parse(req.body);
    const document = await documentsService.uploadDocument(id, req.user!, file, type);
    res.status(201).json({ data: document });
  } catch (err) {
    await documentsService.discardUpload(file);
    throw err;
  }
});

// GET /documents/:id/download
export const download = asyncHandler(async (req, res, next) => {
  const { id } = req.params as { id: string };
  const document = await documentsService.getDocumentForDownload(id, req.user!);

  // Personal financial documents: never let browsers/proxies cache them
  res.set('Cache-Control', 'private, no-store');
  // res.download streams the file and sets Content-Disposition: attachment
  // (the browser saves it rather than rendering it inline — safer)
  res.download(document.absolutePath, document.fileName, (err) => {
    if (!err) return;
    // Row exists but the file is gone from disk: report 404, not a crash
    if (!res.headersSent) {
      next(new AppError(404, 'NOT_FOUND', 'Document file is missing'));
    }
  });
});
