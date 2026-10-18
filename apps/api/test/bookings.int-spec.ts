import { createHash } from 'crypto';
import request from 'supertest';
import { TestApp, createTestApp, resetDatabase } from './helpers';

// 2 Nov 2026, 09:00 in Berlin (UTC+1).
const NOW = '2026-11-02T08:00:00.000Z';
const BOOKER = { name: '  Ada Lovelace ', email: ' Ada@Example.COM ' };

describe('Bookings (FR-3, FR-4, FR-6)', () => {
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

  const http = () => request(t.app.getHttpServer());
  const slotAt = (startsAt: string, minutes = 30) =>
    t.prisma.slot.create({
      data: { startsAt: new Date(startsAt), endsAt: new Date(new Date(startsAt).getTime() + minutes * 60_000) },
    });
  const book = (slotId: string, booker: object = BOOKER) => http().post('/bookings').send({ slotId, ...booker });

  describe('booking a slot', () => {
    it('returns 201 with the reference, the private link and the message', async () => {
      const slot = await slotAt('2026-11-03T10:00:00Z');
      const res = await book(slot.id);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        reference: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/),
        status: 'CONFIRMED',
        slot: { startsAt: '2026-11-03T10:00:00.000Z', endsAt: '2026-11-03T10:30:00.000Z' },
        manageToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        managePath: `/manage/${res.body.manageToken}`,
        message: "Thanks, Ada. You're booked for Tuesday 3 November at 11:00. See you then.",
      });
    });

    it('stores a trimmed name, a lowercase email and only the token hash', async () => {
      const slot = await slotAt('2026-11-03T10:00:00Z');
      const res = await book(slot.id);

      const row = await t.prisma.booking.findFirstOrThrow({ where: { slotId: slot.id } });
      expect(row).toMatchObject({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        reference: res.body.reference,
        status: 'CONFIRMED',
        aiMessage: res.body.message,
        cancelTokenHash: createHash('sha256').update(res.body.manageToken).digest('hex'),
      });

      // The raw token must not be anywhere in the database.
      const dump = JSON.stringify(await t.prisma.$queryRawUnsafe('SELECT * FROM "booking"'));
      expect(dump).not.toContain(res.body.manageToken);
    });

    it('shows the slot as BOOKED to every visitor straight away', async () => {
      const slot = await slotAt('2026-11-03T10:00:00Z');
      await book(slot.id).expect(201);
      const list = await http().get('/slots').query({ from: '2026-11-02', to: '2026-11-08' });
      expect(list.body.slots).toEqual([expect.objectContaining({ id: slot.id, state: 'BOOKED' })]);
    });

    it('rejects a second booking of the same slot with 409', async () => {
      const slot = await slotAt('2026-11-03T10:00:00Z');
      await book(slot.id).expect(201);
      const res = await book(slot.id, { name: 'Grace Hopper', email: 'grace@example.com' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SLOT_ALREADY_BOOKED');
      expect(await t.prisma.booking.count()).toBe(1);
    });

    it.each([
      ['31 minutes', '2026-11-02T08:29:00Z', 201],
      ['exactly 30 minutes', '2026-11-02T08:30:00Z', 422],
      ['29 minutes', '2026-11-02T08:31:00Z', 422],
      ['after the start', '2026-11-02T09:05:00Z', 422],
    ])('booking %s before the start returns %p', async (_label, now, status) => {
      const slot = await slotAt('2026-11-02T09:00:00Z');
      t.clock.set(now);
      const res = await book(slot.id);
      expect(res.status).toBe(status);
      if (status === 422) {
        expect(res.body).toEqual({
          statusCode: 422,
          code: 'BOOKING_CUTOFF',
          message: 'Booking closes 30 minutes before start',
        });
        expect((await t.prisma.slot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe('AVAILABLE');
      }
    });

    it('returns 404 for a slot that does not exist', async () => {
      const res = await book('3f1c2a9e-5b6d-4c7e-8f90-1a2b3c4d5e6f');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('returns 404 for a deleted slot', async () => {
      const slot = await slotAt('2026-11-03T10:00:00Z');
      await t.prisma.slot.update({ where: { id: slot.id }, data: { status: 'DELETED' } });
      expect((await book(slot.id)).status).toBe(404);
    });

    it.each([
      ['a bad email', { name: 'Ada', email: 'ada@' }],
      ['a one-letter name', { name: ' A ', email: 'ada@example.com' }],
      ['a missing email', { name: 'Ada' }],
      ['an extra field', { name: 'Ada', email: 'ada@example.com', status: 'CANCELLED' }],
    ])('rejects %s with 400 and books nothing', async (_label, booker) => {
      const slot = await slotAt('2026-11-03T10:00:00Z');
      const res = await book(slot.id, booker);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(await t.prisma.booking.count()).toBe(0);
    });

    it('rejects a slot ID that is not a UUID with 400', async () => {
      expect((await book('slot-1')).status).toBe(400);
    });
  });

  describe('looking up a reference', () => {
    it('returns the slot time and status only, with no personal data', async () => {
      const slot = await slotAt('2026-11-03T10:00:00Z');
      const { body: booked } = await book(slot.id).expect(201);

      const res = await http().get(`/bookings/ref/${booked.reference}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        reference: booked.reference,
        status: 'CONFIRMED',
        slot: { startsAt: '2026-11-03T10:00:00.000Z', endsAt: '2026-11-03T10:30:00.000Z' },
      });
      const raw = JSON.stringify(res.body).toLowerCase();
      expect(raw).not.toContain('ada');
      expect(raw).not.toContain('example.com');
    });

    it('accepts a reference typed in lowercase without the dash', async () => {
      const slot = await slotAt('2026-11-03T10:00:00Z');
      const { body: booked } = await book(slot.id).expect(201);
      const typed = booked.reference.replace('-', '').toLowerCase();
      expect((await http().get(`/bookings/ref/${typed}`)).body.reference).toBe(booked.reference);
    });

    it.each(['ZZZZ-ZZZZ', 'not-a-ref', 'K7M2-QX9U'])('returns 404 for %p', async (code) => {
      const res = await http().get(`/bookings/ref/${code}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('database constraints, bypassing the API', () => {
    const insertBooking = (slotId: string, n: number, status: 'CONFIRMED' | 'CANCELLED') =>
      t.prisma.$executeRawUnsafe(
        `INSERT INTO "booking" ("id", "slot_id", "name", "email", "reference", "cancel_token_hash", "status")
         VALUES (gen_random_uuid(), $1::uuid, 'X', 'x@example.com', $2, $3, $4::"BookingStatus")`,
        slotId,
        `REF${n}`,
        `hash${n}`,
        status,
      );

    it('allows only one confirmed booking per slot', async () => {
      const slot = await slotAt('2026-11-03T10:00:00Z');
      await insertBooking(slot.id, 1, 'CONFIRMED');
      await expect(insertBooking(slot.id, 2, 'CONFIRMED')).rejects.toThrow(/booking_one_confirmed_per_slot|23505|Unique/);
    });

    it('allows cancelled bookings alongside the confirmed one', async () => {
      const slot = await slotAt('2026-11-03T10:00:00Z');
      await insertBooking(slot.id, 1, 'CANCELLED');
      await insertBooking(slot.id, 2, 'CANCELLED');
      await expect(insertBooking(slot.id, 3, 'CONFIRMED')).resolves.toBe(1);
    });

    it('rejects a duplicate reference', async () => {
      const slot = await slotAt('2026-11-03T10:00:00Z');
      const other = await slotAt('2026-11-03T11:00:00Z');
      await insertBooking(slot.id, 1, 'CONFIRMED');
      await expect(
        t.prisma.$executeRawUnsafe(
          `INSERT INTO "booking" ("id", "slot_id", "name", "email", "reference", "cancel_token_hash")
           VALUES (gen_random_uuid(), $1::uuid, 'X', 'x@example.com', 'REF1', 'other-hash')`,
          other.id,
        ),
      ).rejects.toThrow(/booking_reference_key|23505|Unique/);
    });
  });

  describe('simultaneous requests (FR-4)', () => {
    const RACERS = 20;
    const ROUNDS = 50;

    it(
      `lets exactly 1 of ${RACERS} simultaneous requests book the slot, ${ROUNDS} times over`,
      async () => {
        const failures: string[] = [];
        for (let round = 0; round < ROUNDS; round++) {
          // A fresh slot each round, an hour apart so they never overlap.
          const slot = await slotAt(new Date(Date.parse('2026-11-05T00:00:00Z') + round * 3_600_000).toISOString());
          const results = await Promise.all(
            Array.from({ length: RACERS }, (_, i) => book(slot.id, { name: `Racer ${i}`, email: `racer${i}@example.com` })),
          );

          const created = results.filter((r) => r.status === 201);
          const conflicts = results.filter((r) => r.status === 409 && r.body.code === 'SLOT_ALREADY_BOOKED');
          const rows = await t.prisma.booking.count({ where: { slotId: slot.id } });
          if (created.length !== 1 || conflicts.length !== RACERS - 1 || rows !== 1) {
            const statuses = results.map((r) => r.status).join(',');
            failures.push(`round ${round}: statuses ${statuses}, booking rows ${rows}`);
          }
        }
        expect(failures).toEqual([]);
      },
      180_000,
    );
  });
});
