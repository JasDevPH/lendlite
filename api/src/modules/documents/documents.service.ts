import { ApplicationStatus, Role } from '@prisma/client';
import { open, unlink } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import { recordAudit } from '../../lib/audit';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { UPLOAD_ROOT } from '../../middleware/upload';
import type { AuthUser } from '../../types/auth';
import { AppError } from '../../utils/AppError';
import type { DocumentType } from './documents.schema';

// ---------- File helpers ----------

// "Magic bytes": the first bytes of a real file of each type. Unlike the
// filename or Content-Type, these come from the file itself, so a renamed
// .exe can't pass as a PDF.
const MAGIC_BYTES: Record<string, number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d], // "%PDF-"
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
};

async function hasExpectedSignature(filePath: string, mimeType: string): Promise<boolean> {
  const expected = MAGIC_BYTES[mimeType];
  if (!expected) return false;

  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(expected.length);
    const { bytesRead } = await handle.read(buffer, 0, expected.length, 0);
    return bytesRead === expected.length && expected.every((byte, i) => buffer[i] === byte);
  } finally {
    await handle.close();
  }
}

// Delete an uploaded file we're not keeping (failed validation, not allowed…).
// Never throws: a cleanup failure shouldn't hide the original error.
export async function discardUpload(file: Express.Multer.File): Promise<void> {
  try {
    await unlink(file.path);
  } catch (err) {
    logger.warn({ err, path: file.path }, 'Failed to delete discarded upload');
  }
}

// Resolve a stored relative path to an absolute one, refusing anything that
// would escape the upload folder (defence in depth against a tampered DB row)
function toAbsoluteUploadPath(storagePath: string): string {
  const absolute = resolve(UPLOAD_ROOT, storagePath);
  if (!absolute.startsWith(UPLOAD_ROOT + sep)) {
    throw new AppError(404, 'NOT_FOUND', 'Document not found');
  }
  return absolute;
}

// ---------- Use cases ----------

// Saves metadata for a file multer has already written to disk.
// The CALLER must discardUpload(file) if this throws.
export async function uploadDocument(
  applicationId: string,
  user: AuthUser,
  file: Express.Multer.File,
  type: DocumentType,
) {
  // Owner only (404 for others, same as applications)
  const application = await prisma.loanApplication.findFirst({
    where: { id: applicationId, userId: user.id },
    select: { id: true, status: true },
  });
  if (!application) throw new AppError(404, 'NOT_FOUND', 'Application not found');

  // Documents are part of the application: frozen once submitted
  if (application.status !== ApplicationStatus.DRAFT) {
    throw new AppError(
      409,
      'APPLICATION_NOT_EDITABLE',
      `Documents can only be added to DRAFT applications (current status: ${application.status})`,
    );
  }

  if (!(await hasExpectedSignature(file.path, file.mimetype))) {
    throw new AppError(400, 'INVALID_FILE_TYPE', 'File contents do not match a PDF, JPG or PNG');
  }

  return prisma.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        applicationId,
        type,
        fileName: file.originalname, // shown to users only
        // Store only the generated name, not the absolute path: the upload
        // folder can move (new server, Docker volume) without breaking rows
        storagePath: basename(file.path),
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });
    await recordAudit(tx, {
      applicationId,
      actorId: user.id,
      action: 'DOCUMENT_UPLOADED',
      metadata: { documentId: document.id, type, fileName: file.originalname },
    });
    return document;
  });
}

export interface DownloadableDocument {
  absolutePath: string;
  fileName: string;
  mimeType: string;
}

// Owner of the application, or any admin. Others get 404.
export async function getDocumentForDownload(documentId: string, user: AuthUser): Promise<DownloadableDocument> {
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      // Ownership via the parent application, inside the query
      ...(user.role === Role.ADMIN ? {} : { application: { userId: user.id } }),
    },
  });
  if (!document) throw new AppError(404, 'NOT_FOUND', 'Document not found');

  return {
    absolutePath: toAbsoluteUploadPath(document.storagePath),
    fileName: document.fileName,
    mimeType: document.mimeType,
  };
}
