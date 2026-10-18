/** Slot rules shared by the frontend (zod) and the backend (class-validator). FR-1, FR-5. */

export const SLOT_MIN_MINUTES = 15;
export const SLOT_MAX_MINUTES = 240;
export const SLOT_STEP_MINUTES = 15;

/** A slot can't be booked less than this long before it starts (A1). */
export const BOOKING_CUTOFF_MINUTES = 30;
/** A booking can't be cancelled less than this long before it starts (A2). */
export const CANCELLATION_CUTOFF_MINUTES = 60;

/** Calendar date, e.g. 2026-10-20. */
export const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** 24-hour start time, e.g. 09:30. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDuration(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= SLOT_MIN_MINUTES &&
    minutes <= SLOT_MAX_MINUTES &&
    minutes % SLOT_STEP_MINUTES === 0
  );
}

/** True when the date string is well formed and names a real day (no 2026-02-30). */
export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** Booker's name length after trimming (FR-3). */
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 100;
/** Practical upper bound for an email address (RFC 5321). */
export const EMAIL_MAX_LENGTH = 254;

export const BOOKING_CUTOFF_MESSAGE = 'Booking closes 30 minutes before start';
export const CANCELLATION_CUTOFF_MESSAGE = 'Cancellation closes 1 hour before start';

/** Crockford Base32: no I, L, O or U, so references are hard to misread (FR-6). */
export const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const REFERENCE_LENGTH = 8;

/** Shows an 8-character code as XXXX-XXXX. */
export function formatReference(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Reads a reference the way a person might type it: any case, with or without the dash,
 * and with the look-alikes Crockford allows (O → 0, I and L → 1). Returns null if it can't be one.
 */
export function normalizeReference(input: string): string | null {
  const code = input
    .trim()
    .toUpperCase()
    .replace(/[-\s]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (code.length !== REFERENCE_LENGTH) return null;
  for (const ch of code) if (!REFERENCE_ALPHABET.includes(ch)) return null;
  return formatReference(code);
}

const MINUTE_MS = 60_000;

/** A slot has started (or is in the past) and is hidden from visitors. */
export function hasStarted(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() <= now.getTime();
}

/**
 * Booking is open only while the slot starts in MORE than 30 minutes (FR-3).
 * At exactly 30 minutes the booking has closed ("closes 30 minutes before start").
 */
export function isWithinBookingWindow(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() - now.getTime() > BOOKING_CUTOFF_MINUTES * MINUTE_MS;
}

/** Cancelling is open only while the slot starts in MORE than 60 minutes (FR-7). */
export function isWithinCancellationWindow(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() - now.getTime() > CANCELLATION_CUTOFF_MINUTES * MINUTE_MS;
}
