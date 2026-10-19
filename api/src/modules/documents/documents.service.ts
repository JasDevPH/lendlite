import { ApplicationStatus, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { Readable } from 'node:stream';
import { recordAudit } from '../../lib/audit';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { storage } from '../../lib/storage';
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

function hasExpectedSignature(data: Buffer, mimeType: string): boolean {
  const expected = MAGIC_BYTES[mimeType];
  return !!expected && data.length >= expected.length && expected.every((byte, i) => data[i] === byte);
}

// ---------- Use cases ----------

// Validates the in-memory upload, stores the bytes, then records the row.
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

  if (!hasExpectedSignature(file.buffer, file.mimetype)) {
    throw new AppError(400, 'INVALID_FILE_TYPE', 'File contents do not match a PDF, JPG or PNG');
  }

  // Random key: never trust the client's filename in storage (path traversal
  // like "../../app.ts", overwriting another file). The original name is kept
  // only in the DB for display. Only the key is stored, so the storage location
  // can change (new folder, Cloudinary) without breaking rows.
  const storageKey = `${randomUUID()}${extname(file.originalname).toLowerCase()}`;
  await storage.save(storageKey, file.buffer, file.mimetype);

  try {
    return await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          applicationId,
          type,
          fileName: file.originalname, // shown to users only
          storagePath: storageKey,
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
  } catch (err) {
    // Storage and DB can't share a transaction: undo the save by hand so no
    // orphan file is left behind. A failed cleanup must not hide the real error.
    await storage.remove(storageKey).catch((cleanupErr) => logger.warn({ err: cleanupErr, storageKey }, 'Failed to remove orphan upload'));
    throw err;
  }
}

export interface DownloadableDocument {
  content: Readable;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
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
    // Only fetched AFTER the ownership check above
    content: await storage.read(document.storagePath),
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
  };
}
