import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateSlotDto } from './create-slot.dto';

const failedFields = (body: object) =>
  validateSync(plainToInstance(CreateSlotDto, body), { whitelist: true, forbidNonWhitelisted: true }).map(
    (e) => e.property,
  );

const valid = { date: '2026-11-03', startTime: '10:00', durationMinutes: 30 };

describe('CreateSlotDto', () => {
  it('accepts a valid slot', () => {
    expect(failedFields(valid)).toEqual([]);
  });

  it.each([
    ['date', '2026/11/03'],
    ['date', '2026-02-30'],
    ['date', 20261103],
    ['startTime', '25:00'],
    ['startTime', '10:00:00'],
    ['durationMinutes', 0],
    ['durationMinutes', 14],
    ['durationMinutes', 241],
    ['durationMinutes', 45.5],
    ['durationMinutes', 50],
    ['durationMinutes', '30'],
  ])('rejects %s = %p', (field, value) => {
    expect(failedFields({ ...valid, [field]: value })).toEqual([field]);
  });

  it('rejects unknown fields', () => {
    expect(failedFields({ ...valid, endsAt: '2026-11-03T11:00' })).toEqual(['endsAt']);
  });
});
