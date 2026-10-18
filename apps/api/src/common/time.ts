import { DateTime } from 'luxon';

/**
 * Turns a wall-clock date and time in the app's time zone into a UTC instant.
 * Returns null for a time that doesn't exist that day, such as 02:30 when clocks spring forward.
 */
export function zonedToUtc(date: string, time: string, timezone: string): Date | null {
  const local = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  if (!local.isValid) return null;
  // Luxon silently moves a non-existent time forward; detect that by formatting it back.
  if (local.toFormat('yyyy-MM-dd') !== date || local.toFormat('HH:mm') !== time) return null;
  return local.toUTC().toJSDate();
}

/** The UTC instant at which a calendar date starts in the app's time zone. */
export function startOfZonedDay(date: string, timezone: string): Date {
  return DateTime.fromISO(date, { zone: timezone }).startOf('day').toUTC().toJSDate();
}

/** The UTC instant at which the day after a calendar date starts, for half-open ranges. */
export function startOfNextZonedDay(date: string, timezone: string): Date {
  return DateTime.fromISO(date, { zone: timezone }).plus({ days: 1 }).startOf('day').toUTC().toJSDate();
}
