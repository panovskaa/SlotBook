import { Module } from '@nestjs/common';
import { SlotsModule } from '../slots/slots.module';
import { WaitlistController } from './waitlist.controller';
import { WaitlistListener } from './waitlist.listener';
import { WaitlistService } from './waitlist.service';

@Module({
  imports: [SlotsModule],
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistListener],
})
export class WaitlistModule {}
