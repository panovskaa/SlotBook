import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CancelBookingResponse, ManageBookingResponse } from '@slotbook/shared';
import { ManageService } from './manage.service';

/** The private link's API (FR-7). The token in the path is the only credential. */
@Controller('manage/:token')
export class ManageController {
  constructor(private readonly manage: ManageService) {}

  @Get()
  view(@Param('token') token: string): Promise<ManageBookingResponse> {
    return this.manage.view(token);
  }

  @Post('cancel')
  @HttpCode(200)
  cancel(@Param('token') token: string): Promise<CancelBookingResponse> {
    return this.manage.cancel(token);
  }
}
