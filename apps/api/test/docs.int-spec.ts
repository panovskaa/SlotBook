import request from 'supertest';
import { TestApp, createTestApp } from './helpers';

/** SRS 4.2: Swagger/OpenAPI at /api/docs, documenting every endpoint. */
describe('API docs', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('2026-11-02T08:00:00.000Z');
  });
  afterAll(async () => {
    await t.app.close();
  });

  const doc = async () => (await request(t.app.getHttpServer()).get('/api/docs-json').expect(200)).body;

  it('documents every endpoint in the SRS', async () => {
    const { openapi, paths } = await doc();
    expect(openapi).toMatch(/^3\./);
    const documented = Object.entries(paths).flatMap(([path, ops]) =>
      Object.keys(ops as object).map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(documented).toEqual(
      expect.arrayContaining([
        'GET /slots',
        'POST /bookings',
        'GET /bookings/ref/{code}',
        'GET /manage/{token}',
        'POST /manage/{token}/cancel',
        'POST /waitlist',
        'GET /waitlist/{token}',
        'POST /host/slots',
        'DELETE /host/slots/{id}',
        'GET /host/stats',
        'GET /host/insights',
        'GET /host/bookings',
        'GET /health',
      ]),
    );
  });

  it('describes request bodies with their validation rules', async () => {
    const schema = (await doc()).components.schemas.CreateBookingDto;
    expect(schema.required).toEqual(expect.arrayContaining(['slotId', 'name', 'email']));
    expect(schema.properties.name).toMatchObject({ minLength: 2, maxLength: 100 });
    expect(schema.properties.email).toMatchObject({ format: 'email' });
  });

  it('marks host routes as needing the host key, and public ones as not', async () => {
    const { paths, components } = await doc();
    expect(components.securitySchemes['host-key']).toEqual(
      expect.objectContaining({ type: 'apiKey', in: 'header', name: 'X-Host-Key' }),
    );
    expect(paths['/host/stats'].get.security).toEqual([{ 'host-key': [] }]);
    expect(paths['/host/slots'].post.security).toEqual([{ 'host-key': [] }]);
    expect(paths['/bookings'].post.security).toBeUndefined();
  });

  it('lists the error statuses an endpoint can return', async () => {
    const responses = (await doc()).paths['/bookings'].post.responses;
    expect(Object.keys(responses).sort()).toEqual(['201', '400', '404', '409', '422', '429']);
    expect(responses['422'].description).toBe('BOOKING_CUTOFF');
  });

  it('serves the docs page, with a looser CSP only there', async () => {
    const docs = await request(t.app.getHttpServer()).get('/api/docs');
    expect(docs.status).toBe(200);
    expect(docs.text).toContain('swagger-ui');
    expect(docs.headers['content-security-policy']).toContain("img-src 'self' data:");
    expect(docs.headers['content-security-policy']).toContain("script-src 'self'");

    const api = await request(t.app.getHttpServer()).get('/health');
    expect(api.headers['content-security-policy']).toContain("script-src 'self'");
    expect(api.headers['content-security-policy']).not.toContain("script-src 'self' 'unsafe-inline'");
  });
});
