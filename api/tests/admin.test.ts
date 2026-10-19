import { ApplicationStatus, type User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb } from './helpers/db';
import { authHeader, createAdmin, createApplication, createUser, PDF_BYTES } from './helpers/factories';
import { clearUploads } from './helpers/uploads';

const api = request(app);

let admin: User;
let customer: User;

beforeEach(async () => {
  await resetDb();
  clearUploads();
  admin = await createAdmin();
  customer = await createUser();
});

const startReview = (id: string, user = admin) => api.post(`/api/v1/admin/applications/${id}/start-review`).set(authHeader(user));
const approve = (id: string, annualRateBps: unknown = 1200) =>
  api.post(`/api/v1/admin/applications/${id}/approve`).set(authHeader(admin)).send({ annualRateBps });
const reject = (id: string, reason: unknown = 'Income does not cover repayments') =>
  api.post(`/api/v1/admin/applications/${id}/reject`).set(authHeader(admin)).send({ reason });

describe('full lifecycle: DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED', () => {
  it('works end to end over HTTP, with a correct schedule and a complete audit trail', async () => {
    const asCustomer = authHeader(customer);

    // Customer: create, fill in, upload, submit
    const created = await api
      .post('/api/v1/applications')
      .set(asCustomer)
      .send({ amountCents: 1_000_000, termMonths: 12, purpose: 'Car purchase' })
      .expect(201);
    const id = created.body.data.id as string;
    await api
      .patch(`/api/v1/applications/${id}`)
      .set(asCustomer)
      .send({ employmentType: 'FULL_TIME', employerName: 'Acme', annualIncomeCents: 9_500_000, monthlyExpensesCents: 300_000 })
      .expect(200);
    for (const type of ['ID', 'PAYSLIP']) {
      await api.post(`/api/v1/applications/${id}/documents`).set(asCustomer).field('type', type)
        .attach('file', PDF_BYTES, { filename: `${type}.pdf`, contentType: 'application/pdf' }).expect(201);
    }
    await api.post(`/api/v1/applications/${id}/submit`).set(asCustomer).set('Idempotency-Key', randomUUID()).expect(200);

    // Admin: review and approve at 12%
    await startReview(id).expect(200);
    const approved = await approve(id, 1200).expect(200);

    // Spec example: $10,000 at 12% for 12 months
    const schedule = approved.body.data.schedule as Array<{ installmentNo: number; paymentCents: number; principalCents: number; balanceCents: number }>;
    expect(approved.body.data).toMatchObject({ status: 'APPROVED', annualRateBps: 1200, decidedById: admin.id });
    expect(schedule).toHaveLength(12);
    expect(schedule[0]!.paymentCents).toBe(88_849);
    expect(schedule[11]!.balanceCents).toBe(0);
    expect(schedule.reduce((sum, i) => sum + i.principalCents, 0)).toBe(1_000_000);

    // Customer can see the schedule on their application
    const detail = await api.get(`/api/v1/applications/${id}`).set(asCustomer).expect(200);
    expect(detail.body.data.schedule).toHaveLength(12);

    // Audit trail shows every step, in order, with the right actor
    const audit = await api.get(`/api/v1/admin/applications/${id}/audit`).set(authHeader(admin)).expect(200);
    expect(audit.body.data.map((e: { action: string }) => e.action)).toEqual([
      'CREATED', 'DOCUMENT_UPLOADED', 'DOCUMENT_UPLOADED', 'SUBMITTED', 'REVIEW_STARTED', 'APPROVED',
    ]);
    expect(audit.body.data[0].actor.id).toBe(customer.id);
    expect(audit.body.data.at(-1).actor).toMatchObject({ id: admin.id, role: 'ADMIN' });
  });
});

describe('invalid status transitions → 409', () => {
  it.each<[string, ApplicationStatus, (id: string) => request.Test]>([
    ['start review on a DRAFT', 'DRAFT', (id) => startReview(id)],
    ['start review twice', 'UNDER_REVIEW', (id) => startReview(id)],
    ['approve a SUBMITTED (skip review)', 'SUBMITTED', (id) => approve(id)],
    ['approve an APPROVED', 'APPROVED', (id) => approve(id)],
    ['reject an APPROVED', 'APPROVED', (id) => reject(id)],
    ['approve a REJECTED', 'REJECTED', (id) => approve(id)],
  ])('%s', async (_label, status, action) => {
    const application = await createApplication(customer, { status });

    const res = await action(application.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('approve', () => {
  it('validates the rate (500–2500 bps)', async () => {
    const application = await createApplication(customer, { status: 'UNDER_REVIEW' });

    for (const rate of [499, 2501, '1200']) {
      expect((await approve(application.id, rate)).status).toBe(400);
    }
    // Missing rate: send {} directly (passing undefined to approve() would use its default)
    const missing = await api.post(`/api/v1/admin/applications/${application.id}/approve`).set(authHeader(admin)).send({});
    expect(missing.status).toBe(400);
  });

  it('is atomic: if inserting the schedule fails, the status change is rolled back too', async () => {
    const application = await createApplication(customer, { status: 'UNDER_REVIEW', termMonths: 6 });
    // Plant a conflicting installment #1 so step 2 (createMany) fails mid-transaction
    await prisma.repaymentInstallment.create({
      data: { applicationId: application.id, installmentNo: 1, dueDate: new Date(), paymentCents: 1, principalCents: 1, interestCents: 0, balanceCents: 0 },
    });

    const res = await approve(application.id);

    expect(res.status).toBe(500);
    const after = await prisma.loanApplication.findUniqueOrThrow({ where: { id: application.id } });
    expect(after).toMatchObject({ status: 'UNDER_REVIEW', annualRateBps: null, decidedAt: null });
    expect(await prisma.repaymentInstallment.count({ where: { applicationId: application.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { applicationId: application.id, action: 'APPROVED' } })).toBe(0);
  });

  it('lets only one of two simultaneous approvals win (no duplicate schedule)', async () => {
    const application = await createApplication(customer, { status: 'UNDER_REVIEW', termMonths: 24 });

    const results = await Promise.all([approve(application.id, 1000), approve(application.id, 1500)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.repaymentInstallment.count({ where: { applicationId: application.id } })).toBe(24);
  });
});

describe('reject', () => {
  it('requires a reason of at least 10 characters (after trimming)', async () => {
    const application = await createApplication(customer, { status: 'UNDER_REVIEW' });

    expect((await reject(application.id, 'Too short')).status).toBe(400);
    expect((await reject(application.id, '            ')).status).toBe(400);
  });

  it('rejects with the reason visible to the customer', async () => {
    const application = await createApplication(customer, { status: 'UNDER_REVIEW' });

    await reject(application.id, '  Income does not cover repayments  ').expect(200);

    const detail = await api.get(`/api/v1/applications/${application.id}`).set(authHeader(customer)).expect(200);
    expect(detail.body.data).toMatchObject({ status: 'REJECTED', rejectionReason: 'Income does not cover repayments' });
  });
});

describe('admin list + stats', () => {
  beforeEach(async () => {
    await createApplication(customer, { status: 'DRAFT', amountCents: 300_000 });
    await createApplication(customer, { status: 'SUBMITTED', amountCents: 500_000 });
    await createApplication(customer, { status: 'SUBMITTED', amountCents: 4_000_000 });
    await createApplication(customer, { status: 'APPROVED', amountCents: 2_000_000 });
    await createApplication(customer, { status: 'APPROVED', amountCents: 1_500_000, createdAt: new Date('2025-01-15T00:00:00Z') });
  });

  it('hides drafts by default and filters by status and amount', async () => {
    const all = await api.get('/api/v1/admin/applications').set(authHeader(admin)).expect(200);
    expect(all.body.data.pagination.total).toBe(4);

    const filtered = await api
      .get('/api/v1/admin/applications?status=SUBMITTED&minAmount=1000000')
      .set(authHeader(admin))
      .expect(200);
    expect(filtered.body.data.items).toHaveLength(1);
    expect(filtered.body.data.items[0].amountCents).toBe(4_000_000);
  });

  it('paginates with a stable total', async () => {
    const page2 = await api.get('/api/v1/admin/applications?pageSize=3&page=2').set(authHeader(admin)).expect(200);

    expect(page2.body.data.items).toHaveLength(1);
    expect(page2.body.data.pagination).toEqual({ page: 2, pageSize: 3, total: 4, totalPages: 2 });
  });

  it('returns counts per status and the approved total (raw SQL)', async () => {
    const res = await api.get('/api/v1/admin/stats').set(authHeader(admin)).expect(200);

    expect(res.body.data).toEqual({
      countsByStatus: { DRAFT: 1, SUBMITTED: 2, UNDER_REVIEW: 0, APPROVED: 2, REJECTED: 0 },
      totalApplications: 5,
      totalApprovedAmountCents: 3_500_000,
      since: null,
    });
  });

  it('filters stats by ?since', async () => {
    const res = await api.get('/api/v1/admin/stats?since=2026-01-01').set(authHeader(admin)).expect(200);

    expect(res.body.data.totalApprovedAmountCents).toBe(2_000_000);
  });

  it('is admin-only (403 for customers)', async () => {
    await api.get('/api/v1/admin/stats').set(authHeader(customer)).expect(403);
    await api.get('/api/v1/admin/applications').set(authHeader(customer)).expect(403);
  });
});
