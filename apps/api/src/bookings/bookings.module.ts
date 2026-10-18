import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { ConfirmationMessageService } from './confirmation-message.service';
import { ReferenceGenerator } from './reference.generator';

@Module({
  controllers: [BookingsController],
  providers: [BookingsService, ReferenceGenerator, ConfirmationMessageService],
})
export class BookingsModule {}
