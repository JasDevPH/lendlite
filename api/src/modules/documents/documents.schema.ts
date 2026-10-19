import { z } from 'zod';

export const DOCUMENT_TYPES = ['PAYSLIP', 'ID', 'BANK_STATEMENT'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

// Multipart text field sent alongside the file
export const uploadDocumentBodySchema = z.object({
  type: z.enum(DOCUMENT_TYPES, {
    errorMap: () => ({ message: 'type must be one of PAYSLIP, ID, BANK_STATEMENT' }),
  }),
});

export const documentIdParamsSchema = z.object({
  id: z.string().uuid('Invalid document id'),
});
