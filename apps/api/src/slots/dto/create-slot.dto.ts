import {
  SLOT_MAX_MINUTES,
  SLOT_MIN_MINUTES,
  SLOT_STEP_MINUTES,
  CreateSlotRequest,
  isValidDate,
  isValidTime,
} from '@slotbook/shared';
import { IsDivisibleBy, IsInt, IsString, Max, Min, ValidateBy } from 'class-validator';

export const IsCalendarDate = () =>
  ValidateBy({
    name: 'isCalendarDate',
    validator: {
      validate: (value: unknown) => typeof value === 'string' && isValidDate(value),
      defaultMessage: () => 'date must be a real date in the format YYYY-MM-DD',
    },
  });

const IsClockTime = () =>
  ValidateBy({
    name: 'isClockTime',
    validator: {
      validate: (value: unknown) => typeof value === 'string' && isValidTime(value),
      defaultMessage: () => 'startTime must be a 24-hour time in the format HH:mm',
    },
  });

/** POST /host/slots body (FR-1). The rules come from @slotbook/shared, which the frontend uses too. */
export class CreateSlotDto implements CreateSlotRequest {
  @IsString()
  @IsCalendarDate()
  date: string;

  @IsString()
  @IsClockTime()
  startTime: string;

  @IsInt({ message: 'durationMinutes must be a whole number' })
  @Min(SLOT_MIN_MINUTES)
  @Max(SLOT_MAX_MINUTES)
  @IsDivisibleBy(SLOT_STEP_MINUTES, { message: `durationMinutes must be a multiple of ${SLOT_STEP_MINUTES}` })
  durationMinutes: number;
}
