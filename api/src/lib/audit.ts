import type { ApplicationStatus, Prisma } from '@prisma/client';

export type AuditAction =
  | 'CREATED'
  | 'SUBMITTED'
  | 'REVIEW_STARTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'DOCUMENT_UPLOADED';

export interface AuditEntry {
  applicationId: string;
  actorId: string;
  action: AuditAction;
  fromStatus?: ApplicationStatus;
  toStatus?: ApplicationStatus;
  metadata?: Prisma.InputJsonValue;
}

// Takes a TRANSACTION client (`tx` from prisma.$transaction), never the global
// one: the audit row is written in the same transaction as the change it
// describes, so either both are saved or neither is.
export function recordAudit(tx: Prisma.TransactionClient, entry: AuditEntry) {
  return tx.auditLog.create({ data: entry });
}
