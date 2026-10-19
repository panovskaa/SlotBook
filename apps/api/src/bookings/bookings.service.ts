import { Injectable, Logger } from '@nestjs/common';
import { Booking, Prisma, Slot } from '@prisma/client';
import {
  BOOKING_CUTOFF_MESSAGE,
  BookingLookupResponse,
  CreateBookingResponse,
  ErrorCode,
  isWithinBookingWindow,
  normalizeReference,
} from '@slotbook/shared';
import { AppException } from '../common/app-exception';
import { Clock } from '../common/clock';
import { createSecretToken } from '../common/secret-token';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmationMessageService } from './confirmation-message.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ReferenceGenerator } from './reference.generator';

/** A new reference that collides with an existing one is regenerated, up to this many tries (FR-6). */
export const MAX_REFERENCE_ATTEMPTS = 3;

/** Many visitors can race for one slot; each waits its turn for a connection rather than failing. */
const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 15_000 };

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly references: ReferenceGenerator,
    private readonly messages: ConfirmationMessageService,
  ) {}

  /** FR-3, FR-4: exactly one of any number of simultaneous requests for a slot succeeds. */
  async book(dto: CreateBookingDto): Promise<CreateBookingResponse> {
    for (let attempt = 1; ; attempt++) {
      const reference = this.references.next();
      const secret = createSecretToken();
      try {
        const { booking, slot } = await this.prisma.$transaction(
          (tx) => this.bookInTransaction(tx, dto, reference, secret.hash),
          TRANSACTION_OPTIONS,
        );
        const message = await this.saveMessage(booking, slot);
        return {
          reference: booking.reference,
          status: booking.status,
          slot: { startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() },
          manageToken: secret.token,
          managePath: `/manage/${secret.token}`,
          message,
        };
      } catch (err) {
        const target = uniqueViolationTarget(err);
        // The whole transaction rolled back, slot update included, so it's safe to start over.
        if ((target === 'reference' || target === 'token') && attempt < MAX_REFERENCE_ATTEMPTS) continue;
        if (target === 'slot') throw slotTaken();
        throw err;
      }
    }
  }

  private async bookInTransaction(
    tx: Prisma.TransactionClient,
    dto: CreateBookingDto,
    reference: string,
    cancelTokenHash: string,
  ): Promise<{ booking: Booking; slot: Slot }> {
    const slot = await tx.slot.findUnique({ where: { id: dto.slotId } });
    if (!slot || slot.status === 'DELETED') {
      throw new AppException(404, ErrorCode.NOT_FOUND, 'This slot does not exist');
    }
    if (slot.status === 'BOOKED') throw slotTaken();
    if (!isWithinBookingWindow(slot.startsAt, this.clock.now())) {
      throw new AppException(422, ErrorCode.BOOKING_CUTOFF, BOOKING_CUTOFF_MESSAGE);
    }

    // The guard: only the request whose UPDATE changes the row wins. Others wait on the row lock,
    // then see BOOKED and change nothing.
    const { count } = await tx.slot.updateMany({
      where: { id: slot.id, status: 'AVAILABLE' },
      data: { status: 'BOOKED' },
    });
    if (count === 0) throw slotTaken();

    const booking = await tx.booking.create({
      data: { slotId: slot.id, name: dto.name, email: dto.email, reference, cancelTokenHash },
    });
    return { booking, slot };
  }

  /** The booking is already committed; a failure here must never undo it (FR-11). */
  private async saveMessage(booking: Booking, slot: Slot): Promise<string> {
    let message: string;
    try {
      message = await this.messages.compose(booking.name, slot.startsAt);
    } catch (err) {
      this.logger.warn({ err }, 'Confirmation message failed; using the template');
      message = this.messages.template(booking.name, slot.startsAt);
    }
    try {
      await this.prisma.booking.update({ where: { id: booking.id }, data: { aiMessage: message } });
    } catch (err) {
      this.logger.warn({ err, bookingId: booking.id }, 'Could not save the confirmation message');
    }
    return message;
  }

  /** FR-6: public lookup, so only the slot time and status — never the name or email. */
  async findByReference(code: string): Promise<BookingLookupResponse> {
    const reference = normalizeReference(code);
    const booking = reference
      ? await this.prisma.booking.findUnique({ where: { reference }, include: { slot: true } })
      : null;
    if (!booking) throw new AppException(404, ErrorCode.NOT_FOUND, 'No booking has this reference');
    return {
      reference: booking.reference,
      status: booking.status,
      slot: { startsAt: booking.slot.startsAt.toISOString(), endsAt: booking.slot.endsAt.toISOString() },
    };
  }
}

function slotTaken(): AppException {
  return new AppException(409, ErrorCode.SLOT_ALREADY_BOOKED, 'Someone has just booked this slot');
}

/** Which unique rule a Prisma P2002 broke, or null if the error is something else. */
export function uniqueViolationTarget(err: unknown): 'reference' | 'token' | 'slot' | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return null;
  const raw = err.meta?.target;
  const target = (Array.isArray(raw) ? raw.join(',') : typeof raw === 'string' ? raw : '').toLowerCase();
  if (target.includes('reference')) return 'reference';
  if (target.includes('cancel_token_hash') || target.includes('canceltokenhash')) return 'token';
  // Anything else is the one-confirmed-booking-per-slot index.
  return 'slot';
}
