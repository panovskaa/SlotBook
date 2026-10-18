-- Rules Prisma's schema language can't express. The database enforces them itself (NFR-5),
-- so no code path or race can break them.

-- A slot must end after it starts.
ALTER TABLE "slot"
  ADD CONSTRAINT "slot_ends_after_start" CHECK ("ends_at" > "starts_at");

-- FR-5: active slots can't overlap. A range is [start, end), so back-to-back slots
-- (10:00–10:30 and 10:30–11:00) don't touch. Deleted slots are ignored.
ALTER TABLE "slot"
  ADD CONSTRAINT "slot_no_overlap"
  EXCLUDE USING gist (tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("status" <> 'DELETED');

-- FR-4: at most one confirmed booking per slot.
CREATE UNIQUE INDEX "booking_one_confirmed_per_slot"
  ON "booking" ("slot_id")
  WHERE "status" = 'CONFIRMED';
