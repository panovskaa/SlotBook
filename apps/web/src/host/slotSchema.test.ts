import { SLOT_INPUT_CASES } from '@slotbook/shared';
import { describe, expect, it } from 'vitest';
import { DURATION_OPTIONS, slotFormSchema, startsInPast } from './slotSchema';

// The same table runs against the API's CreateSlotDto (apps/api/src/slots/dto/create-slot.dto.spec.ts).
describe('slot form schema', () => {
  it.each(SLOT_INPUT_CASES)('shared case: $label', ({ input, invalidField }) => {
    const result = slotFormSchema.safeParse(input);
    const failed = result.success ? [] : [...new Set(result.error.issues.map((i) => String(i.path[0])))];
    expect(failed).toEqual(invalidField ? [invalidField] : []);
  });

  it('offers every allowed length from 15 minutes to 4 hours', () => {
    expect(DURATION_OPTIONS[0]).toBe(15);
    expect(DURATION_OPTIONS.at(-1)).toBe(240);
    expect(DURATION_OPTIONS).toHaveLength(16);
  });

  it('spots a start in the past in the app time zone, with "now" counting as past', () => {
    const now = new Date('2026-11-02T08:00:00Z'); // 09:00 in Berlin
    const at = (startTime: string) => ({ date: '2026-11-02', startTime, durationMinutes: 30 });
    expect(startsInPast(at('08:59'), 'Europe/Berlin', now)).toBe(true);
    expect(startsInPast(at('09:00'), 'Europe/Berlin', now)).toBe(true);
    expect(startsInPast(at('09:01'), 'Europe/Berlin', now)).toBe(false);
    // Same instant, different zone: 08:30 in London is already 09:30 in Berlin.
    expect(startsInPast(at('08:30'), 'Europe/London', now)).toBe(false);
  });
});
