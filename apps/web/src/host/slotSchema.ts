import {
  SLOT_MAX_MINUTES,
  SLOT_MIN_MINUTES,
  SLOT_STEP_MINUTES,
  isValidDate,
  isValidDuration,
  isValidTime,
} from '@slotbook/shared';
import { DateTime } from 'luxon';
import { z } from 'zod';

/** The host's new-slot form. Same rules as the API's CreateSlotDto (FR-5); the API stays the authority. */
export const slotFormSchema = z.object({
  date: z.string().refine(isValidDate, 'Choose a date'),
  startTime: z.string().refine(isValidTime, 'Choose a start time'),
  durationMinutes: z
    .number({ error: 'Choose a duration' })
    .refine(
      isValidDuration,
      `Choose ${SLOT_MIN_MINUTES} to ${SLOT_MAX_MINUTES} minutes, in steps of ${SLOT_STEP_MINUTES}`,
    ),
});

export type SlotFormValues = z.infer<typeof slotFormSchema>;

/** Instant feedback for a start in the past, checked in the app's time zone. */
export function startsInPast(values: SlotFormValues, timezone: string, now: Date = new Date()): boolean {
  const start = DateTime.fromISO(`${values.date}T${values.startTime}`, { zone: timezone });
  return start.isValid && start.toMillis() <= now.getTime();
}

export const DURATION_OPTIONS = Array.from(
  { length: (SLOT_MAX_MINUTES - SLOT_MIN_MINUTES) / SLOT_STEP_MINUTES + 1 },
  (_, i) => SLOT_MIN_MINUTES + i * SLOT_STEP_MINUTES,
);
