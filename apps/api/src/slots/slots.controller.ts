import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { SlotDto, SlotsResponse } from '@slotbook/shared';
import { HostKeyGuard } from '../common/host-key.guard';
import { CreateSlotDto } from './dto/create-slot.dto';
import { ListSlotsQuery } from './dto/list-slots.query';
import { SlotsService } from './slots.service';

@Controller('slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  list(@Query() query: ListSlotsQuery): Promise<SlotsResponse> {
    return this.slots.list(query);
  }
}

@Controller('host/slots')
@UseGuards(HostKeyGuard)
export class HostSlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateSlotDto): Promise<SlotDto> {
    return this.slots.create(dto);
  }
}
