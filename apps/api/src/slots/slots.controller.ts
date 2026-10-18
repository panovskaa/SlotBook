import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ErrorCode, SlotDto, SlotResponse, SlotsResponse } from '@slotbook/shared';
import { AppException } from '../common/app-exception';
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

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ exceptionFactory: () => notFound() })) id: string): Promise<SlotResponse> {
    return this.slots.findOne(id);
  }
}

function notFound(): AppException {
  return new AppException(404, ErrorCode.NOT_FOUND, 'This slot does not exist');
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
