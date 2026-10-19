import { prisma } from '../../src/lib/prisma';

// Empty every table between tests so each one starts from a known state.
// TRUNCATE is much faster than DELETE; CASCADE follows foreign keys.
// (Static SQL — no user input — so the tagged template has nothing to bind.)
export async function resetDb(): Promise<void> {
  await prisma.$executeRaw`
    TRUNCATE "AuditLog", "RepaymentInstallment", "Document", "LoanApplication", "User" CASCADE
  `;
}
