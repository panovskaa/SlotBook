import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { BookingLookupResponse, CreateBookingResponse } from '@slotbook/shared';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @HttpCode(201)
  book(@Body() dto: CreateBookingDto): Promise<CreateBookingResponse> {
    return this.bookings.book(dto);
  }

  @Get('ref/:code')
  findByReference(@Param('code') code: string): Promise<BookingLookupResponse> {
    return this.bookings.findByReference(code);
  }
}
