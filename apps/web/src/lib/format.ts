import { DateTime } from 'luxon';

const zoned = (iso: string, timezone: string) => DateTime.fromISO(iso, { zone: timezone, locale: 'en-GB' });

/** "09:30" in the app's time zone. */
export const formatTime = (iso: string, timezone: string) => zoned(iso, timezone).toFormat('HH:mm');

/** "Monday 19 October" */
export const formatLongDate = (iso: string, timezone: string) => zoned(iso, timezone).toFormat('cccc d LLLL');

/** The calendar date of an instant in the app's time zone, YYYY-MM-DD. */
export const zonedDate = (iso: string, timezone: string) => zoned(iso, timezone).toISODate()!;

/** "Mon" and "19" for a YYYY-MM-DD date. */
export function dayParts(date: string): { weekday: string; longWeekday: string; day: string; month: string } {
  const d = DateTime.fromISO(date, { locale: 'en-GB' });
  return { weekday: d.toFormat('ccc'), longWeekday: d.toFormat('cccc'), day: d.toFormat('d'), month: d.toFormat('LLLL') };
}

export const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};
