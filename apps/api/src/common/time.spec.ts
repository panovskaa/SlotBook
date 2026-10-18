import { startOfNextZonedDay, startOfZonedDay, zonedToUtc } from './time';

const TZ = 'Europe/Berlin';

describe('time helpers', () => {
  it('converts winter and summer times with the right offset', () => {
    expect(zonedToUtc('2026-11-03', '10:00', TZ)?.toISOString()).toBe('2026-11-03T09:00:00.000Z');
    expect(zonedToUtc('2026-07-03', '10:00', TZ)?.toISOString()).toBe('2026-07-03T08:00:00.000Z');
  });

  it('returns null for a time skipped by the spring clock change', () => {
    expect(zonedToUtc('2027-03-28', '02:30', TZ)).toBeNull();
  });

  it('accepts the repeated hour of the autumn clock change', () => {
    expect(zonedToUtc('2026-10-25', '02:30', TZ)).not.toBeNull();
  });

  it('finds day boundaries in the zone, including a 25-hour day', () => {
    expect(startOfZonedDay('2026-10-25', TZ).toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(startOfNextZonedDay('2026-10-25', TZ).toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });
});
