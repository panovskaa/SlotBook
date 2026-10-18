import { DateTime } from 'luxon';

/** An ISO week as it appears in the URL, e.g. 2026-W43 (FR-2). */
export interface IsoWeek {
  year: number;
  week: number;
}

const WEEK_PATTERN = /^(\d{4})-W(\d{2})$/;

export function parseWeek(value: string | null): IsoWeek | null {
  const match = value ? WEEK_PATTERN.exec(value) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  // Years have 52 or 53 ISO weeks; luxon knows which.
  const monday = DateTime.fromObject({ weekYear: year, weekNumber: week, weekday: 1 });
  if (!monday.isValid || monday.weekYear !== year || monday.weekNumber !== week) return null;
  return { year, week };
}

export function formatWeek({ year, week }: IsoWeek): string {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function weekOf(date: DateTime): IsoWeek {
  return { year: date.weekYear, week: date.weekNumber };
}

/** The week containing "now" in the given time zone. */
export function currentWeek(timezone: string, now: Date = new Date()): IsoWeek {
  return weekOf(DateTime.fromJSDate(now, { zone: timezone }));
}

export function shiftWeek(week: IsoWeek, by: number): IsoWeek {
  return weekOf(monday(week).plus({ weeks: by }));
}

export function compareWeeks(a: IsoWeek, b: IsoWeek): number {
  return a.year - b.year || a.week - b.week;
}

/** Monday to Sunday as calendar dates (YYYY-MM-DD). Calendar dates don't depend on a time zone. */
export function weekDates(week: IsoWeek): string[] {
  const start = monday(week);
  return Array.from({ length: 7 }, (_, i) => start.plus({ days: i }).toISODate()!);
}

/** e.g. "19 – 25 October 2026", or "28 December 2026 – 3 January 2027" across years. */
export function weekLabel(week: IsoWeek): string {
  const start = monday(week);
  const end = start.plus({ days: 6 });
  if (start.year !== end.year) return `${start.toFormat('d LLLL yyyy')} – ${end.toFormat('d LLLL yyyy')}`;
  if (start.month !== end.month) return `${start.toFormat('d LLLL')} – ${end.toFormat('d LLLL yyyy')}`;
  return `${start.toFormat('d')} – ${end.toFormat('d LLLL yyyy')}`;
}

function monday({ year, week }: IsoWeek): DateTime {
  return DateTime.fromObject({ weekYear: year, weekNumber: week, weekday: 1 }, { locale: 'en-GB' });
}
