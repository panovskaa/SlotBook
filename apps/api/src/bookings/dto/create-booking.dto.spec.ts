import { BOOKING_INPUT_CASES } from '@slotbook/shared';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateBookingDto } from './create-booking.dto';

const valid = { slotId: '3f1c2a9e-5b6d-4c7e-8f90-1a2b3c4d5e6f', name: 'Ada Lovelace', email: 'ada@example.com' };

const parse = (body: object) => {
  const dto = plainToInstance(CreateBookingDto, body);
  const failed = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).map((e) => e.property);
  return { dto, failed };
};

describe('CreateBookingDto', () => {
  it('trims the name and lowercases the email', () => {
    const { dto, failed } = parse({ ...valid, name: '  Ada Lovelace  ', email: '  Ada@Example.COM ' });
    expect(failed).toEqual([]);
    expect(dto.name).toBe('Ada Lovelace');
    expect(dto.email).toBe('ada@example.com');
  });

  it.each([
    ['name', 'A'],
    ['name', '   A   '],
    ['name', '      '],
    ['name', 'x'.repeat(101)],
    ['name', 42],
    ['email', 'not-an-email'],
    ['email', 'ada@'],
    ['email', `${'a'.repeat(250)}@example.com`],
    ['slotId', 'slot-1'],
    ['slotId', ''],
  ])('rejects %s = %p', (field, value) => {
    expect(parse({ ...valid, [field]: value }).failed).toEqual([field]);
  });

  it('accepts names at both length limits', () => {
    expect(parse({ ...valid, name: 'Al' }).failed).toEqual([]);
    expect(parse({ ...valid, name: 'x'.repeat(100) }).failed).toEqual([]);
  });

  it('rejects unknown fields', () => {
    expect(parse({ ...valid, status: 'CANCELLED' }).failed).toEqual(['status']);
  });

  // The same table runs against the frontend's zod schema (apps/web/src/booking/schema.test.ts).
  it.each(BOOKING_INPUT_CASES)('shared case: $label', ({ input, invalidField }) => {
    expect(parse({ slotId: valid.slotId, ...input }).failed).toEqual(invalidField ? [invalidField] : []);
  });
});
