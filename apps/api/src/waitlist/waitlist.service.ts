import { Inject, Injectable } from '@nestjs/common';
import { Prisma, WaitlistEntry } from '@prisma/client';
import {
  BOOKING_CUTOFF_MINUTES,
  ErrorCode,
  JoinWaitlistResponse,
  SlotDto,
  WaitlistStatusResponse,
} from '@slotbook/shared';
import { DateTime } from 'luxon';
import { AppException } from '../common/app-exception';
import { Clock } from '../common/clock';
import { createSecretToken, hashToken, tokenMatches } from '../common/secret-token';
import { dateColumn, fromDateColumn, startOfNextZonedDay, startOfZonedDay, zonedDateOf } from '../common/time';
import { APP_CONFIG, AppConfig } from '../config';
import { SlotAvailableEvent } from '../events';
import { PrismaService } from '../prisma/prisma.service';
import { SlotsService } from '../slots/slots.service';
import { DevMailer } from './dev-mailer';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class WaitlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly slots: SlotsService,
    private readonly mailer: DevMailer,
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

    // A slot may have opened between the check above and the insert, after its notification ran.
    // Checking again means a new entry can never miss that opening.
    if ((await this.bookableSlots(dto.date, this.clock.now())).length > 0) {
      entry = await this.prisma.waitlistEntry.update({
        where: { id: entry.id },
        data: { status: 'NOTIFIED', notifiedAt: this.clock.now() },
      });
    }

    return {
      date: dto.date,
      status: entry.status,
      statusToken: secret.token,
      statusPath: `/waitlist/${secret.token}`,
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
    if (date < zonedDateOf(now, this.config.timezone) && entry.status !== 'EXPIRED') {
      entry = await this.prisma.waitlistEntry.update({ where: { id: entry.id }, data: { status: 'EXPIRED' } });
    }

    return {
      timezone: this.config.timezone,
      date,
      name: entry.name,
      status: entry.status,
      createdAt: entry.createdAt.toISOString(),
      notifiedAt: entry.notifiedAt?.toISOString() ?? null,
      availableSlots: entry.status === 'EXPIRED' ? [] : await this.bookableSlots(date, now),
    };
  }

  /**
   * The slot.available listener's work: everyone waiting for that date is marked NOTIFIED, and
   * gets an "email" (written to the log, A4). Returns how many entries were notified.
   */
  async notifySlotAvailable(event: SlotAvailableEvent): Promise<number> {
    const now = this.clock.now();
    const date = zonedDateOf(event.startsAt, this.config.timezone);
    if (date < zonedDateOf(now, this.config.timezone)) return 0;

    const notified = await this.prisma.waitlistEntry.updateManyAndReturn({
      where: { date: dateColumn(date), status: 'WAITING' },
      data: { status: 'NOTIFIED', notifiedAt: now },
    });

    const when = DateTime.fromISO(date, { locale: 'en-GB' }).toFormat('cccc d LLLL');
    for (const entry of notified) {
      await this.mailer.send({
        to: entry.email,
        subject: `A slot opened up on ${when}`,
        text: `Hi ${entry.name.split(/\s+/)[0]}, a slot has opened up on ${when}. Open your waitlist link to book it before someone else does.`,
      });
    }
    return notified.length;
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
