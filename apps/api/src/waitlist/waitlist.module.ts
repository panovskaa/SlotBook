import { Module } from '@nestjs/common';
import { SlotsModule } from '../slots/slots.module';
import { DevMailer } from './dev-mailer';
import { WaitlistController } from './waitlist.controller';
import { WaitlistListener } from './waitlist.listener';
import { WaitlistService } from './waitlist.service';

@Module({
  imports: [SlotsModule],
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistListener, DevMailer],
})
export class WaitlistModule {}
