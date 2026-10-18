import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { SLOT_AVAILABLE, SlotAvailableEvent } from '../src/events';
import { HOST_KEY, TestApp, createTestApp, resetDatabase } from './helpers';

// 2 Nov 2026, 08:00 UTC (09:00 in Berlin).
const NOW = '2026-11-02T08:00:00.000Z';

describe('Host dashboard (FR-8)', () => {
  let t: TestApp;
  let events: SlotAvailableEvent[];

  beforeAll(async () => {
    t = await createTestApp(NOW);
    t.app.get(EventEmitter2).on(SLOT_AVAILABLE, (e: SlotAvailableEvent) => events.push(e));
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    t.clock.set(NOW);
    events = [];
    await resetDatabase(t.prisma);
  });

  const http = () => request(t.app.getHttpServer());
  const host = (method: 'get' | 'post' | 'delete', path: string) => http()[method](path).set('X-Host-Key', HOST_KEY);

  let n = 0;
  async function slot(startsAt: string, status: 'AVAILABLE' | 'BOOKED' | 'DELETED' = 'AVAILABLE') {
    return t.prisma.slot.create({
      data: { startsAt: new Date(startsAt), endsAt: new Date(Date.parse(startsAt) + 30 * 60_000), status },
    });
  }
  async function booking(slotId: string, status: 'CONFIRMED' | 'CANCELLED' = 'CONFIRMED', name = 'Ada Lovelace') {
    n++;
    return t.prisma.booking.create({
      data: {
        slotId,
        name,
        email: `booker${n}@example.com`,
        reference: `TEST-${String(n).padStart(4, '0')}`,
        cancelTokenHash: `hash-${n}`,
        status,
        cancelledAt: status === 'CANCELLED' ? new Date(NOW) : null,
      },
    });
  }

  describe('host key', () => {
    it.each([
      ['get', '/host/stats'],
      ['get', '/host/bookings'],
      ['delete', '/host/slots/3f1c2a9e-5b6d-4c7e-8f90-1a2b3c4d5e6f'],
    ] as const)('rejects %s %s without a valid key with 401', async (method, path) => {
      const missing = await http()[method](path);
      const wrong = await http()[method](path).set('X-Host-Key', 'not-the-key');
      for (const res of [missing, wrong]) {
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('UNAUTHORIZED');
      }
    });
  });

  describe('stats', () => {
    it('reports zeros, and no rate rather than 0 %, when nothing is published', async () => {
      const res = await host('get', '/host/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        timezone: 'Europe/Berlin',
        totalPublished: 0,
        upcomingBookings: 0,
        remainingAvailable: 0,
        bookingRate: {
          last30Days: { booked: 0, published: 0, rate: null },
          allTime: { booked: 0, published: 0, rate: null },
        },
      });
    });

    it('matches a known dataset exactly', async () => {
      // More than 30 days ago
      const old1 = await slot('2026-09-01T09:00:00Z', 'BOOKED');
      await booking(old1.id);
      await slot('2026-09-02T09:00:00Z');
      // Exactly 30 days ago: counts in the last 30 days
      await slot('2026-10-03T08:00:00Z');
      // In the last 30 days
      const p1 = await slot('2026-10-20T09:00:00Z', 'BOOKED');
      await booking(p1.id);
      await slot('2026-10-21T09:00:00Z');
      await slot('2026-10-22T09:00:00Z', 'DELETED');
      const p4 = await slot('2026-10-25T09:00:00Z', 'BOOKED');
      await booking(p4.id);
      // Starting exactly now: neither in the last 30 days nor upcoming, but in the all-time numbers
      const atNow = await slot(NOW, 'BOOKED');
      await booking(atNow.id);
      // Future
      await slot('2026-11-02T08:30:00Z'); // exactly 30 minutes away: booking has closed, so not open
      await slot('2026-11-03T09:00:00Z');
      await slot('2026-11-04T09:00:00Z');
      const f4 = await slot('2026-11-05T09:00:00Z', 'BOOKED');
      await booking(f4.id);
      await slot('2026-11-06T09:00:00Z', 'DELETED');
      const f6 = await slot('2026-11-07T09:00:00Z', 'BOOKED');
      await booking(f6.id, 'CANCELLED');
      await booking(f6.id);
      const f7 = await slot('2026-11-08T09:00:00Z');
      await booking(f7.id, 'CANCELLED');

      const res = await host('get', '/host/stats');
      expect(res.body).toEqual({
        timezone: 'Europe/Berlin',
        totalPublished: 13,
        upcomingBookings: 2,
        remainingAvailable: 3,
        bookingRate: {
          last30Days: { booked: 2, published: 4, rate: 0.5 },
          allTime: { booked: 6, published: 13, rate: 6 / 13 },
        },
      });

      // Cross-check against the database directly.
      expect(await t.prisma.slot.count({ where: { status: { not: 'DELETED' } } })).toBe(13);
      expect(await t.prisma.slot.count({ where: { status: 'BOOKED' } })).toBe(6);
    });
  });

  describe('upcoming bookings', () => {
    it('lists confirmed bookings that have not started, soonest first, with the booker’s details', async () => {
      const later = await slot('2026-11-05T09:00:00Z', 'BOOKED');
      const sooner = await slot('2026-11-03T09:00:00Z', 'BOOKED');
      const past = await slot('2026-10-30T09:00:00Z', 'BOOKED');
      const cancelledSlot = await slot('2026-11-04T09:00:00Z');
      const b1 = await booking(later.id, 'CONFIRMED', 'Grace Hopper');
      const b2 = await booking(sooner.id, 'CONFIRMED', 'Ada Lovelace');
      await booking(past.id);
      await booking(cancelledSlot.id, 'CANCELLED');

      const res = await host('get', '/host/bookings');
      expect(res.status).toBe(200);
      expect(res.body.timezone).toBe('Europe/Berlin');
      expect(res.body.bookings).toEqual([
        {
          id: b2.id,
          reference: b2.reference,
          name: 'Ada Lovelace',
          email: b2.email,
          slotId: sooner.id,
          slot: { startsAt: '2026-11-03T09:00:00.000Z', endsAt: '2026-11-03T09:30:00.000Z' },
          createdAt: b2.createdAt.toISOString(),
        },
        expect.objectContaining({ id: b1.id, name: 'Grace Hopper' }),
      ]);
    });

    it('returns an empty list when there are none', async () => {
      expect((await host('get', '/host/bookings')).body.bookings).toEqual([]);
    });
  });

  describe('deleting slots', () => {
    it('deletes a free slot: 204, then it is gone for visitors and from the stats', async () => {
      const s = await slot('2026-11-03T09:00:00Z');
      const res = await host('delete', `/host/slots/${s.id}`);
      expect(res.status).toBe(204);
      expect((await t.prisma.slot.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('DELETED');
      expect((await http().get('/slots').query({ from: '2026-11-02', to: '2026-11-08' })).body.slots).toEqual([]);
      expect((await host('get', '/host/stats')).body.totalPublished).toBe(0);
    });

    it('frees the time for a new slot', async () => {
      const s = await slot('2026-11-03T09:00:00Z');
      await host('delete', `/host/slots/${s.id}`).expect(204);
      const res = await host('post', '/host/slots').send({ date: '2026-11-03', startTime: '10:00', durationMinutes: 30 });
      expect(res.status).toBe(201);
    });

    it('refuses to delete a booked slot with 409', async () => {
      const s = await slot('2026-11-03T09:00:00Z', 'BOOKED');
      await booking(s.id);
      const res = await host('delete', `/host/slots/${s.id}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SLOT_ALREADY_BOOKED');
      expect((await t.prisma.slot.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('BOOKED');
    });

    it('refuses to delete a slot that has started with 400', async () => {
      const s = await slot('2026-11-02T07:45:00Z');
      const res = await host('delete', `/host/slots/${s.id}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SLOT_IN_PAST');
    });

    it('returns 404 for an unknown, malformed or already deleted slot', async () => {
      const s = await slot('2026-11-03T09:00:00Z', 'DELETED');
      for (const id of [s.id, '3f1c2a9e-5b6d-4c7e-8f90-1a2b3c4d5e6f', 'slot-1']) {
        const res = await host('delete', `/host/slots/${id}`);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
      }
    });

    it('never both deletes and books the same slot when the two race', async () => {
      for (let round = 0; round < 20; round++) {
        const s = await slot(new Date(Date.parse('2026-11-10T00:00:00Z') + round * 3_600_000).toISOString());
        const [del, book] = await Promise.all([
          host('delete', `/host/slots/${s.id}`),
          http().post('/bookings').send({ slotId: s.id, name: 'Racer', email: `racer${round}@example.com` }),
        ]);
        const status = (await t.prisma.slot.findUniqueOrThrow({ where: { id: s.id } })).status;
        const bookings = await t.prisma.booking.count({ where: { slotId: s.id } });
        if (del.status === 204) {
          expect([404, 409]).toContain(book.status);
          expect(status).toBe('DELETED');
          expect(bookings).toBe(0);
        } else {
          expect(del.status).toBe(409);
          expect(book.status).toBe(201);
          expect(status).toBe('BOOKED');
          expect(bookings).toBe(1);
        }
      }
    });
  });

  describe('creating slots', () => {
    it('announces a new bookable slot to the waitlist', async () => {
      const res = await host('post', '/host/slots').send({ date: '2026-11-03', startTime: '10:00', durationMinutes: 30 });
      expect(events).toEqual([{ slotId: res.body.id, startsAt: new Date('2026-11-03T09:00:00Z') }]);
    });

    it('stays quiet for a slot already inside the booking cutoff', async () => {
      await host('post', '/host/slots').send({ date: '2026-11-02', startTime: '09:15', durationMinutes: 30 }).expect(201);
      expect(events).toEqual([]);
    });
  });
});
