import request from 'supertest';
import { app } from '../src/app';

// Smoke test: proves the whole test setup works (env, test DB, Supertest, app import)
describe('GET /api/v1/health', () => {
  it('returns 200 and reports the database as ok', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
