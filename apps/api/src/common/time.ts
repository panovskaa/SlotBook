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

/** The calendar date (YYYY-MM-DD) of an instant in the app's time zone. */
export function zonedDateOf(instant: Date, timezone: string): string {
  return DateTime.fromJSDate(instant, { zone: timezone }).toISODate()!;
}

/**
 * Postgres DATE columns reach Prisma as a JS Date at UTC midnight. These convert between that and
 * YYYY-MM-DD without any time zone shifting the day.
 */
export const dateColumn = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
export const fromDateColumn = (value: Date): string => value.toISOString().slice(0, 10);

/** The UTC instant at which the day after a calendar date starts, for half-open ranges. */
export function startOfNextZonedDay(date: string, timezone: string): Date {
  return DateTime.fromISO(date, { zone: timezone }).plus({ days: 1 }).startOf('day').toUTC().toJSDate();
}
