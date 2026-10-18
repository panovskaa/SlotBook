import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { JoinWaitlistResponse, WaitlistStatusResponse } from '@slotbook/shared';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { WaitlistService } from './waitlist.service';

@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Post()
  @HttpCode(201)
  join(@Body() dto: JoinWaitlistDto): Promise<JoinWaitlistResponse> {
    return this.waitlist.join(dto);
  }

  @Get(':token')
  status(@Param('token') token: string): Promise<WaitlistStatusResponse> {
    return this.waitlist.status(token);
  }
}
