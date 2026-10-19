import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CancelBookingResponse, ManageBookingResponse } from '@slotbook/shared';
import { ManageService } from './manage.service';
import { ApiTags } from '@nestjs/swagger';
import { Doc } from '../common/docs';

/** The private link's API (FR-7). The token in the path is the only credential. */
@ApiTags('Manage booking')
@Controller('manage/:token')
export class ManageController {
  constructor(private readonly manage: ManageService) {}

  @Doc('View a booking with its private token', { 200: 'The booking', 404: 'NOT_FOUND: wrong or malformed token' })
  @Get()
  view(@Param('token') token: string): Promise<ManageBookingResponse> {
    return this.manage.view(token);
  }

  @Doc('Cancel a booking (rate-limited)', { 200: 'Cancelled, or already cancelled', 404: 'NOT_FOUND', 422: 'CANCELLATION_CUTOFF', 429: 'RATE_LIMITED' })
  @Post('cancel')
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  cancel(@Param('token') token: string): Promise<CancelBookingResponse> {
    return this.manage.cancel(token);
  }
}
