import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, WaitlistEntry } from '@prisma/client';
import {
  BOOKING_CUTOFF_MINUTES,
  ErrorCode,
  JoinWaitlistResponse,
  SlotDto,
  WaitlistStatusResponse,
} from '@slotbook/shared';
import { BookingsService } from '../bookings/bookings.service';
import { AppException } from '../common/app-exception';
import { Clock } from '../common/clock';
import { createSecretToken, hashToken, tokenMatches } from '../common/secret-token';
import { dateColumn, fromDateColumn, startOfNextZonedDay, startOfZonedDay, zonedDateOf } from '../common/time';
import { APP_CONFIG, AppConfig } from '../config';
import { SlotAvailableEvent } from '../events';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SlotsService } from '../slots/slots.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { joinedEmail } from './waitlist-emails';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly slots: SlotsService,
    private readonly bookings: BookingsService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** FR-9: join a date's waitlist. Only for dates with nothing left to book. */
  async join(dto: JoinWaitlistDto): Promise<JoinWaitlistResponse> {
    const now = this.clock.now();
    if (dto.date < zonedDateOf(now, this.config.timezone)) {
      throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'This date has passed', [
        { field: 'date', messages: ['This date has passed'] },
      ]);
    }
    if ((await this.bookableSlots(dto.date, now)).length > 0) {
      throw new AppException(
        422,
        ErrorCode.DATE_HAS_AVAILABILITY,
        'This date still has open slots, so you can book one now',
      );
    }

    const secret = createSecretToken();
    let entry: WaitlistEntry;
    try {
      entry = await this.prisma.waitlistEntry.create({
        data: { date: dateColumn(dto.date), name: dto.name, email: dto.email, tokenHash: secret.hash },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException(
          409,
          ErrorCode.ALREADY_ON_WAITLIST,
          'This email is already on the waitlist for this date',
        );
      }
      throw err;
    }

    // A slot may have freed up between the check above and the insert, after its waitlist run had
    // already looked. Running it again here means that opening still goes to whoever is first in line.
    const missed = (await this.bookableSlots(dto.date, this.clock.now())).at(0);
    if (missed) {
      await this.fillFromWaitlist({
        slotId: missed.id,
        startsAt: new Date(missed.startsAt),
        endsAt: new Date(missed.endsAt),
      });
      entry = await this.prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } });
    }

    // Sent after the entry is saved; a mail problem never undoes joining. Someone booked straight
    // away gets the booking confirmation instead.
    const emailSent =
      entry.status === 'WAITING' &&
      (await this.mail.send(joinedEmail(this.config, entry, dto.date, secret.token), {
        waitlistEntryId: entry.id,
      }));

    return {
      date: dto.date,
      status: entry.status,
      statusToken: secret.token,
      statusPath: `/waitlist/${secret.token}`,
      emailSent,
    };
  }

  /** GET /waitlist/:token. Entries for dates that have passed turn EXPIRED when next looked at. */
  async status(token: string): Promise<WaitlistStatusResponse> {
    let entry = TOKEN_PATTERN.test(token)
      ? await this.prisma.waitlistEntry.findUnique({ where: { tokenHash: hashToken(token) } })
      : null;
    if (!entry || !tokenMatches(token, entry.tokenHash)) {
      throw new AppException(404, ErrorCode.NOT_FOUND, 'This link does not match a waitlist entry');
    }

    const now = this.clock.now();
    const date = fromDateColumn(entry.date);
    // A booked entry keeps its status; it shows the booking even after the day.
    const open = entry.status === 'WAITING' || entry.status === 'NOTIFIED';
    if (date < zonedDateOf(now, this.config.timezone) && open) {
      entry = await this.prisma.waitlistEntry.update({ where: { id: entry.id }, data: { status: 'EXPIRED' } });
    }

    const booking = entry.bookingId
      ? await this.prisma.booking.findUnique({ where: { id: entry.bookingId }, include: { slot: true } })
      : null;

    return {
      timezone: this.config.timezone,
      date,
      name: entry.name,
      status: entry.status,
      createdAt: entry.createdAt.toISOString(),
      notifiedAt: entry.notifiedAt?.toISOString() ?? null,
      availableSlots:
        entry.status === 'WAITING' || entry.status === 'NOTIFIED' ? await this.bookableSlots(date, now) : [],
      booking: booking && {
        reference: booking.reference,
        status: booking.status,
        startsAt: booking.slot.startsAt.toISOString(),
        endsAt: booking.slot.endsAt.toISOString(),
      },
    };
  }

  /**
   * The slot.available listener's work (FR-9): the freed slot is booked for whoever joined that
   * day's waitlist first. They get the booking confirmation by email; everyone else keeps waiting,
   * in case another slot frees up. Returns the entry that got the slot, or null.
   */
  async fillFromWaitlist(event: SlotAvailableEvent): Promise<WaitlistEntry | null> {
    const now = this.clock.now();
    const date = zonedDateOf(event.startsAt, this.config.timezone);
    if (date < zonedDateOf(now, this.config.timezone)) return null;

    for (;;) {
      const first = await this.prisma.waitlistEntry.findFirst({
        where: { date: dateColumn(date), status: 'WAITING' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (!first) return null;

      // Claim the entry first, so two slots freeing up at once can't both go to the same person.
      const claimed = await this.prisma.waitlistEntry.updateMany({
        where: { id: first.id, status: 'WAITING' },
        data: { status: 'BOOKED', notifiedAt: now },
      });
      if (claimed.count === 0) continue; // Another opening took them; the next person is first now.

      try {
        const { bookingId } = await this.bookings.bookFromWaitlist({
          slotId: event.slotId,
          name: first.name,
          email: first.email,
        });
        return await this.prisma.waitlistEntry.update({ where: { id: first.id }, data: { bookingId } });
      } catch (err) {
        // The slot couldn't be booked (a visitor got it first, or booking for it has closed).
        // They stay first in line for the next opening.
        await this.prisma.waitlistEntry.update({
          where: { id: first.id },
          data: { status: 'WAITING', notifiedAt: null },
        });
        if (err instanceof AppException) {
          this.logger.log({ slotId: event.slotId, status: err.getStatus() }, 'Freed slot could not go to the waitlist');
          return null;
        }
        throw err;
      }
    }
  }

  /** Slots on a date (in the app's zone) that a visitor could book right now. */
  private async bookableSlots(date: string, now: Date): Promise<SlotDto[]> {
    const bookableAfter = new Date(now.getTime() + BOOKING_CUTOFF_MINUTES * 60_000);
    const dayStart = startOfZonedDay(date, this.config.timezone);
    const slots = await this.prisma.slot.findMany({
      where: {
        status: 'AVAILABLE',
        startsAt: { gte: dayStart, lt: startOfNextZonedDay(date, this.config.timezone), gt: bookableAfter },
      },
      orderBy: { startsAt: 'asc' },
    });
    return slots.map((s) => this.slots.toDto(s, now));
  }
}
