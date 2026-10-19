import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { SlotsModule } from '../slots/slots.module';
import { WaitlistController } from './waitlist.controller';
import { WaitlistListener } from './waitlist.listener';
import { WaitlistService } from './waitlist.service';

@Module({
  imports: [SlotsModule, BookingsModule],
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistListener],
})
export class WaitlistModule {}
