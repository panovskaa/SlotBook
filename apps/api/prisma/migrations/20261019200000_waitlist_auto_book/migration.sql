-- FR-9 change: a freed slot is booked automatically for the first person waiting on that date.

-- New status for an entry that was given a booking. NOTIFIED stays for older entries.
ALTER TYPE "WaitlistStatus" ADD VALUE 'BOOKED' BEFORE 'EXPIRED';

-- Which booking the entry got. One booking can come from at most one entry.
ALTER TABLE "waitlist_entry" ADD COLUMN "booking_id" UUID;
CREATE UNIQUE INDEX "waitlist_entry_booking_id_key" ON "waitlist_entry"("booking_id");
ALTER TABLE "waitlist_entry"
  ADD CONSTRAINT "waitlist_entry_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
