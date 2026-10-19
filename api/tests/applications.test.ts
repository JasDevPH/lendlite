import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb } from './helpers/db';
import { authHeader, createAdmin, createApplication, createUser, EXE_BYTES, PDF_BYTES } from './helpers/factories';
import { clearUploads, countUploadedFiles } from './helpers/uploads';

const api = request(app);
const newDraft = { amountCents: 1_500_000, termMonths: 24, purpose: 'Home renovation' };
const employment = { employmentType: 'FULL_TIME', employerName: 'Acme', annualIncomeCents: 9_000_000, monthlyExpensesCents: 0 };

let customer: User;
let other: User;

beforeEach(async () => {
  await resetDb();
  clearUploads();
  customer = await createUser();
  other = await createUser();
});

function upload(user: User, applicationId: string, type: string, file = PDF_BYTES, filename = `${type}.pdf`, contentType = 'application/pdf') {
  return api
    .post(`/api/v1/applications/${applicationId}/documents`)
    .set(authHeader(user))
    .field('type', type)
    .attach('file', file, { filename, contentType });
}

function submit(user: User, applicationId: string, key?: string) {
  const req = api.post(`/api/v1/applications/${applicationId}/submit`).set(authHeader(user));
  return key ? req.set('Idempotency-Key', key) : req;
}

// A draft with all fields + ID and PAYSLIP uploaded: ready to submit
async function readyDraft(user: User) {
  const draft = await createApplication(user);
  await upload(user, draft.id, 'ID').expect(201);
  await upload(user, draft.id, 'PAYSLIP').expect(201);
  return draft;
}

describe('create / list / edit a draft', () => {
  it('lets a customer create a DRAFT, ignoring protected fields', async () => {
    const res = await api
      .post('/api/v1/applications')
      .set(authHeader(customer))
      .send({ ...newDraft, status: 'APPROVED', annualRateBps: 500, userId: other.id });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'DRAFT', userId: customer.id, annualRateBps: null });
    const audit = await prisma.auditLog.findMany({ where: { applicationId: res.body.data.id } });
    expect(audit.map((a) => a.action)).toEqual(['CREATED']);
  });

  it('lists only my own applications', async () => {
    const mine = await createApplication(customer);
    await createApplication(other);

    const res = await api.get('/api/v1/applications').set(authHeader(customer));

    expect(res.status).toBe(200);
    expect(res.body.data.map((a: { id: string }) => a.id)).toEqual([mine.id]);
  });

  it('lets the owner edit a DRAFT', async () => {
    const draft = await createApplication(customer);

    const res = await api.patch(`/api/v1/applications/${draft.id}`).set(authHeader(customer)).send({ purpose: 'New car' });

    expect(res.status).toBe(200);
    expect(res.body.data.purpose).toBe('New car');
  });

  it('returns 409 when editing after submit', async () => {
    const submitted = await createApplication(customer, { status: 'SUBMITTED' });

    const res = await api.patch(`/api/v1/applications/${submitted.id}`).set(authHeader(customer)).send({ purpose: 'Too late' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPLICATION_NOT_EDITABLE');
  });

  it('rejects admins on customer-only routes (403)', async () => {
    const admin = await createAdmin();

    const res = await api.post('/api/v1/applications').set(authHeader(admin)).send(newDraft);

    expect(res.status).toBe(403);
  });
});

describe('ownership: other customers get 404, never 403', () => {
  it.each([
    ['view', (id: string) => api.get(`/api/v1/applications/${id}`)],
    ['edit', (id: string) => api.patch(`/api/v1/applications/${id}`).send({ purpose: 'Hacked' })],
    ['submit', (id: string) => api.post(`/api/v1/applications/${id}/submit`)],
  ])("can't %s someone else's application", async (_action, send) => {
    const theirs = await createApplication(other);

    const res = await send(theirs.id).set(authHeader(customer));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('detail includes the applicant (name + email) but never a password hash', async () => {
    const mine = await createApplication(customer);

    const res = await api.get(`/api/v1/applications/${mine.id}`).set(authHeader(customer));

    expect(res.status).toBe(200);
    expect(res.body.data.user).toEqual({ id: customer.id, fullName: customer.fullName, email: customer.email });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('gives the same 404 for a non-existent id (no way to probe ids)', async () => {
    const theirs = await createApplication(other);

    const notMine = await api.get(`/api/v1/applications/${theirs.id}`).set(authHeader(customer));
    const missing = await api.get(`/api/v1/applications/${randomUUID()}`).set(authHeader(customer));

    expect(notMine.body).toEqual(missing.body);
  });

  it("can't upload to or download from someone else's application", async () => {
    const theirs = await readyDraft(other);
    const doc = await prisma.document.findFirstOrThrow({ where: { applicationId: theirs.id } });

    expect((await upload(customer, theirs.id, 'ID')).status).toBe(404);
    expect((await api.get(`/api/v1/documents/${doc.id}/download`).set(authHeader(customer))).status).toBe(404);
  });
});

describe('submit', () => {
  it('requires all fields AND an ID + PAYSLIP document', async () => {
    const res = await api.post('/api/v1/applications').set(authHeader(customer)).send(newDraft);

    const submitted = await submit(customer, res.body.data.id);

    expect(submitted.status).toBe(400);
    expect(submitted.body.error.code).toBe('APPLICATION_INCOMPLETE');
    expect(submitted.body.error.details.missingFields).toEqual(
      expect.arrayContaining(['employmentType', 'annualIncomeCents', 'monthlyExpensesCents']),
    );
    expect(submitted.body.error.details.missingDocuments).toEqual(['ID', 'PAYSLIP']);
  });

  it('does not count an optional BANK_STATEMENT towards the required documents', async () => {
    const draft = await createApplication(customer);
    await upload(customer, draft.id, 'PAYSLIP').expect(201);
    await upload(customer, draft.id, 'BANK_STATEMENT').expect(201);

    const res = await submit(customer, draft.id);

    expect(res.status).toBe(400);
    expect(res.body.error.details.missingDocuments).toEqual(['ID']);
  });

  it('accepts income/expenses of 0 as valid answers', async () => {
    const res = await api.post('/api/v1/applications').set(authHeader(customer)).send({ ...newDraft, ...employment });
    await upload(customer, res.body.data.id, 'ID').expect(201);
    await upload(customer, res.body.data.id, 'PAYSLIP').expect(201);

    const submitted = await submit(customer, res.body.data.id);

    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe('SUBMITTED');
  });

  it('returns 409 INVALID_STATUS_TRANSITION when submitting twice without a key', async () => {
    const draft = await readyDraft(customer);
    await submit(customer, draft.id).expect(200);

    const again = await submit(customer, draft.id);

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('idempotent submit', () => {
  it('replays the same response for a retry with the same key, processing it once', async () => {
    const draft = await readyDraft(customer);
    const key = randomUUID();

    const first = await submit(customer, draft.id, key);
    const retry = await submit(customer, draft.id, key);

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(await prisma.auditLog.count({ where: { applicationId: draft.id, action: 'SUBMITTED' } })).toBe(1);
  });

  it('returns 409 when the same key is used for a different application', async () => {
    const a = await readyDraft(customer);
    const b = await readyDraft(customer);
    const key = randomUUID();
    await submit(customer, a.id, key).expect(200);

    const res = await submit(customer, b.id, key);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('handles two simultaneous submits with the same key: both succeed, one submission', async () => {
    const draft = await readyDraft(customer);
    const key = randomUUID();

    const [r1, r2] = await Promise.all([submit(customer, draft.id, key), submit(customer, draft.id, key)]);

    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(await prisma.auditLog.count({ where: { applicationId: draft.id, action: 'SUBMITTED' } })).toBe(1);
  });

  it('rejects a malformed key with 400', async () => {
    const draft = await readyDraft(customer);

    const res = await submit(customer, draft.id, 'abc');

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('idempotency-key');
  });
});

describe('documents', () => {
  it('stores an upload under a random name and lets the owner download the exact bytes', async () => {
    const draft = await createApplication(customer);

    const res = await upload(customer, draft.id, 'PAYSLIP', PDF_BYTES, 'March Payslip.pdf');
    expect(res.status).toBe(201);
    expect(res.body.data.fileName).toBe('March Payslip.pdf');
    expect(res.body.data.storagePath).toMatch(/^[0-9a-f-]{36}\.pdf$/);

    const download = await api
      .get(`/api/v1/documents/${res.body.data.id}/download`)
      .set(authHeader(customer))
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    expect(Buffer.compare(download.body as Buffer, PDF_BYTES)).toBe(0);
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.headers['cache-control']).toBe('private, no-store');
  });

  it.each([
    ['a .txt file', Buffer.from('hello'), 'notes.txt', 'text/plain', 400],
    ['an .exe disguised as a PDF (magic bytes)', EXE_BYTES, 'virus.pdf', 'application/pdf', 400],
    ['a file over 5 MB', Buffer.concat([PDF_BYTES, Buffer.alloc(5 * 1024 * 1024)]), 'big.pdf', 'application/pdf', 413],
  ])('rejects %s and leaves no file on disk', async (_label, bytes, filename, contentType, status) => {
    const draft = await createApplication(customer);

    const res = await upload(customer, draft.id, 'PAYSLIP', bytes, filename, contentType);

    expect(res.status).toBe(status);
    expect(countUploadedFiles()).toBe(0);
  });

  it('returns 409 when uploading to a submitted application (and cleans up the file)', async () => {
    const submitted = await createApplication(customer, { status: 'SUBMITTED' });

    const res = await upload(customer, submitted.id, 'ID');

    expect(res.status).toBe(409);
    expect(countUploadedFiles()).toBe(0);
  });
});
