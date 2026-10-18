import { Inject, Injectable } from '@nestjs/common';
import { Prisma, Slot } from '@prisma/client';
import { ErrorCode, SlotDto, SlotState, SlotsResponse, hasStarted, isWithinBookingWindow } from '@slotbook/shared';
import { AppException } from '../common/app-exception';
import { Clock } from '../common/clock';
import { startOfNextZonedDay, startOfZonedDay, zonedToUtc } from '../common/time';
import { APP_CONFIG, AppConfig } from '../config';
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
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** FR-1: the database's exclusion constraint is the authority on overlaps, so a race can't slip through. */
  async create(dto: CreateSlotDto): Promise<SlotDto> {
    const startsAt = zonedToUtc(dto.date, dto.startTime, this.config.timezone);
    if (!startsAt) {
      throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'That time does not exist on that date because the clocks change', [
        { field: 'startTime', messages: ['This time is skipped when the clocks change'] },
      ]);
    }
    const now = this.clock.now();
    if (hasStarted(startsAt, now)) {
      throw new AppException(400, ErrorCode.SLOT_IN_PAST, 'A slot cannot start in the past');
    }
    const endsAt = new Date(startsAt.getTime() + dto.durationMinutes * 60_000);

    try {
      const slot = await this.prisma.slot.create({ data: { startsAt, endsAt } });
      return this.toDto(slot, now);
    } catch (err) {
      if (isOverlapViolation(err)) {
        throw new AppException(409, ErrorCode.SLOT_OVERLAP, 'This slot overlaps one you have already published');
      }
      throw err;
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
    const visibleFrom = from > now ? from : now;
    const slots = await this.prisma.slot.findMany({
      where: { status: { not: 'DELETED' }, startsAt: { gt: visibleFrom, lt: to } },
      orderBy: { startsAt: 'asc' },
    });
    return { timezone, slots: slots.map((s) => this.toDto(s, now)) };
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
  if (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    return err.message.includes(SLOT_OVERLAP_CONSTRAINT) || err.message.includes('23P01');
  }
  return false;
}
