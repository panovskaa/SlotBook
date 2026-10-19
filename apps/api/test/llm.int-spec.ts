import request from 'supertest';
import { LlmClient } from '../src/llm/llm-client';
import { TestApp, createTestApp, resetDatabase } from './helpers';

const NOW = '2026-11-02T08:00:00.000Z';
const TEMPLATE = "Thanks, Ada. You're booked for Tuesday 3 November at 11:00. See you then.";

/** FR-11 acceptance: whatever the LLM does, the booking succeeds and gets a message under 300 characters. */
describe('AI confirmation message (FR-11)', () => {
  let t: TestApp;
  let behaviour: LlmClient['generate'];
  const llm: LlmClient = { generate: (req) => behaviour(req) };

  beforeAll(async () => {
    t = await createTestApp(NOW, { llm });
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  async function book() {
    const slot = await t.prisma.slot.create({
      data: { startsAt: new Date('2026-11-03T10:00:00Z'), endsAt: new Date('2026-11-03T10:30:00Z') },
    });
    const res = await request(t.app.getHttpServer())
      .post('/bookings')
      .send({ slotId: slot.id, name: 'Ada Lovelace', email: 'ada@example.com' });
    const row = await t.prisma.booking.findFirst();
    return { res, row };
  }

  it('saves and returns the LLM message when it answers', async () => {
    behaviour = async () => 'Wonderful, Ada! Tuesday 3 November at 11:00 is yours.';
    const { res, row } = await book();
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Wonderful, Ada! Tuesday 3 November at 11:00 is yours.');
    expect(row?.aiMessage).toBe(res.body.message);
  });

  it('books with the template when the LLM fails', async () => {
    behaviour = async () => {
      throw new Error('503 Service Unavailable');
    };
    const { res, row } = await book();
    expect(res.status).toBe(201);
    expect(res.body.message).toBe(TEMPLATE);
    expect(row?.aiMessage).toBe(TEMPLATE);
  });

  it('books with the template when the LLM takes longer than 3 seconds', async () => {
    behaviour = ({ signal }) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve('Too late.'), 10_000);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        });
      });
    const started = Date.now();
    const { res } = await book();
    const took = Date.now() - started;
    expect(res.status).toBe(201);
    expect(res.body.message).toBe(TEMPLATE);
    expect(took).toBeGreaterThanOrEqual(2_900);
    expect(took).toBeLessThan(6_000);
  }, 15_000);

  it('never stores more than 300 characters', async () => {
    behaviour = async () => 'So glad you booked. '.repeat(40);
    const { res, row } = await book();
    expect(res.status).toBe(201);
    expect(row?.aiMessage?.length).toBeLessThanOrEqual(300);
  });
});
