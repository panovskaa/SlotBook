import { Controller, Get, UseGuards } from '@nestjs/common';
import { HostBookingsResponse, HostStatsResponse, InsightsResponse } from '@slotbook/shared';
import { HostKeyGuard } from '../common/host-key.guard';
import { HostService } from './host.service';
import { InsightsService } from './insights.service';

/** The host's dashboard data (FR-8, FR-10). Every route needs the X-Host-Key header. */
@Controller('host')
@UseGuards(HostKeyGuard)
export class HostController {
  constructor(
    private readonly host: HostService,
    private readonly insightsService: InsightsService,
  ) {}

  @Get('stats')
  stats(): Promise<HostStatsResponse> {
    return this.host.stats();
  }

  @Get('bookings')
  bookings(): Promise<HostBookingsResponse> {
    return this.host.upcomingBookings();
  }

  @Get('insights')
  insights(): Promise<InsightsResponse> {
    return this.insightsService.insights();
  }
}
