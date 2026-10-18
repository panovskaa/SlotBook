import request from 'supertest';
import { HOST_KEY, TestApp, createTestApp, resetDatabase } from './helpers';

const NOW = '2026-11-02T08:00:00.000Z';

describe('Insights (FR-10)', () => {
  let t: TestApp;
  let n = 0;

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

  const insights = () => request(t.app.getHttpServer()).get('/host/insights').set('X-Host-Key', HOST_KEY);

  async function slot(startsAt: string, status: 'AVAILABLE' | 'BOOKED' | 'DELETED' = 'AVAILABLE') {
    return t.prisma.slot.create({
      data: { startsAt: new Date(startsAt), endsAt: new Date(Date.parse(startsAt) + 30 * 60_000), status },
    });
  }
  async function booking(slotId: string, status: 'CONFIRMED' | 'CANCELLED' = 'CONFIRMED') {
    n++;
    await t.prisma.booking.create({
      data: { slotId, name: 'X', email: `x${n}@example.com`, reference: `INS-${n}`, cancelTokenHash: `ins-${n}`, status },
    });
  }
  const booked = async (startsAt: string) => booking((await slot(startsAt, 'BOOKED')).id);

  it('needs the host key', async () => {
    const res = await request(t.app.getHttpServer()).get('/host/insights');
    expect(res.status).toBe(401);
  });

  it('returns empty insights, with no rate rather than 0 %, when nothing exists', async () => {
    const res = await insights();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      timezone: 'Europe/Berlin',
      totalBookings: 0,
      hourRange: null,
      heatmap: [],
      topSlots: [],
      weekdayRates: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, booked: 0, published: 0, rate: null })),
    });
  });

  it('groups bookings by local weekday and hour, across midnight and clock changes', async () => {
    // Berlin is UTC+1 in November and UTC+2 in July.
    await booked('2026-11-02T09:00:00Z'); // Mon 10:00
    await booked('2026-11-09T09:00:00Z'); // Mon 10:00
    await booked('2026-07-06T08:00:00Z'); // Mon 10:00 (summer time)
    await booked('2026-11-03T09:00:00Z'); // Tue 10:00
    await slot('2026-11-03T13:00:00Z'); // Tue 14:00, free
    await booked('2026-11-04T23:30:00Z'); // Wed 23:30 UTC = Thu 00:30 local
    await booked('2026-11-05T22:30:00Z'); // Thu 22:30 UTC = Thu 23:30 local
    await slot('2026-11-04T09:00:00Z', 'DELETED'); // Wed, deleted: never counts
    const sunday = await slot('2026-11-08T09:00:00Z'); // Sun 10:00, booked then cancelled
    await booking(sunday.id, 'CANCELLED');

    const res = await insights();
    expect(res.body.totalBookings).toBe(6);
    expect(res.body.hourRange).toEqual({ from: 0, to: 23 });
    expect(res.body.heatmap).toEqual([
      { weekday: 1, hour: 10, bookings: 3 },
      { weekday: 2, hour: 10, bookings: 1 },
      { weekday: 4, hour: 0, bookings: 1 },
      { weekday: 4, hour: 23, bookings: 1 },
    ]);
  });

  it('ranks the three most-booked weekday and start-time pairs, breaking ties by day then time', async () => {
    await booked('2026-11-02T09:00:00Z'); // Mon 10:00
    await booked('2026-11-09T09:00:00Z'); // Mon 10:00
    await booked('2026-11-16T09:00:00Z'); // Mon 10:00
    await booked('2026-11-06T13:30:00Z'); // Fri 14:30
    await booked('2026-11-13T13:30:00Z'); // Fri 14:30
    await booked('2026-11-04T23:30:00Z'); // Thu 00:30
    await booked('2026-11-03T09:00:00Z'); // Tue 10:00
    await booked('2026-11-03T09:30:00Z'); // Tue 10:30: same hour as above, different start time

    const res = await insights();
    expect(res.body.topSlots).toEqual([
      { weekday: 1, time: '10:00', bookings: 3 },
      { weekday: 5, time: '14:30', bookings: 2 },
      { weekday: 2, time: '10:00', bookings: 1 },
    ]);
    // The heatmap groups by hour, so Tuesday's 10:00 and 10:30 share a cell.
    expect(res.body.heatmap).toContainEqual({ weekday: 2, hour: 10, bookings: 2 });
  });

  it('works out the booking rate per local weekday', async () => {
    await booked('2026-11-02T09:00:00Z'); // Mon, booked
    await slot('2026-11-09T09:00:00Z'); // Mon, free
    await booked('2026-11-04T23:30:00Z'); // Thu 00:30 local, booked
    await slot('2026-11-04T09:00:00Z', 'DELETED'); // Wed, deleted
    const sunday = await slot('2026-11-08T09:00:00Z'); // Sun, cancelled booking
    await booking(sunday.id, 'CANCELLED');

    const rates = (await insights()).body.weekdayRates;
    expect(rates).toEqual([
      { weekday: 1, booked: 1, published: 2, rate: 0.5 },
      { weekday: 2, booked: 0, published: 0, rate: null },
      { weekday: 3, booked: 0, published: 0, rate: null },
      { weekday: 4, booked: 1, published: 1, rate: 1 },
      { weekday: 5, booked: 0, published: 0, rate: null },
      { weekday: 6, booked: 0, published: 0, rate: null },
      { weekday: 7, booked: 0, published: 1, rate: 0 },
    ]);
  });
});
