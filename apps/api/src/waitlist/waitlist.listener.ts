import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SLOT_AVAILABLE, SlotAvailableEvent } from '../events';
import { WaitlistService } from './waitlist.service';

/** FR-9: when a slot opens (cancellation or new slot), book it for the first person waiting that day. */
@Injectable()
export class WaitlistListener {
  private readonly logger = new Logger(WaitlistListener.name);

  constructor(private readonly waitlist: WaitlistService) {}

  @OnEvent(SLOT_AVAILABLE)
  async handle(event: SlotAvailableEvent): Promise<void> {
    try {
      const entry = await this.waitlist.fillFromWaitlist(event);
      if (entry)
        this.logger.log({ slotId: event.slotId, waitlistEntryId: entry.id }, 'Freed slot booked from the waitlist');
    } catch (err) {
      // A failure here must never undo the cancellation or slot creation that caused it.
      this.logger.error({ err, slotId: event.slotId }, 'Booking from the waitlist failed');
    }
  }
}
