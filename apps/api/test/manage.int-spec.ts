import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { SLOT_AVAILABLE, SlotAvailableEvent } from '../src/events';
import { TestApp, createTestApp, resetDatabase } from './helpers';

// 2 Nov 2026, 09:00 in Berlin. The slot starts two hours later, at 10:00 UTC.
const NOW = '2026-11-02T08:00:00.000Z';
const SLOT_START = '2026-11-02T10:00:00.000Z';
const minutesBeforeStart = (m: number) => new Date(Date.parse(SLOT_START) - m * 60_000).toISOString();

describe('Cancel through the private link (FR-7)', () => {
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

  /** Creates the slot and books it through the API, returning the private token. */
  async function bookSlot(): Promise<{ token: string; slotId: string; reference: string }> {
    const slot = await t.prisma.slot.create({
      data: { startsAt: new Date(SLOT_START), endsAt: new Date(Date.parse(SLOT_START) + 30 * 60_000) },
    });
    const res = await http()
      .post('/bookings')
      .send({ slotId: slot.id, name: 'Ada Lovelace', email: 'ada@example.com' })
      .expect(201);
    return { token: res.body.manageToken, slotId: slot.id, reference: res.body.reference };
  }

  const slotStatus = async (id: string) => (await t.prisma.slot.findUniqueOrThrow({ where: { id } })).status;

  describe('viewing', () => {
    it('shows the booking, with the booker’s own details, to the link holder', async () => {
      const { token, reference } = await bookSlot();
      const res = await http().get(`/manage/${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        timezone: 'Europe/Berlin',
        reference,
        status: 'CONFIRMED',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        slot: { startsAt: SLOT_START, endsAt: '2026-11-02T10:30:00.000Z' },
        canCancel: true,
        cancelledAt: null,
      });
    });

    it('says cancelling has closed once inside the 60-minute cutoff', async () => {
      const { token } = await bookSlot();
      t.clock.set(minutesBeforeStart(60));
      expect((await http().get(`/manage/${token}`)).body.canCancel).toBe(false);
    });

    it('answers a wrong token and a malformed one with the same 404', async () => {
      const { token } = await bookSlot();
      const wrong = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
      const responses = await Promise.all(
        [wrong, 'not-a-token', 'x'.repeat(200), '..%2F..%2Fetc'].map((tk) => http().get(`/manage/${tk}`)),
      );
      for (const res of responses) {
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ statusCode: 404, code: 'NOT_FOUND', message: 'This link does not match a booking' });
      }
      expect((await http().post(`/manage/${wrong}/cancel`)).status).toBe(404);
    });

    it('never stores the raw token', async () => {
      const { token } = await bookSlot();
      const dump = JSON.stringify(await t.prisma.$queryRawUnsafe('SELECT * FROM "booking"'));
      expect(dump).not.toContain(token);
    });
  });

  describe('cancelling', () => {
    it('cancels 61 minutes before the start and frees the slot', async () => {
      const { token, slotId } = await bookSlot();
      t.clock.set(minutesBeforeStart(61));

      const res = await http().post(`/manage/${token}/cancel`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'CANCELLED',
        alreadyCancelled: false,
        message: 'Your booking is cancelled.',
        canCancel: false,
        cancelledAt: minutesBeforeStart(61),
      });
      expect(await slotStatus(slotId)).toBe('AVAILABLE');

      const list = await http().get('/slots').query({ from: '2026-11-02', to: '2026-11-08' });
      expect(list.body.slots).toEqual([expect.objectContaining({ id: slotId, state: 'AVAILABLE' })]);
    });

    it('lets someone else book the freed slot', async () => {
      const { token, slotId } = await bookSlot();
      await http().post(`/manage/${token}/cancel`).expect(200);
      const res = await http().post('/bookings').send({ slotId, name: 'Grace Hopper', email: 'grace@example.com' });
      expect(res.status).toBe(201);
      expect(await t.prisma.booking.count({ where: { slotId } })).toBe(2);
    });

    it('tells the waitlist that the slot is available, once', async () => {
      const { token, slotId } = await bookSlot();
      await http().post(`/manage/${token}/cancel`).expect(200);
      await http().post(`/manage/${token}/cancel`).expect(200);
      expect(events).toEqual([{ slotId, startsAt: new Date(SLOT_START) }]);
    });

    it.each([
      ['exactly 60 minutes', 60],
      ['59 minutes', 59],
      ['after the start', -5],
    ])('rejects cancelling %s before the start with 422', async (_label, minutes) => {
      const { token, slotId } = await bookSlot();
      t.clock.set(minutesBeforeStart(minutes));

      const res = await http().post(`/manage/${token}/cancel`);
      expect(res.status).toBe(422);
      expect(res.body).toEqual({
        statusCode: 422,
        code: 'CANCELLATION_CUTOFF',
        message: 'Cancellation closes 1 hour before start',
      });
      expect((await t.prisma.booking.findFirstOrThrow()).status).toBe('CONFIRMED');
      expect(await slotStatus(slotId)).toBe('BOOKED');
      expect(events).toEqual([]);
    });

    it('is safe to cancel twice: the second call returns 200 and says so', async () => {
      const { token } = await bookSlot();
      const first = await http().post(`/manage/${token}/cancel`);
      const second = await http().post(`/manage/${token}/cancel`);
      expect(second.status).toBe(200);
      expect(second.body).toMatchObject({
        status: 'CANCELLED',
        alreadyCancelled: true,
        message: 'This booking was already cancelled.',
        cancelledAt: first.body.cancelledAt,
      });
    });

    it('still says "already cancelled" after the cutoff has passed', async () => {
      const { token } = await bookSlot();
      await http().post(`/manage/${token}/cancel`).expect(200);
      t.clock.set(minutesBeforeStart(10));
      const res = await http().post(`/manage/${token}/cancel`);
      expect(res.status).toBe(200);
      expect(res.body.alreadyCancelled).toBe(true);
    });

    it('handles simultaneous cancels: one cancels, the rest report it was already done', async () => {
      const { token, slotId } = await bookSlot();
      const results = await Promise.all(Array.from({ length: 10 }, () => http().post(`/manage/${token}/cancel`)));
      expect(results.map((r) => r.status)).toEqual(Array(10).fill(200));
      expect(results.filter((r) => r.body.alreadyCancelled === false)).toHaveLength(1);
      expect(await slotStatus(slotId)).toBe('AVAILABLE');
      expect(events).toHaveLength(1);
    });

    it('does not touch a slot that someone else has booked since', async () => {
      // The first booker cancels, a second books, then the first link is used again.
      const { token, slotId } = await bookSlot();
      await http().post(`/manage/${token}/cancel`).expect(200);
      await http().post('/bookings').send({ slotId, name: 'Grace Hopper', email: 'grace@example.com' }).expect(201);

      const again = await http().post(`/manage/${token}/cancel`);
      expect(again.body.alreadyCancelled).toBe(true);
      expect(await slotStatus(slotId)).toBe('BOOKED');
    });
  });
});
