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

  it('emails the waitlist on joining, and again with a booking link when a slot opens', async () => {
    // 3 Nov has one slot, and Ada has booked it, so the day is full.
    const slot = await newSlot();
    const booked = await http()
      .post('/bookings')
      .send({ slotId: slot.id, name: 'Ada Lovelace', email: 'ada@example.com' })
      .expect(201);

    // Grace joins the waitlist and gets her private status link by email.
    const joined = await http()
      .post('/waitlist')
      .send({ date: '2026-11-03', name: 'Grace Hopper', email: 'grace@example.com' })
      .expect(201);
    expect(joined.body.emailSent).toBe(true);
    const welcome = mailer.sent.find((m) => m.to === 'grace@example.com')!;
    expect(welcome.subject).toBe("You're on the waitlist for Tuesday 3 November");
    expect(welcome.text).toContain(`/waitlist/${joined.body.statusToken}`);
    await http().get(`/waitlist/${joined.body.statusToken}`).expect(200);

    // Ada cancels: Grace gets "A slot opened up!" with a link that books exactly that slot.
    mailer.sent.length = 0;
    await http().post(`/manage/${booked.body.manageToken}/cancel`).expect(200);
    expect(mailer.sent).toHaveLength(1);
    const [opened] = mailer.sent;
    expect(opened.to).toBe('grace@example.com');
    expect(opened.subject).toBe('A slot opened up! Office hours on Tue 3 Nov at 11:00');
    const slotId = /\/book\/([0-9a-f-]{36})/.exec(opened.text)?.[1];
    expect(slotId).toBe(slot.id);

    // Following the link, Grace books it.
    await http().post('/bookings').send({ slotId, name: 'Grace Hopper', email: 'grace@example.com' }).expect(201);
  });

  it('still adds to the waitlist when the email fails', async () => {
    const slot = await newSlot();
    await http().post('/bookings').send({ slotId: slot.id, name: 'Ada', email: 'ada@example.com' }).expect(201);
    const send = jest.spyOn(mailer, 'send').mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await http()
      .post('/waitlist')
      .send({ date: '2026-11-03', name: 'Grace Hopper', email: 'grace@example.com' })
      .expect(201);
    expect(res.body).toMatchObject({ status: 'WAITING', emailSent: false });
    send.mockRestore();
  });

  it('sends nothing when the slot is already taken', async () => {
    const slot = await newSlot();
    await http().post('/bookings').send({ slotId: slot.id, name: 'Ada', email: 'ada@example.com' }).expect(201);
    await http().post('/bookings').send({ slotId: slot.id, name: 'Bob', email: 'bob@example.com' }).expect(409);
    expect(mailer.sent.map((m) => m.to)).toEqual(['ada@example.com']);
  });
});
