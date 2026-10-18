import { Inject, Injectable } from '@nestjs/common';
import { BOOKING_CUTOFF_MINUTES, BookingRate, HostBookingsResponse, HostStatsResponse } from '@slotbook/shared';
import { Clock } from '../common/clock';
import { APP_CONFIG, AppConfig } from '../config';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 86_400_000;
/** Enough for any realistic schedule; keeps the response bounded. */
const MAX_UPCOMING = 500;

interface StatsRow {
  published: bigint;
  booked: bigint;
  open: bigint;
  published_30: bigint;
  booked_30: bigint;
  upcoming_bookings: bigint;
}

@Injectable()
export class HostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** FR-8. One query, so every number describes the same moment. */
  async stats(): Promise<HostStatsResponse> {
    const now = this.clock.now();
    const bookableAfter = new Date(now.getTime() + BOOKING_CUTOFF_MINUTES * 60_000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

    const [row] = await this.prisma.$queryRaw<StatsRow[]>`
      SELECT
        count(*) FILTER (WHERE status <> 'DELETED')                                        AS published,
        count(*) FILTER (WHERE status = 'BOOKED')                                          AS booked,
        count(*) FILTER (WHERE status = 'AVAILABLE' AND starts_at > ${bookableAfter})      AS open,
        count(*) FILTER (WHERE status <> 'DELETED'
                           AND starts_at >= ${thirtyDaysAgo} AND starts_at < ${now})       AS published_30,
        count(*) FILTER (WHERE status = 'BOOKED'
                           AND starts_at >= ${thirtyDaysAgo} AND starts_at < ${now})       AS booked_30,
        (SELECT count(*) FROM booking b JOIN slot s ON s.id = b.slot_id
          WHERE b.status = 'CONFIRMED' AND s.starts_at > ${now})                           AS upcoming_bookings
      FROM slot`;

    return {
      timezone: this.config.timezone,
      totalPublished: Number(row.published),
      upcomingBookings: Number(row.upcoming_bookings),
      remainingAvailable: Number(row.open),
      bookingRate: {
        last30Days: rate(row.booked_30, row.published_30),
        allTime: rate(row.booked, row.published),
      },
    };
  }

  /** FR-8: confirmed bookings whose slot hasn't started, soonest first. */
  async upcomingBookings(): Promise<HostBookingsResponse> {
    const bookings = await this.prisma.booking.findMany({
      where: { status: 'CONFIRMED', slot: { startsAt: { gt: this.clock.now() } } },
      include: { slot: true },
      orderBy: { slot: { startsAt: 'asc' } },
      take: MAX_UPCOMING,
    });
    return {
      timezone: this.config.timezone,
      bookings: bookings.map((b) => ({
        id: b.id,
        reference: b.reference,
        name: b.name,
        email: b.email,
        slotId: b.slotId,
        slot: { startsAt: b.slot.startsAt.toISOString(), endsAt: b.slot.endsAt.toISOString() },
        createdAt: b.createdAt.toISOString(),
      })),
    };
  }
}

function rate(booked: bigint, published: bigint): BookingRate {
  const b = Number(booked);
  const p = Number(published);
  return { booked: b, published: p, rate: p === 0 ? null : b / p };
}
