import { ApplicationStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { ListApplicationsQuery } from './admin.schema';

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
