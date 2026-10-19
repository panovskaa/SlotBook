import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, Slot } from '@prisma/client';
import {
  ErrorCode,
  SlotDto,
  SlotResponse,
  SlotState,
  SlotsResponse,
  hasStarted,
  isWithinBookingWindow,
} from '@slotbook/shared';
import { AppException } from '../common/app-exception';
import { Clock } from '../common/clock';
import { dateColumn, fromDateColumn, startOfNextZonedDay, startOfZonedDay, zonedToUtc } from '../common/time';
import { APP_CONFIG, AppConfig } from '../config';
import { SLOT_AVAILABLE, SlotAvailableEvent } from '../events';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { ListSlotsQuery } from './dto/list-slots.query';

/** Longest range a single GET /slots may ask for, to keep the query cheap. */
const MAX_RANGE_DAYS = 62;

/** Name of the exclusion constraint added in the constraints migration. */
export const SLOT_OVERLAP_CONSTRAINT = 'slot_no_overlap';

@Injectable()
export class SlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly events: EventEmitter2,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** FR-1: the database's exclusion constraint is the authority on overlaps, so a race can't slip through. */
  async create(dto: CreateSlotDto): Promise<SlotDto> {
    const startsAt = zonedToUtc(dto.date, dto.startTime, this.config.timezone);
    if (!startsAt) {
      throw new AppException(
        400,
        ErrorCode.VALIDATION_ERROR,
        'That time does not exist on that date because the clocks change',
        [{ field: 'startTime', messages: ['This time is skipped when the clocks change'] }],
      );
    }
    const now = this.clock.now();
    if (hasStarted(startsAt, now)) {
      throw new AppException(400, ErrorCode.SLOT_IN_PAST, 'A slot cannot start in the past');
    }
    const endsAt = new Date(startsAt.getTime() + dto.durationMinutes * 60_000);

    let slot: Slot;
    try {
      slot = await this.prisma.slot.create({ data: { startsAt, endsAt } });
    } catch (err) {
      if (isOverlapViolation(err)) {
        throw new AppException(409, ErrorCode.SLOT_OVERLAP, 'This slot overlaps one you have already published');
      }
      throw err;
    }
    const created = this.toDto(slot, now);
    // FR-9: a new slot is an opening for anyone waiting on that date.
    if (created.state === 'AVAILABLE') {
      // Awaited, so the waitlist is up to date by the time the host gets the response.
      await this.events.emitAsync(SLOT_AVAILABLE, {
        slotId: slot.id,
        startsAt: slot.startsAt,
      } satisfies SlotAvailableEvent);
    }
    return created;
  }

  /**
   * FR-8: the host can delete a slot nobody has booked. It's a soft delete (status DELETED), guarded
   * like booking: if a visitor books at the same moment, exactly one of the two wins.
   */
  async remove(id: string): Promise<void> {
    const now = this.clock.now();
    const slot = await this.prisma.slot.findUnique({ where: { id } });
    if (!slot || slot.status === 'DELETED') {
      throw new AppException(404, ErrorCode.NOT_FOUND, 'This slot does not exist');
    }
    if (hasStarted(slot.startsAt, now)) {
      throw new AppException(400, ErrorCode.SLOT_IN_PAST, 'A slot that has already started cannot be deleted');
    }
    const { count } = await this.prisma.slot.updateMany({
      where: { id, status: 'AVAILABLE' },
      data: { status: 'DELETED' },
    });
    if (count === 0) {
      throw new AppException(409, ErrorCode.SLOT_ALREADY_BOOKED, 'This slot is booked, so it cannot be deleted');
    }
  }

  /** FR-2, FR-5: visitors never see slots that have started or were deleted. */
  async list(query: ListSlotsQuery): Promise<SlotsResponse> {
    const { timezone } = this.config;
    const from = startOfZonedDay(query.from, timezone);
    const to = startOfNextZonedDay(query.to, timezone);
    if (to <= from) {
      throw new AppException(400, ErrorCode.VALIDATION_ERROR, '"to" must be on or after "from"');
    }
    if (to.getTime() - from.getTime() > (MAX_RANGE_DAYS + 1) * 86_400_000) {
      throw new AppException(400, ErrorCode.VALIDATION_ERROR, `A range can cover at most ${MAX_RANGE_DAYS} days`);
    }

    const now = this.clock.now();
    const slots = await this.prisma.slot.findMany({
      // Inclusive of the range start (a midnight slot counts), but only slots that haven't started.
      where: { status: { not: 'DELETED' }, startsAt: { gte: from, gt: now, lt: to } },
      orderBy: { startsAt: 'asc' },
    });
    const dtos = slots.map((s) => this.toDto(s, now));

    // FR-9: dates where the waitlist was told a slot opened up, while one is still free to book.
    const notified = await this.prisma.waitlistEntry.findMany({
      where: { status: 'NOTIFIED', date: { gte: dateColumn(query.from), lte: dateColumn(query.to) } },
      distinct: ['date'],
      select: { date: true },
    });
    // NFR-6: each notified date becomes one UTC range, and slots are compared as plain instants.
    // Turning every slot into a zoned date with Luxon took most of the request time for a full week.
    const available = slots.filter((_, i) => dtos[i].state === 'AVAILABLE');
    const openedUp = notified
      .map((n) => fromDateColumn(n.date))
      .filter((date) => {
        const dayStart = startOfZonedDay(date, timezone);
        const dayEnd = startOfNextZonedDay(date, timezone);
        return available.some((s) => s.startsAt >= dayStart && s.startsAt < dayEnd);
      });

    return { timezone, slots: dtos, openedUp };
  }

  /** One slot, for the booking page. Deleted slots and slots that have started don't exist for visitors. */
  async findOne(id: string): Promise<SlotResponse> {
    const now = this.clock.now();
    const slot = await this.prisma.slot.findUnique({ where: { id } });
    if (!slot || slot.status === 'DELETED' || hasStarted(slot.startsAt, now)) {
      throw new AppException(404, ErrorCode.NOT_FOUND, 'This slot does not exist');
    }
    return { timezone: this.config.timezone, slot: this.toDto(slot, now) };
  }

  toDto(slot: Slot, now: Date): SlotDto {
    return {
      id: slot.id,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      durationMinutes: Math.round((slot.endsAt.getTime() - slot.startsAt.getTime()) / 60_000),
      state: stateOf(slot, now),
    };
  }
}

export function stateOf(slot: Pick<Slot, 'status' | 'startsAt'>, now: Date): SlotState {
  if (slot.status === 'BOOKED') return 'BOOKED';
  return isWithinBookingWindow(slot.startsAt, now) ? 'AVAILABLE' : 'UNAVAILABLE';
}

/** Postgres reports exclusion violations as SQLSTATE 23P01; Prisma passes it through in the message. */
function isOverlapViolation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError || err instanceof Prisma.PrismaClientUnknownRequestError) {
    return err.message.includes(SLOT_OVERLAP_CONSTRAINT) || err.message.includes('23P01');
  }
  return false;
}
