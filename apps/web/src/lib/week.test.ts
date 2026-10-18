import { describe, expect, it } from 'vitest';
import { currentWeek, formatWeek, parseWeek, shiftWeek, weekDates, weekLabel } from './week';

describe('week helpers', () => {
  it('parses and formats ISO weeks', () => {
    expect(parseWeek('2026-W43')).toEqual({ year: 2026, week: 43 });
    expect(formatWeek({ year: 2026, week: 3 })).toBe('2026-W03');
  });

  it.each(['2026-W54', '2025-W53', '2026-W00', '2026W43', '2026-W4', 'next', null])('rejects %p', (value) => {
    expect(parseWeek(value)).toBeNull();
  });

  it('knows which years have 53 weeks', () => {
    expect(parseWeek('2026-W53')).toEqual({ year: 2026, week: 53 });
    expect(parseWeek('2025-W53')).toBeNull();
  });

  it('starts the week on Monday', () => {
    expect(weekDates({ year: 2026, week: 43 })).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
  });

  it('rolls over the year in both directions', () => {
    expect(shiftWeek({ year: 2025, week: 52 }, 1)).toEqual({ year: 2026, week: 1 });
    expect(shiftWeek({ year: 2026, week: 53 }, 1)).toEqual({ year: 2027, week: 1 });
    expect(shiftWeek({ year: 2027, week: 1 }, -1)).toEqual({ year: 2026, week: 53 });
  });

  it('handles a week whose days span two years', () => {
    expect(weekDates({ year: 2026, week: 53 })).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
    expect(weekLabel({ year: 2026, week: 53 })).toBe('28 December 2026 – 3 January 2027');
  });

  it('keeps seven distinct days across the autumn clock change', () => {
    // 25 Oct 2026 has 25 hours in Europe; the week must still be Mon 19 – Sun 25.
    const dates = weekDates({ year: 2026, week: 43 });
    expect(new Set(dates).size).toBe(7);
    expect(dates[6]).toBe('2026-10-25');
    // And the spring change: 29 Mar 2026.
    expect(weekDates({ year: 2026, week: 13 })[6]).toBe('2026-03-29');
  });

  it('labels weeks within one month and across two', () => {
    expect(weekLabel({ year: 2026, week: 43 })).toBe('19 – 25 October 2026');
    expect(weekLabel({ year: 2026, week: 44 })).toBe('26 October – 1 November 2026');
  });

  it('works out the current week in the app time zone', () => {
    // Sunday 23:30 in Berlin is already Monday 00:30 in Helsinki.
    const now = new Date('2026-10-25T22:30:00Z');
    expect(currentWeek('Europe/Berlin', now)).toEqual({ year: 2026, week: 43 });
    expect(currentWeek('Europe/Helsinki', now)).toEqual({ year: 2026, week: 44 });
  });
});
