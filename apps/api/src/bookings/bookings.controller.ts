import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { BookingLookupResponse, CreateBookingResponse } from '@slotbook/shared';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ApiTags } from '@nestjs/swagger';
import { Doc } from '../common/docs';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Doc('Book a slot (public, rate-limited)', { 201: 'Booked: reference, private manage token and message', 400: 'VALIDATION_ERROR', 404: 'NOT_FOUND', 409: 'SLOT_ALREADY_BOOKED', 422: 'BOOKING_CUTOFF', 429: 'RATE_LIMITED' })
  @Post()
  @UseGuards(ThrottlerGuard)
  @HttpCode(201)
  book(@Body() dto: CreateBookingDto): Promise<CreateBookingResponse> {
    return this.bookings.book(dto);
  }

  @Doc('Look up a booking by reference: slot time and status only, no personal data', { 200: 'Found', 404: 'NOT_FOUND' })
  @Get('ref/:code')
  findByReference(@Param('code') code: string): Promise<BookingLookupResponse> {
    return this.bookings.findByReference(code);
  }
}
