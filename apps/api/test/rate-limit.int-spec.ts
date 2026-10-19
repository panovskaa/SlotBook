import request from 'supertest';
import { TestApp, createTestApp, resetDatabase } from './helpers';

const NOW = '2026-11-02T08:00:00.000Z';
const LIMIT = 3;

/** NFR-4: booking, cancelling and joining the waitlist are rate-limited per IP. */
describe('Rate limiting (NFR-4)', () => {
  let t: TestApp;

  beforeEach(async () => {
    // A fresh app per test, so each starts with empty counters.
    t = await createTestApp(NOW, { rateLimit: { limit: LIMIT, windowMs: 60_000 } });
    await resetDatabase(t.prisma);
  });
  afterEach(async () => {
    await t.app.close();
  });

  const http = () => request(t.app.getHttpServer());

  it.each([
    ['POST /bookings', () => http().post('/bookings').send({})],
    ['POST /manage/:token/cancel', () => http().post(`/manage/${'a'.repeat(43)}/cancel`)],
    ['POST /waitlist', () => http().post('/waitlist').send({})],
  ])('answers %s with 429 once over the limit', async (_label, send) => {
    for (let i = 0; i < LIMIT; i++) {
      const res = await send();
      expect(res.status).not.toBe(429);
    }
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please wait a minute and try again.',
    });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('counts each endpoint separately', async () => {
    for (let i = 0; i < LIMIT; i++) await http().post('/bookings').send({});
    expect((await http().post('/bookings').send({})).status).toBe(429);
    expect((await http().post('/waitlist').send({})).status).not.toBe(429);
  });

  it('leaves reading endpoints unlimited', async () => {
    for (let i = 0; i < LIMIT * 3; i++) {
      expect((await http().get('/slots').query({ from: '2026-11-02', to: '2026-11-08' })).status).toBe(200);
    }
  });
});
