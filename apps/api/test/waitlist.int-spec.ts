import request from 'supertest';
import { WaitlistService } from '../src/waitlist/waitlist.service';
import { HOST_KEY, TestApp, createTestApp, resetDatabase } from './helpers';

// Monday 2 Nov 2026, 09:00 in Berlin. The waitlist date is Tuesday 3 Nov.
const NOW = '2026-11-02T08:00:00.000Z';
const DATE = '2026-11-03';
const SLOT_START = '2026-11-03T09:00:00.000Z'; // 10:00 in Berlin

describe('Waitlist (FR-9)', () => {
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
  const join = (body: object) =>
    http()
      .post('/waitlist')
      .send({ date: DATE, name: 'Ada Lovelace', email: 'ada@example.com', ...body });

  async function slotAt(startsAt: string) {
    return t.prisma.slot.create({
      data: { startsAt: new Date(startsAt), endsAt: new Date(Date.parse(startsAt) + 30 * 60_000) },
    });
  }

  /** The date's only slot, booked through the API. Returns the booking's cancel token. */
  async function fullyBookedDate() {
    const slot = await slotAt(SLOT_START);
    const res = await http()
      .post('/bookings')
      .send({ slotId: slot.id, name: 'Grace Hopper', email: 'grace@example.com' })
      .expect(201);
    return { slot, cancelToken: res.body.manageToken as string };
  }

  const status = (token: string) => http().get(`/waitlist/${token}`);
  const entryStatus = async () => (await t.prisma.waitlistEntry.findFirstOrThrow()).status;

  describe('joining', () => {
    it('adds a visitor to a fully booked date and returns a private status link', async () => {
      await fullyBookedDate();
      const res = await join({ email: ' Ada@Example.COM ' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        date: DATE,
        status: 'WAITING',
        statusToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        statusPath: `/waitlist/${res.body.statusToken}`,
        emailSent: false,
      });
      const row = await t.prisma.waitlistEntry.findFirstOrThrow();
      expect(row).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com', status: 'WAITING' });
      expect(JSON.stringify(await t.prisma.$queryRawUnsafe('SELECT * FROM "waitlist_entry"'))).not.toContain(
        res.body.statusToken,
      );
    });

    it('rejects the same email twice for a date with 409, whatever its case', async () => {
      await fullyBookedDate();
      await join({}).expect(201);
      const res = await join({ email: 'ADA@example.com' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ALREADY_ON_WAITLIST');
      await join({ email: 'someone.else@example.com' }).expect(201);
    });

    it('rejects a date that still has open slots with 422', async () => {
      await fullyBookedDate();
      await slotAt('2026-11-03T13:00:00Z');
      const res = await join({});
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('DATE_HAS_AVAILABILITY');
      expect(await t.prisma.waitlistEntry.count()).toBe(0);
    });

    it('counts a free slot inside the 30-minute cutoff as not bookable', async () => {
      await slotAt('2026-11-02T08:30:00Z'); // today, exactly 30 minutes away
      await http().post('/waitlist').send({ date: '2026-11-02', name: 'Ada', email: 'ada@example.com' }).expect(201);
    });

    it('accepts a date with no slots at all', async () => {
      await join({ date: '2026-11-10' }).expect(201);
    });

    it.each([
      ['a date that has passed', { date: '2026-11-01' }],
      ['a bad email', { email: 'ada@' }],
      ['a one-letter name', { name: 'A' }],
      ['a bad date', { date: '2026-02-30' }],
    ])('rejects %s with 400', async (_label, body) => {
      const res = await join(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('the status link', () => {
    it('shows the entry while waiting, with nothing to book yet', async () => {
      await fullyBookedDate();
      const { body } = await join({}).expect(201);
      const res = await status(body.statusToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        timezone: 'Europe/Berlin',
        date: DATE,
        name: 'Ada Lovelace',
        status: 'WAITING',
        createdAt: expect.any(String),
        notifiedAt: null,
        availableSlots: [],
        booking: null,
      });
      expect(JSON.stringify(res.body)).not.toContain('ada@example.com');
    });

    it('answers wrong and malformed tokens with the same 404', async () => {
      await join({ date: '2026-11-10' }).expect(201);
      for (const token of ['a'.repeat(43), 'nope']) {
        const res = await status(token);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'This link does not match a waitlist entry',
        });
      }
    });
  });

  describe('when a slot opens up', () => {
    /** Joins as someone else, at a later time, so the order of the waitlist is clear. */
    const joinAs = async (name: string, email: string, at: string) => {
      t.clock.set(at);
      return (await join({ name, email }).expect(201)).body as { statusToken: string };
    };

    it('books the freed slot for the first person waiting, before the cancel response returns', async () => {
      const { slot, cancelToken } = await fullyBookedDate();
      const ada = await joinAs('Ada Lovelace', 'ada@example.com', '2026-11-02T08:00:00Z');
      await joinAs('Linus Torvalds', 'linus@example.com', '2026-11-02T08:05:00Z');

      t.clock.set('2026-11-02T09:00:00Z');
      await http().post(`/manage/${cancelToken}/cancel`).expect(200);

      const booking = await t.prisma.booking.findFirstOrThrow({ where: { status: 'CONFIRMED' } });
      expect(booking).toMatchObject({ slotId: slot.id, name: 'Ada Lovelace', email: 'ada@example.com' });
      expect((await t.prisma.slot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe('BOOKED');

      const res = await status(ada.statusToken);
      expect(res.body).toMatchObject({
        status: 'BOOKED',
        notifiedAt: '2026-11-02T09:00:00.000Z',
        availableSlots: [],
        booking: {
          reference: booking.reference,
          status: 'CONFIRMED',
          startsAt: SLOT_START,
          endsAt: '2026-11-03T09:30:00.000Z',
        },
      });
    });

    it('keeps everyone else waiting, so the next opening goes to the next person', async () => {
      const { slot, cancelToken } = await fullyBookedDate();
      await joinAs('Ada Lovelace', 'ada@example.com', '2026-11-02T08:00:00Z');
      const linus = await joinAs('Linus Torvalds', 'linus@example.com', '2026-11-02T08:05:00Z');

      await http().post(`/manage/${cancelToken}/cancel`).expect(200);
      expect((await status(linus.statusToken)).body.status).toBe('WAITING');

      // Ada cancels the slot she got from the waitlist: now it's Linus's.
      const adas = await t.prisma.booking.findFirstOrThrow({ where: { status: 'CONFIRMED' } });
      await t.prisma.booking.update({ where: { id: adas.id }, data: { status: 'CANCELLED' } });
      await t.prisma.slot.update({ where: { id: slot.id }, data: { status: 'AVAILABLE' } });
      await t.app.get(WaitlistService).fillFromWaitlist({
        slotId: slot.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      });

      expect((await status(linus.statusToken)).body).toMatchObject({ status: 'BOOKED' });
      const confirmed = await t.prisma.booking.findMany({ where: { status: 'CONFIRMED' } });
      expect(confirmed.map((b) => b.name)).toEqual(['Linus Torvalds']);
    });

    it('books a new slot from the host for the first person waiting too', async () => {
      await fullyBookedDate();
      await join({}).expect(201);
      const res = await http()
        .post('/host/slots')
        .set('X-Host-Key', HOST_KEY)
        .send({ date: DATE, startTime: '15:00', durationMinutes: 30 })
        .expect(201);
      expect(await entryStatus()).toBe('BOOKED');
      // The host's response already shows the new slot as taken.
      expect((await t.prisma.slot.findUniqueOrThrow({ where: { id: res.body.id } })).status).toBe('BOOKED');
    });

    it('leaves the slot free when nobody is waiting for that day', async () => {
      await fullyBookedDate();
      await join({}).expect(201);
      const other = await slotAt('2026-11-04T09:00:00Z');
      const { body } = await http()
        .post('/bookings')
        .send({ slotId: other.id, name: 'Linus', email: 'l@example.com' })
        .expect(201);
      await http().post(`/manage/${body.manageToken}/cancel`).expect(200);
      expect(await entryStatus()).toBe('WAITING');
      expect((await t.prisma.slot.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('AVAILABLE');
    });

    it('keeps the person first in line when the slot can no longer be booked', async () => {
      // Bookings close 30 minutes before the start, so a slot 20 minutes away can't go to anyone.
      const slot = await slotAt('2026-11-02T08:20:00Z');
      await t.prisma.waitlistEntry.create({
        data: { date: new Date('2026-11-02'), name: 'Ada', email: 'ada@example.com', tokenHash: 'h1' },
      });
      const filled = await t.app.get(WaitlistService).fillFromWaitlist({
        slotId: slot.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      });
      expect(filled).toBeNull();
      expect(await entryStatus()).toBe('WAITING');
      expect(await t.prisma.booking.count()).toBe(0);
    });

    it('books a new entry straight away if a slot opened while it was joining', async () => {
      // Simulate the race: the availability check passes, then a slot opens before the re-check.
      const { slot } = await fullyBookedDate();
      const original = t.prisma.waitlistEntry.create.bind(t.prisma.waitlistEntry);
      const spy = jest.spyOn(t.prisma.waitlistEntry, 'create').mockImplementationOnce((async (
        args: Parameters<typeof original>[0],
      ) => {
        const created = await original(args);
        await t.prisma.booking.updateMany({ data: { status: 'CANCELLED' } });
        await t.prisma.slot.update({ where: { id: slot.id }, data: { status: 'AVAILABLE' } });
        return created;
      }) as never);
      try {
        const res = await join({});
        expect(res.status).toBe(201);
        expect(res.body.status).toBe('BOOKED');
        expect((await t.prisma.slot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe('BOOKED');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('expiry', () => {
    it('turns an entry EXPIRED once its date has passed', async () => {
      await fullyBookedDate();
      const { body } = await join({}).expect(201);

      t.clock.set('2026-11-03T23:30:00Z'); // 00:30 on 4 Nov in Berlin
      const res = await status(body.statusToken);
      expect(res.body).toMatchObject({ status: 'EXPIRED', availableSlots: [] });
      expect(await entryStatus()).toBe('EXPIRED');
    });

    it('keeps an entry alive until the end of its day in the app time zone', async () => {
      await fullyBookedDate();
      const { body } = await join({}).expect(201);
      t.clock.set('2026-11-03T22:30:00Z'); // 23:30 on 3 Nov in Berlin
      expect((await status(body.statusToken)).body.status).toBe('WAITING');
    });
  });
});
