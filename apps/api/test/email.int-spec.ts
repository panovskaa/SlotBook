import request from 'supertest';
import { FakeMailer, TestApp, createTestApp, resetDatabase } from './helpers';

// 2 Nov 2026, 09:00 in Berlin (UTC+1).
const NOW = '2026-11-02T08:00:00.000Z';

describe('Confirmation email with the cancellation link (FR-7)', () => {
  let t: TestApp;
  const mailer = new FakeMailer();

  beforeAll(async () => {
    t = await createTestApp(NOW, { mailer });
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    mailer.sent.length = 0;
    await resetDatabase(t.prisma);
  });

  const http = () => request(t.app.getHttpServer());
  const newSlot = () =>
    t.prisma.slot.create({
      data: { startsAt: new Date('2026-11-03T10:00:00Z'), endsAt: new Date('2026-11-03T10:30:00Z') },
    });

  it('emails the booker a link that really cancels the booking', async () => {
    const slot = await newSlot();
    const res = await http()
      .post('/bookings')
      .send({ slotId: slot.id, name: 'Ada Lovelace', email: 'Ada@Example.com' })
      .expect(201);

    expect(res.body.emailSent).toBe(true);
    expect(mailer.sent).toHaveLength(1);
    const [mail] = mailer.sent;
    expect(mail.to).toBe('ada@example.com');
    expect(mail.text).toContain(res.body.reference);

    const token = /\/manage\/([A-Za-z0-9_-]{43})/.exec(mail.text)?.[1];
    expect(token).toBe(res.body.manageToken);

    await http().post(`/manage/${token}/cancel`).expect(200);
    const booking = await t.prisma.booking.findFirstOrThrow({ where: { slotId: slot.id } });
    expect(booking.status).toBe('CANCELLED');
  });

  it('still books when the email fails, and says so', async () => {
    const send = jest.spyOn(mailer, 'send').mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const slot = await newSlot();
    const res = await http()
      .post('/bookings')
      .send({ slotId: slot.id, name: 'Ada Lovelace', email: 'ada@example.com' })
      .expect(201);

    expect(res.body.emailSent).toBe(false);
    expect(res.body.manageToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await t.prisma.slot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe('BOOKED');
    send.mockRestore();
  });

  it('sends nothing when the slot is already taken', async () => {
    const slot = await newSlot();
    await http().post('/bookings').send({ slotId: slot.id, name: 'Ada', email: 'ada@example.com' }).expect(201);
    await http().post('/bookings').send({ slotId: slot.id, name: 'Bob', email: 'bob@example.com' }).expect(409);
    expect(mailer.sent.map((m) => m.to)).toEqual(['ada@example.com']);
  });
});
