import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';
import { resetRateLimits } from '../src/middleware/rateLimit';
import { resetDb } from './helpers/db';
import { authHeader, createUser, DEFAULT_PASSWORD } from './helpers/factories';

const api = request(app);

beforeEach(async () => {
  await resetDb();
  await resetRateLimits();
});

describe('POST /api/v1/auth/register', () => {
  const valid = { email: '  Jo.Bloggs@Example.COM ', password: 'secret123', fullName: 'Jo Bloggs' };

  it('creates a CUSTOMER and returns a token + user (no password hash)', async () => {
    const res = await api.post('/api/v1/auth/register').send(valid);

    expect(res.status).toBe(201);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ email: 'jo.bloggs@example.com', fullName: 'Jo Bloggs', role: 'CUSTOMER' });
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('stores a bcrypt hash, never the plain password', async () => {
    await api.post('/api/v1/auth/register').send(valid);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'jo.bloggs@example.com' } });

    expect(user.passwordHash).toMatch(/^\$2b\$12\$/);
    expect(user.passwordHash).not.toContain('secret123');
  });

  it('ignores a role sent by the client (mass assignment)', async () => {
    const res = await api.post('/api/v1/auth/register').send({ ...valid, role: 'ADMIN' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('CUSTOMER');
  });

  it('returns 409 for an email that is already registered (case-insensitive)', async () => {
    await createUser({ email: 'jo.bloggs@example.com' });

    const res = await api.post('/api/v1/auth/register').send(valid);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('returns 400 with field details for invalid input', async () => {
    const res = await api.post('/api/v1/auth/register').send({ email: 'nope', password: 'password' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'password', 'fullName']));
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns a token that works for /auth/me', async () => {
    const user = await createUser({ email: 'login@test.dev' });

    const login = await api.post('/api/v1/auth/login').send({ email: 'LOGIN@test.dev', password: DEFAULT_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.user).not.toHaveProperty('passwordHash');

    const me = await api.get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.data.token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.id).toBe(user.id);
  });

  it('returns the same 401 for a wrong password and an unknown email (no user enumeration)', async () => {
    await createUser({ email: 'real@test.dev' });

    const wrongPassword = await api.post('/api/v1/auth/login').send({ email: 'real@test.dev', password: 'Wrong9999' });
    const unknownEmail = await api.post('/api/v1/auth/login').send({ email: 'ghost@test.dev', password: 'Wrong9999' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 400 when fields are missing', async () => {
    const res = await api.post('/api/v1/auth/login').send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the current user for a valid token', async () => {
    const user = await createUser();

    const res = await api.get('/api/v1/auth/me').set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: user.id, email: user.email, role: 'CUSTOMER' });
  });

  it.each([
    ['no Authorization header', undefined],
    ['a non-Bearer scheme', 'Basic abc123'],
    ['a garbage token', 'Bearer not.a.jwt'],
  ])('returns 401 for %s', async (_label, header) => {
    const req = api.get('/api/v1/auth/me');
    const res = header ? await req.set('Authorization', header) : await req;

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for an expired token', async () => {
    const user = await createUser();
    const expired = jwt.sign({ sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) - 60 }, env.JWT_SECRET);

    const res = await api.get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
  });

  it('returns 401 for a token signed with a different secret (forged)', async () => {
    const user = await createUser();
    const forged = jwt.sign({ sub: user.id, role: 'ADMIN' }, 'attacker-secret-attacker-secret-1234');

    const res = await api.get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
  });

  it('returns 401 for a valid token whose user was deleted', async () => {
    const user = await createUser();
    const headers = authHeader(user);
    await prisma.user.delete({ where: { id: user.id } });

    const res = await api.get('/api/v1/auth/me').set(headers);

    expect(res.status).toBe(401);
  });
});

describe('login rate limiting', () => {
  it('blocks the 6th login within a minute with 429 — even with the right password', async () => {
    await createUser({ email: 'limited@test.dev' });
    const attempt = (password: string) => api.post('/api/v1/auth/login').send({ email: 'limited@test.dev', password });

    for (let i = 0; i < 5; i++) {
      expect((await attempt('Wrong9999')).status).toBe(401);
    }
    const sixth = await attempt(DEFAULT_PASSWORD);

    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('RATE_LIMITED');
    expect(Number(sixth.headers['retry-after'])).toBeGreaterThan(0);
  });
});
