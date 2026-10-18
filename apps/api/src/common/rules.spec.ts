import {
  hasStarted,
  isValidDate,
  isValidDuration,
  isValidTime,
  isWithinBookingWindow,
  isWithinCancellationWindow,
} from '@slotbook/shared';

const START = new Date('2026-11-03T10:00:00Z');
const minutesBefore = (m: number) => new Date(START.getTime() - m * 60_000);

describe('shared slot rules', () => {
  it.each([
    [15, true],
    [30, true],
    [240, true],
    [0, false],
    [10, false],
    [20, false],
    [255, false],
    [30.5, false],
  ])('duration %p is valid: %p', (minutes, expected) => {
    expect(isValidDuration(minutes)).toBe(expected);
  });

  it.each([
    ['2026-11-03', true],
    ['2028-02-29', true],
    ['2026-02-29', false],
    ['2026-13-01', false],
    ['2026-1-3', false],
    ['03/11/2026', false],
  ])('date %p is valid: %p', (value, expected) => {
    expect(isValidDate(value)).toBe(expected);
  });

  it.each([
    ['00:00', true],
    ['23:59', true],
    ['24:00', false],
    ['9:30', false],
    ['09:60', false],
  ])('time %p is valid: %p', (value, expected) => {
    expect(isValidTime(value)).toBe(expected);
  });

  it('treats a slot as started from its start time onwards', () => {
    expect(hasStarted(START, minutesBefore(1))).toBe(false);
    expect(hasStarted(START, START)).toBe(true);
  });

  it.each([
    [31, true],
    [30, false],
    [29, false],
  ])('booking %p minutes before the start is allowed: %p', (minutes, expected) => {
    expect(isWithinBookingWindow(START, minutesBefore(minutes))).toBe(expected);
  });

  it.each([
    [61, true],
    [60, false],
    [59, false],
  ])('cancelling %p minutes before the start is allowed: %p', (minutes, expected) => {
    expect(isWithinCancellationWindow(START, minutesBefore(minutes))).toBe(expected);
  });
});
