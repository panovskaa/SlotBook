import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Booking, Slot } from '@prisma/client';
import {
  CANCELLATION_CUTOFF_MESSAGE,
  CancelBookingResponse,
  ErrorCode,
  ManageBookingResponse,
  isWithinBookingWindow,
  isWithinCancellationWindow,
} from '@slotbook/shared';
import { AppException } from '../common/app-exception';
import { Clock } from '../common/clock';
import { hashToken, tokenMatches } from '../common/secret-token';
import { APP_CONFIG, AppConfig } from '../config';
import { SLOT_AVAILABLE, SlotAvailableEvent } from '../events';
import { PrismaService } from '../prisma/prisma.service';

/** 32 random bytes as base64url is always 43 characters from this alphabet. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type BookingWithSlot = Booking & { slot: Slot };

@Injectable()
export class ManageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly events: EventEmitter2,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** GET /manage/:token */
  async view(token: string): Promise<ManageBookingResponse> {
    return this.toResponse(await this.findByToken(token));
  }

  /**
   * FR-7: cancel up to 60 minutes before the start. Cancelling frees the slot (if it's still
   * outside the 30-minute booking cutoff) and tells the waitlist. A second cancel is a no-op.
   */
  async cancel(token: string): Promise<CancelBookingResponse> {
    const booking = await this.findByToken(token);
    if (booking.status === 'CANCELLED') return this.alreadyCancelled(booking);

    const now = this.clock.now();
    if (!isWithinCancellationWindow(booking.slot.startsAt, now)) {
      throw new AppException(422, ErrorCode.CANCELLATION_CUTOFF, CANCELLATION_CUTOFF_MESSAGE);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Guarded like booking: if two cancels race, only one changes the row.
      const { count } = await tx.booking.updateMany({
        where: { id: booking.id, status: 'CONFIRMED' },
        data: { status: 'CANCELLED', cancelledAt: now },
      });
      if (count === 0) return { cancelled: false, freed: false };

      let freed = false;
      if (isWithinBookingWindow(booking.slot.startsAt, now)) {
        const slot = await tx.slot.updateMany({
          where: { id: booking.slotId, status: 'BOOKED' },
          data: { status: 'AVAILABLE' },
        });
        freed = slot.count === 1;
      }
      return { cancelled: true, freed };
    });

    const updated = await this.prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { slot: true } });
    if (!result.cancelled) return this.alreadyCancelled(updated);

    if (result.freed) {
      const event: SlotAvailableEvent = { slotId: booking.slotId, startsAt: booking.slot.startsAt };
      // FR-7 → FR-9: awaited, so the waitlist check has run before the cancel response is sent.
      await this.events.emitAsync(SLOT_AVAILABLE, event);
    }
    return { ...this.toResponse(updated), alreadyCancelled: false, message: 'Your booking is cancelled.' };
  }

  /** Every way a token can fail gives the same 404, so responses reveal nothing about which bookings exist. */
  private async findByToken(token: string): Promise<BookingWithSlot> {
    const booking = TOKEN_PATTERN.test(token)
      ? await this.prisma.booking.findUnique({ where: { cancelTokenHash: hashToken(token) }, include: { slot: true } })
      : null;
    // The lookup is by hash; the constant-time check guards against anything but an exact match.
    if (!booking || !tokenMatches(token, booking.cancelTokenHash)) {
      throw new AppException(404, ErrorCode.NOT_FOUND, 'This link does not match a booking');
    }
    return booking;
  }

  private alreadyCancelled(booking: BookingWithSlot): CancelBookingResponse {
    return { ...this.toResponse(booking), alreadyCancelled: true, message: 'This booking was already cancelled.' };
  }

  private toResponse(booking: BookingWithSlot): ManageBookingResponse {
    return {
      timezone: this.config.timezone,
      reference: booking.reference,
      status: booking.status,
      name: booking.name,
      email: booking.email,
      slot: { startsAt: booking.slot.startsAt.toISOString(), endsAt: booking.slot.endsAt.toISOString() },
      canCancel: booking.status === 'CONFIRMED' && isWithinCancellationWindow(booking.slot.startsAt, this.clock.now()),
      cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    };
  }
}
