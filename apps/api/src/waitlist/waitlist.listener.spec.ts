import { WaitlistEntry, WaitlistStatus } from '@prisma/client';
import { Clock } from '../common/clock';
import { dateColumn } from '../common/time';
import { AppConfig } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { SlotsService } from '../slots/slots.service';
import { MailService } from '../mail/mail.service';
import { MailMessage } from '../mail/mailer';
import { WaitlistListener } from './waitlist.listener';
import { WaitlistService } from './waitlist.service';

/** Just enough of Prisma's waitlist table, in memory, for the listener's update. */
class InMemoryWaitlist {
  constructor(public rows: WaitlistEntry[]) {}

  async updateManyAndReturn({
    where,
    data,
  }: {
    where: { date: Date; status: WaitlistStatus };
    data: Partial<WaitlistEntry>;
  }): Promise<WaitlistEntry[]> {
    const hits = this.rows.filter((r) => r.date.getTime() === where.date.getTime() && r.status === where.status);
    for (const r of hits) Object.assign(r, data);
    return hits.map((r) => ({ ...r }));
  }
}

let id = 0;
const entry = (date: string, status: WaitlistStatus, name = 'Ada Lovelace'): WaitlistEntry => ({
  id: `w${++id}`,
  date: dateColumn(date),
  name,
  email: `person${id}@example.com`,
  tokenHash: `hash${id}`,
  status,
  createdAt: new Date('2026-11-01T10:00:00Z'),
  notifiedAt: null,
});

class FixedClock extends Clock {
  now() {
    return new Date('2026-11-02T08:00:00Z'); // 09:00 in Berlin
  }
}

function setup(rows: WaitlistEntry[]) {
  const table = new InMemoryWaitlist(rows);
  const sent: MailMessage[] = [];
  const mail = {
    send: async (m: MailMessage) => {
      sent.push(m);
      return true;
    },
  } as unknown as MailService;
  const prisma = { waitlistEntry: table } as unknown as PrismaService;
  const service = new WaitlistService(prisma, new FixedClock(), {} as SlotsService, mail, {
    timezone: 'Europe/Berlin',
    webOrigin: 'https://book.example.com',
  } as AppConfig);
  return { table, sent, listener: new WaitlistListener(service) };
}

/** A 30-minute slot starting at `iso`. */
const opened = (iso: string) => ({
  slotId: 's1',
  startsAt: new Date(iso),
  endsAt: new Date(new Date(iso).getTime() + 30 * 60_000),
});

describe('WaitlistListener (in-memory)', () => {
  it('notifies everyone waiting for that date, and nobody else', async () => {
    const waiting1 = entry('2026-11-03', 'WAITING', 'Ada Lovelace');
    const waiting2 = entry('2026-11-03', 'WAITING', 'Grace Hopper');
    const alreadyNotified = entry('2026-11-03', 'NOTIFIED');
    const otherDate = entry('2026-11-04', 'WAITING');
    const { table, sent, listener } = setup([waiting1, waiting2, alreadyNotified, otherDate]);

    // 23:30 UTC on 2 Nov is 00:30 on 3 Nov in Berlin: the date is the local one.
    await listener.handle(opened('2026-11-02T23:30:00Z'));

    expect(table.rows.map((r) => r.status)).toEqual(['NOTIFIED', 'NOTIFIED', 'NOTIFIED', 'WAITING']);
    expect(waiting1.notifiedAt).toEqual(new Date('2026-11-02T08:00:00Z'));
    expect(alreadyNotified.notifiedAt).toBeNull();
    expect(sent.map((e) => e.to)).toEqual([waiting1.email, waiting2.email]);
  });

  it('emails a link that books the opened slot, with the first name and time', async () => {
    const { sent, listener } = setup([entry('2026-11-03', 'WAITING', 'Grace Brewster Hopper')]);
    await listener.handle(opened('2026-11-03T09:00:00Z'));

    const [mail] = sent;
    expect(mail.subject).toBe('A slot opened up! Office hours on Tue 3 Nov at 10:00');
    expect(mail.text).toContain('Hi Grace,');
    expect(mail.text).toContain(
      'A slot opened up! Tuesday 3 November 2026, 10:00–10:30 (Europe/Berlin) is free again.',
    );
    expect(mail.text).toContain('https://book.example.com/book/s1');
    expect(mail.html).toContain('href="https://book.example.com/book/s1"');
    expect(mail.html).toContain('Book 10:00');
    expect(mail.text).not.toMatch(/hash|token/i);
  });

  it('ignores slots on dates that have passed', async () => {
    const { table, sent, listener } = setup([entry('2026-11-01', 'WAITING')]);
    await listener.handle(opened('2026-11-01T09:00:00Z'));
    expect(table.rows[0].status).toBe('WAITING');
    expect(sent).toEqual([]);
  });

  it('never throws, so a failed notification can’t undo a cancellation', async () => {
    const { table, listener } = setup([]);
    table.updateManyAndReturn = async () => {
      throw new Error('database down');
    };
    await expect(listener.handle(opened('2026-11-03T09:00:00Z'))).resolves.toBeUndefined();
  });
});
