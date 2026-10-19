import { ApplicationStatus, EmploymentType, Prisma, Role, type LoanApplication } from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { prisma } from '../../lib/prisma';
import type { AuthUser } from '../../types/auth';
import { AppError } from '../../utils/AppError';
import type { CreateApplicationInput, UpdateApplicationInput } from './applications.schema';
import { assertTransition } from './applications.status';

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

function idempotencyKeyReused(): AppError {
  return new AppError(409, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different application');
}

// Spec: submit needs at least one of each of these document types
const REQUIRED_DOCUMENT_TYPES = ['ID', 'PAYSLIP'] as const;

// Spec: submit requires all fields filled. Returns the names of missing fields.
function findMissingFields(app: LoanApplication): string[] {
  const missing: string[] = [];
  if (!app.purpose) missing.push('purpose');
  if (!app.employmentType) missing.push('employmentType');
  // An employer name only makes sense if they're employed by someone
  if (app.employmentType !== EmploymentType.UNEMPLOYED && !app.employerName) missing.push('employerName');
  // `== null`, not falsy: an income or expenses of 0 is a valid answer
  if (app.annualIncomeCents == null) missing.push('annualIncomeCents');
  if (app.monthlyExpensesCents == null) missing.push('monthlyExpensesCents');
  return missing;
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
      // Applicant identity for the admin review page. Explicit select: never the passwordHash.
      user: { select: { id: true, fullName: true, email: true } },
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

export interface SubmitResult {
  application: LoanApplication;
  // true = this was a retry with the same key; nothing was re-processed
  replayed: boolean;
}

// DRAFT → SUBMITTED, owner only. With an Idempotency-Key, retries of the same
// submit return the original result instead of failing or double-processing.
export async function submitApplication(
  id: string,
  user: AuthUser,
  idempotencyKey?: string,
): Promise<SubmitResult> {
  const app = await prisma.loanApplication.findFirst({ where: { id, userId: user.id } });
  if (!app) throw notFound();

  if (idempotencyKey) {
    // Same key, same application → it's a retry: replay the original success
    if (app.idempotencyKey === idempotencyKey) {
      return { application: app, replayed: true };
    }
    const keyOwner = await prisma.loanApplication.findUnique({ where: { idempotencyKey } });
    if (keyOwner) {
      // Owned by THIS application: a simultaneous request with the same key
      // submitted it after our read above (our `app` is stale). Replay it.
      if (keyOwner.id === id) return { application: keyOwner, replayed: true };
      // Same key on a DIFFERENT application → client bug; refuse (spec: 409)
      throw idempotencyKeyReused();
    }
  }

  // Only a DRAFT can be submitted (e.g. a second submit WITHOUT a key → 409)
  assertTransition(app.status, ApplicationStatus.SUBMITTED);

  // Report missing fields AND missing documents together, so the UI can show
  // everything still to do in one go
  const missingFields = findMissingFields(app);
  const uploaded = await prisma.document.findMany({
    where: { applicationId: id },
    select: { type: true },
    distinct: ['type'],
  });
  const uploadedTypes = new Set(uploaded.map((d) => d.type));
  const missingDocuments = REQUIRED_DOCUMENT_TYPES.filter((type) => !uploadedTypes.has(type));

  if (missingFields.length > 0 || missingDocuments.length > 0) {
    throw new AppError(400, 'APPLICATION_INCOMPLETE', 'Please complete all required fields and documents before submitting', {
      missingFields,
      missingDocuments,
    });
  }

  try {
    const submitted = await prisma.$transaction(async (tx) => {
      // Conditional update: only succeeds if it's STILL a draft (race-safe)
      const updated = await tx.loanApplication.update({
        where: { id, status: ApplicationStatus.DRAFT },
        data: { status: ApplicationStatus.SUBMITTED, submittedAt: new Date(), idempotencyKey },
      });
      await recordAudit(tx, {
        applicationId: id,
        actorId: user.id,
        action: 'SUBMITTED',
        fromStatus: ApplicationStatus.DRAFT,
        toStatus: ApplicationStatus.SUBMITTED,
      });
      return updated;
    });
    return { application: submitted, replayed: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002: unique idempotencyKey — another application grabbed this key concurrently
      if (err.code === 'P2002') throw idempotencyKeyReused();
      // P2025: no longer a DRAFT — a concurrent submit won. If it used the same
      // key, this is a simultaneous retry: replay it. Otherwise it's a conflict.
      if (err.code === 'P2025') {
        const current = await prisma.loanApplication.findUniqueOrThrow({ where: { id } });
        if (idempotencyKey && current.idempotencyKey === idempotencyKey) {
          return { application: current, replayed: true };
        }
        assertTransition(current.status, ApplicationStatus.SUBMITTED);
      }
    }
    throw err;
  }
}
