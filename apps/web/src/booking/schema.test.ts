import { BOOKING_INPUT_CASES } from '@slotbook/shared';
import { describe, expect, it } from 'vitest';
import { bookingFormSchema } from './schema';

// The same table runs against the backend DTO (apps/api/src/bookings/dto/create-booking.dto.spec.ts),
// so both layers must agree on every case (FR-5).
describe('booking form schema', () => {
  it.each(BOOKING_INPUT_CASES)('shared case: $label', ({ input, invalidField }) => {
    const result = bookingFormSchema.safeParse(input);
    const failed = result.success ? [] : [...new Set(result.error.issues.map((i) => String(i.path[0])))];
    expect(failed).toEqual(invalidField ? [invalidField] : []);
  });

  it('trims the name and lowercases the email, like the server', () => {
    expect(bookingFormSchema.parse({ name: '  Ada  ', email: ' Ada@Example.COM ' })).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
    });
  });
});
