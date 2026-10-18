import request from 'supertest';
import { HOST_KEY, TestApp, createTestApp, resetDatabase } from './helpers';

// 2 Nov 2026, 09:00 in Berlin (UTC+1). Slots below are on 3 Nov unless stated.
const NOW = '2026-11-02T08:00:00.000Z';
const WEEK = { from: '2026-11-02', to: '2026-11-08' };

describe('Slots (FR-1, FR-2, FR-5)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp(NOW);
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    t.clock.set(NOW);
    await resetDatabase(t.prisma);
  });

  const createSlot = (body: object, key: string | null = HOST_KEY) => {
    const req = request(t.app.getHttpServer()).post('/host/slots').send(body);
    return key === null ? req : req.set('X-Host-Key', key);
  };
  const slotCount = () => t.prisma.slot.count();

  describe('host key', () => {
    it('rejects a request without a key with 401', async () => {
      const res = await createSlot({ date: '2026-11-03', startTime: '10:00', durationMinutes: 30 }, null);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ statusCode: 401, code: 'UNAUTHORIZED', message: expect.any(String) });
    });

    it('rejects a wrong key with 401', async () => {
      const res = await createSlot({ date: '2026-11-03', startTime: '10:00', durationMinutes: 30 }, 'wrong-key');
      expect(res.status).toBe(401);
      expect(await slotCount()).toBe(0);
    });
  });

  describe('creating a slot', () => {
    it('returns 201 and the slot then appears in the calendar', async () => {
      const res = await createSlot({ date: '2026-11-03', startTime: '10:00', durationMinutes: 30 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        startsAt: '2026-11-03T09:00:00.000Z',
        endsAt: '2026-11-03T09:30:00.000Z',
        durationMinutes: 30,
        state: 'AVAILABLE',
      });

      const list = await request(t.app.getHttpServer()).get('/slots').query(WEEK);
      expect(list.status).toBe(200);
      expect(list.body.timezone).toBe('Europe/Berlin');
      expect(list.body.slots).toEqual([res.body]);
    });

    it('rejects a slot in the past with 400 SLOT_IN_PAST and stores nothing', async () => {
      const res = await createSlot({ date: '2026-11-02', startTime: '08:30', durationMinutes: 30 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SLOT_IN_PAST');
      expect(await slotCount()).toBe(0);
    });

    it('treats a slot starting right now as in the past', async () => {
      const res = await createSlot({ date: '2026-11-02', startTime: '09:00', durationMinutes: 30 });
      expect(res.body.code).toBe('SLOT_IN_PAST');
    });

    it('rejects a time that the clock change skips', async () => {
      // Berlin jumps from 02:00 to 03:00 on 28 Mar 2027.
      const res = await createSlot({ date: '2027-03-28', startTime: '02:30', durationMinutes: 30 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(await slotCount()).toBe(0);
    });

    it.each([
      ['a badly formatted date', { date: '03-11-2026', startTime: '10:00', durationMinutes: 30 }],
      ['a date that does not exist', { date: '2026-02-30', startTime: '10:00', durationMinutes: 30 }],
      ['a badly formatted time', { date: '2026-11-03', startTime: '10am', durationMinutes: 30 }],
      ['a duration under 15', { date: '2026-11-03', startTime: '10:00', durationMinutes: 10 }],
      ['a duration over 240', { date: '2026-11-03', startTime: '10:00', durationMinutes: 255 }],
      ['a duration not a multiple of 15', { date: '2026-11-03', startTime: '10:00', durationMinutes: 20 }],
      ['a duration sent as a string', { date: '2026-11-03', startTime: '10:00', durationMinutes: '30' }],
      ['a missing field', { date: '2026-11-03', startTime: '10:00' }],
      ['an unknown extra field', { date: '2026-11-03', startTime: '10:00', durationMinutes: 30, status: 'BOOKED' }],
    ])('rejects %s with 400 VALIDATION_ERROR', async (_label, body) => {
      const res = await createSlot(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.details)).toBe(true);
      expect(await slotCount()).toBe(0);
    });
  });

  describe('overlaps', () => {
    beforeEach(async () => {
      // The existing slot: 10:00–11:00.
      expect((await createSlot({ date: '2026-11-03', startTime: '10:00', durationMinutes: 60 })).status).toBe(201);
    });

    it.each([
      ['identical', '10:00', 60],
      ['partly overlapping the end', '10:30', 60],
      ['partly overlapping the start', '09:30', 60],
      ['contained in it', '10:15', 30],
      ['containing it', '09:30', 120],
    ])('rejects a slot %s with 409 SLOT_OVERLAP', async (_label, startTime, durationMinutes) => {
      const res = await createSlot({ date: '2026-11-03', startTime, durationMinutes });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SLOT_OVERLAP');
      expect(await slotCount()).toBe(1);
    });

    it('allows back-to-back slots on both sides', async () => {
      expect((await createSlot({ date: '2026-11-03', startTime: '11:00', durationMinutes: 30 })).status).toBe(201);
      expect((await createSlot({ date: '2026-11-03', startTime: '09:30', durationMinutes: 30 })).status).toBe(201);
      expect(await slotCount()).toBe(3);
    });

    it('ignores deleted slots', async () => {
      await t.prisma.slot.updateMany({ data: { status: 'DELETED' } });
      expect((await createSlot({ date: '2026-11-03', startTime: '10:00', durationMinutes: 60 })).status).toBe(201);
    });

    it('lets only one of two simultaneous overlapping requests through', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () => createSlot({ date: '2026-11-03', startTime: '13:00', durationMinutes: 30 })),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(9);
      expect(await slotCount()).toBe(2);
    });
  });

  describe('database constraints, bypassing the API', () => {
    const insert = (start: string, end: string) =>
      t.prisma.$executeRawUnsafe(
        `INSERT INTO "slot" ("id", "starts_at", "ends_at") VALUES (gen_random_uuid(), $1::timestamptz, $2::timestamptz)`,
        start,
        end,
      );

    it('rejects overlapping rows with the exclusion constraint', async () => {
      await insert('2026-11-03T09:00:00Z', '2026-11-03T10:00:00Z');
      await expect(insert('2026-11-03T09:30:00Z', '2026-11-03T10:30:00Z')).rejects.toThrow(/slot_no_overlap|23P01/);
      expect(await slotCount()).toBe(1);
    });

    it('accepts back-to-back rows', async () => {
      await insert('2026-11-03T09:00:00Z', '2026-11-03T10:00:00Z');
      await expect(insert('2026-11-03T10:00:00Z', '2026-11-03T10:30:00Z')).resolves.toBe(1);
    });

    it('rejects a row that ends before it starts', async () => {
      await expect(insert('2026-11-03T10:00:00Z', '2026-11-03T09:00:00Z')).rejects.toThrow(/slot_ends_after_start|23514/);
    });
  });

  describe('listing slots', () => {
    const at = (startTime: string, durationMinutes = 30, date = '2026-11-02') =>
      createSlot({ date, startTime, durationMinutes }).expect(201);
    const list = (query = WEEK) => request(t.app.getHttpServer()).get('/slots').query(query);

    it('hides slots that have started and slots that were deleted', async () => {
      await at('10:00');
      await at('12:00');
      await t.prisma.slot.updateMany({
        where: { startsAt: new Date('2026-11-02T11:00:00Z') },
        data: { status: 'DELETED' },
      });
      t.clock.set('2026-11-02T09:10:00Z'); // 10:10 Berlin: the 10:00 slot has started

      const res = await list();
      expect(res.body.slots).toEqual([]);
    });

    it('marks slots inside the 30-minute cutoff as UNAVAILABLE, with the boundary at exactly 30', async () => {
      await at('10:00');
      t.clock.set('2026-11-02T08:29:00Z'); // 31 min before
      expect((await list()).body.slots[0].state).toBe('AVAILABLE');
      t.clock.set('2026-11-02T08:30:00Z'); // exactly 30 min before
      expect((await list()).body.slots[0].state).toBe('UNAVAILABLE');
      t.clock.set('2026-11-02T08:31:00Z'); // 29 min before
      expect((await list()).body.slots[0].state).toBe('UNAVAILABLE');
    });

    it('marks booked slots as BOOKED', async () => {
      await at('10:00');
      await t.prisma.slot.updateMany({ data: { status: 'BOOKED' } });
      expect((await list()).body.slots[0].state).toBe('BOOKED');
    });

    it('returns only slots inside the range, in order', async () => {
      await at('15:00', 30, '2026-11-08');
      await at('10:00', 30, '2026-11-03');
      await at('10:00', 30, '2026-11-09'); // next week
      const res = await list();
      expect(res.body.slots.map((s: { startsAt: string }) => s.startsAt)).toEqual([
        '2026-11-03T09:00:00.000Z',
        '2026-11-08T14:00:00.000Z',
      ]);
    });

    it('includes a slot that starts exactly at midnight on the first day of the range', async () => {
      await at('00:00', 30, '2026-11-09');
      const res = await list({ from: '2026-11-09', to: '2026-11-15' });
      expect(res.body.slots).toHaveLength(1);
    });

    it.each([
      ['a missing "to"', { from: '2026-11-02' }],
      ['a bad date', { from: '2026-11-02', to: 'next week' }],
      ['"to" before "from"', { from: '2026-11-08', to: '2026-11-02' }],
      ['a range over 62 days', { from: '2026-11-01', to: '2027-01-15' }],
    ])('rejects %s with 400', async (_label, query) => {
      const res = await list(query as typeof WEEK);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('one slot', () => {
    it('returns the slot and the time zone', async () => {
      const { body: created } = await createSlot({ date: '2026-11-03', startTime: '10:00', durationMinutes: 30 }).expect(201);
      const res = await request(t.app.getHttpServer()).get(`/slots/${created.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ timezone: 'Europe/Berlin', slot: created });
    });

    it('returns 404 for a deleted slot, a slot that has started and an unknown or malformed ID', async () => {
      const { body: created } = await createSlot({ date: '2026-11-02', startTime: '10:00', durationMinutes: 30 }).expect(201);
      t.clock.set('2026-11-02T09:00:00Z');
      for (const id of [created.id, '3f1c2a9e-5b6d-4c7e-8f90-1a2b3c4d5e6f', 'not-a-uuid']) {
        const res = await request(t.app.getHttpServer()).get(`/slots/${id}`);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('health and request IDs', () => {
    it('reports the API and database as up', async () => {
      const res = await request(t.app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', database: 'up' });
    });

    it('returns a request ID, reusing the one the caller sent', async () => {
      const generated = await request(t.app.getHttpServer()).get('/health');
      expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      const echoed = await request(t.app.getHttpServer()).get('/health').set('X-Request-Id', 'abc-123');
      expect(echoed.headers['x-request-id']).toBe('abc-123');
    });

    it('answers unknown routes with the standard error shape', async () => {
      const res = await request(t.app.getHttpServer()).get('/nope');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ statusCode: 404, code: 'NOT_FOUND', message: expect.any(String) });
    });
  });
});
