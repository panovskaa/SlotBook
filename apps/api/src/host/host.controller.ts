import { Controller, Get, UseGuards } from '@nestjs/common';
import { HostBookingsResponse, HostStatsResponse, InsightsResponse } from '@slotbook/shared';
import { HostKeyGuard } from '../common/host-key.guard';
import { HostService } from './host.service';
import { InsightsService } from './insights.service';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Doc } from '../common/docs';
import { HOST_KEY_SECURITY } from '../configure-app';

/** The host's dashboard data (FR-8, FR-10). Every route needs the X-Host-Key header. */
@ApiTags('Host')
@ApiSecurity(HOST_KEY_SECURITY)
@Controller('host')
@UseGuards(HostKeyGuard)
export class HostController {
  constructor(
    private readonly host: HostService,
    private readonly insightsService: InsightsService,
  ) {}

  @Doc('Dashboard numbers', { 200: 'Stats', 401: 'UNAUTHORIZED' })
  @Get('stats')
  stats(): Promise<HostStatsResponse> {
    return this.host.stats();
  }

  @Doc('Upcoming confirmed bookings, with booker details', { 200: 'Bookings', 401: 'UNAUTHORIZED' })
  @Get('bookings')
  bookings(): Promise<HostBookingsResponse> {
    return this.host.upcomingBookings();
  }

  @Doc('Heatmap, top time slots and weekday booking rates', { 200: 'Insights', 401: 'UNAUTHORIZED' })
  @Get('insights')
  insights(): Promise<InsightsResponse> {
    return this.insightsService.insights();
  }
}
