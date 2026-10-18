import { Prisma } from '@prisma/client';
import { Clock } from '../common/clock';
import { AppConfig } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService, uniqueViolationTarget } from './bookings.service';
import { ConfirmationMessageService } from './confirmation-message.service';
import { ReferenceGenerator } from './reference.generator';

const SLOT_ID = '3f1c2a9e-5b6d-4c7e-8f90-1a2b3c4d5e6f';
const STARTS_AT = new Date('2026-11-03T10:00:00Z');
const DTO = { slotId: SLOT_ID, name: 'Ada Lovelace', email: 'ada@example.com' };

const uniqueError = (target: string | string[]) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });

class FixedClock extends Clock {
  constructor(public current: Date) {
    super();
  }
  now() {
    return this.current;
  }
}

/** A Prisma stand-in: each $transaction runs the callback against an in-memory slot. */
function setup(options: { minutesBefore?: number; createErrors?: unknown[]; references?: string[] } = {}) {
  const slot = { id: SLOT_ID, startsAt: STARTS_AT, endsAt: new Date('2026-11-03T10:30:00Z'), status: 'AVAILABLE' };
  const createErrors = [...(options.createErrors ?? [])];
  const created: { reference: string }[] = [];

  const tx = {
    slot: {
      findUnique: jest.fn(async () => ({ ...slot })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    booking: {
      create: jest.fn(async ({ data }: { data: Record<string, string> }) => {
        const err = createErrors.shift();
        if (err) throw err;
        created.push({ reference: data.reference });
        return { id: 'b1', status: 'CONFIRMED', ...data };
      }),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    booking: { update: jest.fn(async () => ({})) },
  } as unknown as PrismaService;

  const refs = [...(options.references ?? ['AAAA-AAAA', 'BBBB-BBBB', 'CCCC-CCCC', 'DDDD-DDDD'])];
  const generator = { next: jest.fn(() => refs.shift()!) } as unknown as ReferenceGenerator;
  const clock = new FixedClock(new Date(STARTS_AT.getTime() - (options.minutesBefore ?? 120) * 60_000));
  const messages = new ConfirmationMessageService({ timezone: 'Europe/Berlin' } as AppConfig);
  const service = new BookingsService(prisma, clock, generator, messages);
  return { service, tx, prisma, created, generator };
}

describe('BookingsService', () => {
  describe('booking cutoff (injected clock)', () => {
    it('allows booking 31 minutes before the start', async () => {
      const { service } = setup({ minutesBefore: 31 });
      await expect(service.book(DTO)).resolves.toMatchObject({ reference: 'AAAA-AAAA', status: 'CONFIRMED' });
    });

    it.each([30, 29, 0, -10])('rejects booking %p minutes before the start with 422', async (minutesBefore) => {
      const { service, tx } = setup({ minutesBefore });
      await expect(service.book(DTO)).rejects.toMatchObject({
        response: { statusCode: 422, code: 'BOOKING_CUTOFF', message: 'Booking closes 30 minutes before start' },
      });
      expect(tx.slot.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('reference collisions (FR-6)', () => {
    it('generates a new reference and starts the transaction over', async () => {
      const { service, created, prisma } = setup({ createErrors: [uniqueError(['reference'])] });
      const result = await service.book(DTO);
      expect(result.reference).toBe('BBBB-BBBB');
      expect(created).toEqual([{ reference: 'BBBB-BBBB' }]);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('also retries a cancellation token collision', async () => {
      const { service } = setup({ createErrors: [uniqueError(['cancel_token_hash'])] });
      await expect(service.book(DTO)).resolves.toMatchObject({ reference: 'BBBB-BBBB' });
    });

    it('gives up after 3 tries', async () => {
      const collision = uniqueError(['reference']);
      const { service, prisma } = setup({ createErrors: [collision, collision, collision] });
      await expect(service.book(DTO)).rejects.toBe(collision);
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it('turns a hit on the one-booking-per-slot index into 409, without retrying', async () => {
      const { service, prisma } = setup({ createErrors: [uniqueError('booking_one_confirmed_per_slot')] });
      await expect(service.book(DTO)).rejects.toMatchObject({ response: { statusCode: 409, code: 'SLOT_ALREADY_BOOKED' } });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  it('returns 409 when the guarded UPDATE changes no row', async () => {
    const { service, tx } = setup();
    tx.slot.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.book(DTO)).rejects.toMatchObject({ response: { statusCode: 409, code: 'SLOT_ALREADY_BOOKED' } });
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('still returns the booking when saving the message fails', async () => {
    const { service, prisma } = setup();
    (prisma.booking.update as jest.Mock).mockRejectedValueOnce(new Error('db hiccup'));
    await expect(service.book(DTO)).resolves.toMatchObject({ reference: 'AAAA-AAAA', message: expect.any(String) });
  });

  it.each([
    [['reference'], 'reference'],
    [['cancel_token_hash'], 'token'],
    [['slot_id'], 'slot'],
    ['booking_one_confirmed_per_slot', 'slot'],
  ])('reads a P2002 on %p as %p', (target, expected) => {
    expect(uniqueViolationTarget(uniqueError(target))).toBe(expected);
  });

  it('ignores errors that are not unique violations', () => {
    expect(uniqueViolationTarget(new Error('x'))).toBeNull();
  });
});

describe('ConfirmationMessageService template', () => {
  const messages = new ConfirmationMessageService({ timezone: 'Europe/Berlin' } as AppConfig);

  it('uses only the first name and the local date and time', () => {
    expect(messages.template('  Ada  Lovelace ', STARTS_AT)).toBe(
      "Thanks, Ada. You're booked for Tuesday 3 November at 11:00. See you then.",
    );
  });

  it('never exceeds 300 characters', () => {
    expect(messages.template('A'.repeat(500), STARTS_AT).length).toBeLessThanOrEqual(300);
  });
});
