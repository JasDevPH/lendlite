import { ApplicationStatus, Prisma, Role } from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { prisma } from '../../lib/prisma';
import type { AuthUser } from '../../types/auth';
import { AppError } from '../../utils/AppError';
import type { CreateApplicationInput, UpdateApplicationInput } from './applications.schema';

// ---------- Helpers ----------

// One message for "doesn't exist" AND "not yours": a customer can't tell the
// difference, so they can't probe which application IDs exist (404, not 403)
function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Application not found');
}

function notEditable(status: ApplicationStatus): AppError {
  return new AppError(
    409,
    'APPLICATION_NOT_EDITABLE',
    `Only DRAFT applications can be edited (current status: ${status})`,
  );
}

// Ownership is part of the WHERE clause: customers only ever see their own rows.
// Admins can see any application.
function scopeToUser(id: string, user: AuthUser): Prisma.LoanApplicationWhereInput {
  return user.role === Role.ADMIN ? { id } : { id, userId: user.id };
}

// ---------- Use cases ----------

export async function createApplication(user: AuthUser, input: CreateApplicationInput) {
  // Application + its CREATED audit row commit together, or not at all
  return prisma.$transaction(async (tx) => {
    const application = await tx.loanApplication.create({
      // userId comes from the token, never from the request body
      data: { ...input, userId: user.id },
    });
    await recordAudit(tx, {
      applicationId: application.id,
      actorId: user.id,
      action: 'CREATED',
      toStatus: application.status,
    });
    return application;
  });
}

// A customer's own applications, newest first
export function listMyApplications(user: AuthUser) {
  return prisma.loanApplication.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
}

// Detail view incl. documents and repayment schedule. Owner or admin only.
export async function getApplication(id: string, user: AuthUser) {
  const application = await prisma.loanApplication.findFirst({
    where: scopeToUser(id, user),
    include: {
      documents: { orderBy: { uploadedAt: 'asc' } },
      schedule: { orderBy: { installmentNo: 'asc' } },
    },
  });
  if (!application) throw notFound();
  return application;
}

// Owner-only edit of a DRAFT. (Admins don't edit customer data, so for an
// admin who isn't the owner this is a 404 too.)
export async function updateDraft(id: string, user: AuthUser, input: UpdateApplicationInput) {
  const existing = await prisma.loanApplication.findFirst({ where: { id, userId: user.id } });
  if (!existing) throw notFound();
  if (existing.status !== ApplicationStatus.DRAFT) throw notEditable(existing.status);

  try {
    // `status: DRAFT` in the WHERE makes the check-and-update atomic: if a
    // submit sneaks in between our read and this write, nothing matches
    return await prisma.loanApplication.update({
      where: { id, status: ApplicationStatus.DRAFT },
      data: input,
    });
  } catch (err) {
    // P2025 = "record to update not found" → it stopped being a DRAFT meanwhile
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      const current = await prisma.loanApplication.findUnique({ where: { id }, select: { status: true } });
      throw current ? notEditable(current.status) : notFound();
    }
    throw err;
  }
}
