import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ErrorCode, SlotDto, SlotResponse, SlotsResponse } from '@slotbook/shared';
import { AppException } from '../common/app-exception';
import { HostKeyGuard } from '../common/host-key.guard';
import { CreateSlotDto } from './dto/create-slot.dto';
import { ListSlotsQuery } from './dto/list-slots.query';
import { SlotsService } from './slots.service';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Doc } from '../common/docs';
import { HOST_KEY_SECURITY } from '../configure-app';

@ApiTags('Slots')
@Controller('slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Doc('Slots in a date range, each with its state (public)', { 200: 'Slots that have not started', 400: 'VALIDATION_ERROR' })
  @Get()
  list(@Query() query: ListSlotsQuery): Promise<SlotsResponse> {
    return this.slots.list(query);
  }

  @Doc('One slot (public)', { 200: 'The slot and the app time zone', 404: 'NOT_FOUND: unknown, deleted or started' })
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ exceptionFactory: () => notFound() })) id: string): Promise<SlotResponse> {
    return this.slots.findOne(id);
  }
}

function notFound(): AppException {
  return new AppException(404, ErrorCode.NOT_FOUND, 'This slot does not exist');
}

@ApiTags('Host')
@ApiSecurity(HOST_KEY_SECURITY)
@Controller('host/slots')
@UseGuards(HostKeyGuard)
export class HostSlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Doc('Create a slot', { 201: 'Created', 400: 'VALIDATION_ERROR or SLOT_IN_PAST', 401: 'UNAUTHORIZED', 409: 'SLOT_OVERLAP' })
  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateSlotDto): Promise<SlotDto> {
    return this.slots.create(dto);
  }

  @Doc('Delete a slot nobody has booked', { 204: 'Deleted', 400: 'SLOT_IN_PAST: already started', 401: 'UNAUTHORIZED', 404: 'NOT_FOUND', 409: 'SLOT_ALREADY_BOOKED' })
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', new ParseUUIDPipe({ exceptionFactory: () => notFound() })) id: string): Promise<void> {
    return this.slots.remove(id);
  }
}
