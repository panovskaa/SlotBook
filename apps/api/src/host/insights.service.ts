import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HeatmapCell, InsightsResponse, IsoWeekday, TopSlot } from '@slotbook/shared';
import { APP_CONFIG, AppConfig } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { rate } from './host.service';

interface WeekdayRow {
  weekday: number;
  published: bigint;
  booked: bigint;
}
interface HourRangeRow {
  from_hour: number | null;
  to_hour: number | null;
}

/**
 * FR-10. Every number is a SQL aggregate grouped in the app's time zone, so a 23:30 UTC slot counts
 * on the next local day. Weekdays use ISODOW (Monday = 1 … Sunday = 7) to match the Monday-first
 * calendar, rather than DOW's Sunday = 0.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async insights(): Promise<InsightsResponse> {
    const tz = this.config.timezone;
    const local = Prisma.sql`(s.starts_at AT TIME ZONE ${tz})`;

    // One repeatable-read snapshot, so the heatmap, the top slots and the rates agree.
    const [heatmap, topSlots, weekdays, [hours]] = await this.prisma.$transaction(
      [
        this.prisma.$queryRaw<HeatmapCell[]>`
          SELECT EXTRACT(ISODOW FROM ${local})::int AS weekday,
                 EXTRACT(HOUR FROM ${local})::int   AS hour,
                 count(*)::int                       AS bookings
          FROM booking b JOIN slot s ON s.id = b.slot_id
          WHERE b.status = 'CONFIRMED'
          GROUP BY 1, 2
          ORDER BY 1, 2`,
        this.prisma.$queryRaw<TopSlot[]>`
          SELECT EXTRACT(ISODOW FROM ${local})::int AS weekday,
                 to_char(${local}, 'HH24:MI')        AS time,
                 count(*)::int                       AS bookings
          FROM booking b JOIN slot s ON s.id = b.slot_id
          WHERE b.status = 'CONFIRMED'
          GROUP BY 1, 2
          ORDER BY 3 DESC, 1, 2
          LIMIT 3`,
        this.prisma.$queryRaw<WeekdayRow[]>`
          SELECT EXTRACT(ISODOW FROM ${local})::int              AS weekday,
                 count(*) FILTER (WHERE s.status <> 'DELETED')   AS published,
                 count(*) FILTER (WHERE s.status = 'BOOKED')     AS booked
          FROM slot s
          GROUP BY 1`,
        this.prisma.$queryRaw<HourRangeRow[]>`
          SELECT min(EXTRACT(HOUR FROM ${local}))::int AS from_hour,
                 max(EXTRACT(HOUR FROM ${local}))::int AS to_hour
          FROM slot s
          WHERE s.status <> 'DELETED'`,
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    const byWeekday = new Map(weekdays.map((w) => [w.weekday, w]));
    return {
      timezone: tz,
      totalBookings: heatmap.reduce((sum, c) => sum + c.bookings, 0),
      hourRange: hours.from_hour === null || hours.to_hour === null ? null : { from: hours.from_hour, to: hours.to_hour },
      heatmap,
      topSlots,
      weekdayRates: ([1, 2, 3, 4, 5, 6, 7] as IsoWeekday[]).map((weekday) => {
        const row = byWeekday.get(weekday);
        return { weekday, ...rate(row?.booked ?? 0, row?.published ?? 0) };
      }),
    };
  }
}
