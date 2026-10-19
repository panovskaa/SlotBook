import { WaitlistEntry, WaitlistStatus } from '@prisma/client';
import { ErrorCode } from '@slotbook/shared';
import { BookingsService } from '../bookings/bookings.service';
import { AppException } from '../common/app-exception';
import { Clock } from '../common/clock';
import { dateColumn } from '../common/time';
import { AppConfig } from '../config';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SlotsService } from '../slots/slots.service';
import { WaitlistListener } from './waitlist.listener';
import { WaitlistService } from './waitlist.service';

/** Just enough of Prisma's waitlist table, in memory, for booking from the waitlist. */
class InMemoryWaitlist {
  constructor(public rows: WaitlistEntry[]) {}

  async findFirst({ where }: { where: { date: Date; status: WaitlistStatus } }) {
    const hits = this.rows
      .filter((r) => r.date.getTime() === where.date.getTime() && r.status === where.status)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    return hits[0] ? { ...hits[0] } : null;
  }

  async updateMany({ where, data }: { where: { id: string; status: WaitlistStatus }; data: Partial<WaitlistEntry> }) {
    const row = this.rows.find((r) => r.id === where.id && r.status === where.status);
    if (row) Object.assign(row, data);
    return { count: row ? 1 : 0 };
  }

  async update({ where, data }: { where: { id: string }; data: Partial<WaitlistEntry> }) {
    const row = this.rows.find((r) => r.id === where.id)!;
    Object.assign(row, data);
    return { ...row };
  }
}

let id = 0;
const entry = (date: string, status: WaitlistStatus, name: string, joinedAt: string): WaitlistEntry => ({
  id: `w${++id}`,
  date: dateColumn(date),
  name,
  email: `${name.split(' ')[0].toLowerCase()}@example.com`,
  tokenHash: `hash${id}`,
  status,
  createdAt: new Date(joinedAt),
  notifiedAt: null,
  bookingId: null,
});

class FixedClock extends Clock {
  now() {
    return new Date('2026-11-02T08:00:00Z'); // 09:00 in Berlin
  }
}

function setup(rows: WaitlistEntry[], book?: jest.Mock) {
  const table = new InMemoryWaitlist(rows);
  const bookFromWaitlist = book ?? jest.fn(async () => ({ bookingId: 'booking-1' }));
  const service = new WaitlistService(
    { waitlistEntry: table } as unknown as PrismaService,
    new FixedClock(),
    {} as SlotsService,
    { bookFromWaitlist } as unknown as BookingsService,
    {} as MailService,
    { timezone: 'Europe/Berlin' } as AppConfig,
  );
  return { table, bookFromWaitlist, listener: new WaitlistListener(service) };
}

/** A 30-minute slot starting at `iso`. */
const opened = (iso: string) => ({
  slotId: 's1',
  startsAt: new Date(iso),
  endsAt: new Date(new Date(iso).getTime() + 30 * 60_000),
});

describe('WaitlistListener (in-memory)', () => {
  it('books the slot for whoever joined that day first, and leaves the rest waiting', async () => {
    const second = entry('2026-11-03', 'WAITING', 'Grace Hopper', '2026-11-01T10:05:00Z');
    const first = entry('2026-11-03', 'WAITING', 'Ada Lovelace', '2026-11-01T10:00:00Z');
    const otherDay = entry('2026-11-04', 'WAITING', 'Linus Torvalds', '2026-11-01T09:00:00Z');
    const { table, bookFromWaitlist, listener } = setup([second, first, otherDay]);

    // 23:30 UTC on 2 Nov is 00:30 on 3 Nov in Berlin: the date is the local one.
    await listener.handle(opened('2026-11-02T23:30:00Z'));

    expect(bookFromWaitlist).toHaveBeenCalledTimes(1);
    expect(bookFromWaitlist).toHaveBeenCalledWith({ slotId: 's1', name: 'Ada Lovelace', email: 'ada@example.com' });
    expect(table.rows.map((r) => [r.name, r.status, r.bookingId])).toEqual([
      ['Grace Hopper', 'WAITING', null],
      ['Ada Lovelace', 'BOOKED', 'booking-1'],
      ['Linus Torvalds', 'WAITING', null],
    ]);
    expect(first.notifiedAt).toEqual(new Date('2026-11-02T08:00:00Z'));
  });

  it('keeps the first person waiting when the slot is gone by the time it books', async () => {
    const ada = entry('2026-11-03', 'WAITING', 'Ada Lovelace', '2026-11-01T10:00:00Z');
    const taken = jest.fn(async () => {
      throw new AppException(409, ErrorCode.SLOT_ALREADY_BOOKED, 'Someone has just booked this slot');
    });
    const { listener } = setup([ada], taken);
    await listener.handle(opened('2026-11-03T09:00:00Z'));
    expect(ada).toMatchObject({ status: 'WAITING', notifiedAt: null, bookingId: null });
  });

  it('ignores slots on dates that have passed', async () => {
    const { table, bookFromWaitlist, listener } = setup([
      entry('2026-11-01', 'WAITING', 'Ada Lovelace', '2026-10-30T10:00:00Z'),
    ]);
    await listener.handle(opened('2026-11-01T09:00:00Z'));
    expect(table.rows[0].status).toBe('WAITING');
    expect(bookFromWaitlist).not.toHaveBeenCalled();
  });

  it('never throws, so a failure can’t undo a cancellation', async () => {
    const { table, listener } = setup([]);
    table.findFirst = async () => {
      throw new Error('database down');
    };
    await expect(listener.handle(opened('2026-11-03T09:00:00Z'))).resolves.toBeUndefined();
  });
});
