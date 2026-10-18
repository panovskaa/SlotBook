import { Controller, Get, UseGuards } from '@nestjs/common';
import { HostBookingsResponse, HostStatsResponse } from '@slotbook/shared';
import { HostKeyGuard } from '../common/host-key.guard';
import { HostService } from './host.service';

/** The host's dashboard data (FR-8). Every route needs the X-Host-Key header. */
@Controller('host')
@UseGuards(HostKeyGuard)
export class HostController {
  constructor(private readonly host: HostService) {}

  @Get('stats')
  stats(): Promise<HostStatsResponse> {
    return this.host.stats();
  }

  @Get('bookings')
  bookings(): Promise<HostBookingsResponse> {
    return this.host.upcomingBookings();
  }
}
