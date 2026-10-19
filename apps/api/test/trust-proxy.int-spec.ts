import request from 'supertest';
import { TestApp, createTestApp } from './helpers';

const NOW = '2026-11-02T08:00:00.000Z';
const LIMIT = 2;

/** Rate limits behind a proxy (Render): per visitor, and a forged header can't get around them. */
describe('TRUST_PROXY', () => {
  let t: TestApp;
  afterEach(async () => {
    await t.app.close();
  });

  const http = () => request(t.app.getHttpServer());
  const bookAs = (forwardedFor: string) => http().post('/bookings').set('X-Forwarded-For', forwardedFor).send({});

  it('ignores X-Forwarded-For when no proxy is trusted, so faking it does not reset the limit', async () => {
    t = await createTestApp(NOW, { rateLimit: { limit: LIMIT, windowMs: 60_000 } });

    expect((await http().get('/health/ip')).body.ip).toMatch(/127\.0\.0\.1|::1/);
    await bookAs('203.0.113.1');
    await bookAs('203.0.113.2');
    expect((await bookAs('203.0.113.3')).status).toBe(429);
  });

  it('counts each visitor separately behind one trusted proxy', async () => {
    t = await createTestApp(NOW, { rateLimit: { limit: LIMIT, windowMs: 60_000 }, trustProxy: 1 });

    expect((await http().get('/health/ip').set('X-Forwarded-For', '203.0.113.7')).body).toEqual({
      ip: '203.0.113.7',
    });
    for (let i = 0; i < LIMIT; i++) await bookAs('203.0.113.1');
    expect((await bookAs('203.0.113.1')).status).toBe(429);
    expect((await bookAs('203.0.113.2')).status).not.toBe(429);
  });

  it('only trusts the last hop, so a client cannot pick its own address', async () => {
    t = await createTestApp(NOW, { rateLimit: { limit: LIMIT, windowMs: 60_000 }, trustProxy: 1 });

    // The proxy appends the real client (198.51.100.9) after whatever the client sent.
    const res = await http().get('/health/ip').set('X-Forwarded-For', '1.2.3.4, 198.51.100.9');
    expect(res.body.ip).toBe('198.51.100.9');
  });
});
