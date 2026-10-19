import { ApplicationStatus, Prisma, type LoanApplication } from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { prisma } from '../../lib/prisma';
import type { AuthUser } from '../../types/auth';
import { AppError } from '../../utils/AppError';
import { assertTransition } from '../applications/applications.status';
import type { ListApplicationsQuery } from './admin.schema';

// ---------- Shared helpers for admin status changes ----------

// Load an application and check the status machine allows moving it to `to`.
// 404 if it doesn't exist; 409 INVALID_STATUS_TRANSITION if the move isn't allowed.
async function loadForTransition(id: string, to: ApplicationStatus): Promise<LoanApplication> {
  const application = await prisma.loanApplication.findUnique({ where: { id } });
  if (!application) throw new AppError(404, 'NOT_FOUND', 'Application not found');
  assertTransition(application.status, to);
  return application;
}

// Every admin update uses `where: { id, status: <status we checked> }`. If another
// admin changed it in between, Prisma throws P2025 — turn that into the proper 409.
async function rethrowIfConcurrentChange(err: unknown, id: string, to: ApplicationStatus): Promise<never> {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    const current = await prisma.loanApplication.findUniqueOrThrow({ where: { id }, select: { status: true } });
    assertTransition(current.status, to); // throws 409 with the real current status
  }
  throw err;
}

// ---------- Review actions ----------

// SUBMITTED → UNDER_REVIEW
export async function startReview(id: string, admin: AuthUser) {
  const application = await loadForTransition(id, ApplicationStatus.UNDER_REVIEW);

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.loanApplication.update({
        where: { id, status: application.status },
        data: { status: ApplicationStatus.UNDER_REVIEW },
      });
      await recordAudit(tx, {
        applicationId: id,
        actorId: admin.id,
        action: 'REVIEW_STARTED',
        fromStatus: application.status,
        toStatus: ApplicationStatus.UNDER_REVIEW,
      });
      return updated;
    });
  } catch (err) {
    return rethrowIfConcurrentChange(err, id, ApplicationStatus.UNDER_REVIEW);
  }
}

// ---------- Queries ----------

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// Review queue for admins: filter by status/amount, paginated, newest first.
export async function listApplications(query: ListApplicationsQuery) {
  const { status, minAmount, maxAmount, page, pageSize } = query;

  const where: Prisma.LoanApplicationWhereInput = {
    // Drafts are the customer's unfinished work, not something to review.
    // They're hidden unless an admin explicitly asks for status=DRAFT.
    status: status ?? { not: ApplicationStatus.DRAFT },
    ...((minAmount !== undefined || maxAmount !== undefined) && {
      amountCents: { gte: minAmount, lte: maxAmount },
    }),
  };

  // Count + page in one transaction so `total` matches the rows we return
  const [total, items] = await prisma.$transaction([
    prisma.loanApplication.count({ where }),
    prisma.loanApplication.findMany({
      where,
      // id as a tie-breaker: rows with equal createdAt still have a stable
      // order, so nothing repeats or goes missing between pages
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        // Who applied — never their passwordHash
        user: { select: { id: true, email: true, fullName: true } },
        _count: { select: { documents: true } },
      },
    }),
  ]);

  const pagination: Pagination = { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  return { items, pagination };
}
