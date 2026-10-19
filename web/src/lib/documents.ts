import { api } from './api';
import type { DocumentType } from './types';

// Mirrors the API's upload rules (api/src/middleware/upload.ts). Checking in the
// browser first gives instant feedback (no waiting for a 6 MB upload to fail);
// the server still validates type, extension, size AND the file's magic bytes.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ALLOWED: Record<string, readonly string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

// Value for <input accept="…">: also filters the OS file picker
export const ACCEPT_ATTRIBUTE = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

// Returns an error message, or null if the file looks acceptable
export function checkFile(file: File): string | null {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const allowedExtensions = ALLOWED[file.type];
  if (!allowedExtensions || !allowedExtensions.includes(extension)) {
    return 'Only PDF, JPG or PNG files can be uploaded.';
  }
  if (file.size > MAX_UPLOAD_BYTES) return 'This file is larger than 5 MB.';
  if (file.size === 0) return 'This file is empty.';
  return null;
}

export interface DocumentTypeInfo {
  type: DocumentType;
  title: string;
  description: string;
  required: boolean;
}

export const DOCUMENT_TYPES: DocumentTypeInfo[] = [
  { type: 'ID', title: 'Photo ID', description: "Driver's licence or passport — the photo page, clearly readable.", required: true },
  { type: 'PAYSLIP', title: 'Recent payslip', description: 'Your most recent payslip (or business income statement).', required: true },
  { type: 'BANK_STATEMENT', title: 'Bank statement', description: 'Can help us assess your application faster.', required: false },
];

// Download a document the user is allowed to see. A plain <a href> can't send
// the Authorization header, so fetch it as a Blob and save it via a temporary link.
export async function downloadDocument(documentId: string, fileName: string): Promise<void> {
  const blob = await api.download(`/documents/${documentId}/download`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Free the memory once the browser has started the download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
