import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JoinWaitlistResponse, WaitlistStatusResponse } from '@slotbook/shared';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { WaitlistService } from './waitlist.service';
import { ApiTags } from '@nestjs/swagger';
import { Doc } from '../common/docs';

@ApiTags('Waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Doc('Join the waitlist for a fully booked date (rate-limited)', {
    201: 'Joined: private status token',
    400: 'VALIDATION_ERROR',
    409: 'ALREADY_ON_WAITLIST',
    422: 'DATE_HAS_AVAILABILITY',
    429: 'RATE_LIMITED',
  })
  @Post()
  @UseGuards(ThrottlerGuard)
  @HttpCode(201)
  join(@Body() dto: JoinWaitlistDto): Promise<JoinWaitlistResponse> {
    return this.waitlist.join(dto);
  }

  @Doc('Waitlist status with its private token', { 200: 'The entry and any slots bookable now', 404: 'NOT_FOUND' })
  @Get(':token')
  status(@Param('token') token: string): Promise<WaitlistStatusResponse> {
    return this.waitlist.status(token);
  }
}
