/** Emitted after a slot becomes bookable again, e.g. through a cancellation. The waitlist (FR-9) listens. */
export const SLOT_AVAILABLE = 'slot.available';

export interface SlotAvailableEvent {
  slotId: string;
  startsAt: Date;
  endsAt: Date;
}
