import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SLOT_AVAILABLE, SlotAvailableEvent } from '../events';
import { WaitlistService } from './waitlist.service';

/** FR-9: when a slot opens (cancellation or new slot), tell everyone waiting for that date. */
@Injectable()
export class WaitlistListener {
  private readonly logger = new Logger(WaitlistListener.name);

  constructor(private readonly waitlist: WaitlistService) {}

  @OnEvent(SLOT_AVAILABLE)
  async handle(event: SlotAvailableEvent): Promise<void> {
    try {
      const count = await this.waitlist.notifySlotAvailable(event);
      if (count) this.logger.log({ slotId: event.slotId, count }, 'Waitlist notified');
    } catch (err) {
      // A failed notification must never undo the cancellation or slot creation that caused it.
      this.logger.error({ err, slotId: event.slotId }, 'Waitlist notification failed');
    }
  }
}
