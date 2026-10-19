import { EMAIL_MAX_LENGTH, JoinWaitlistRequest, NAME_MAX_LENGTH, NAME_MIN_LENGTH } from '@slotbook/shared';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { IsCalendarDate } from '../../slots/dto/create-slot.dto';

/** POST /waitlist body (FR-9). Name and email follow the same rules as a booking. */
export class JoinWaitlistDto implements JoinWaitlistRequest {
  @IsString()
  @IsCalendarDate()
  date: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(NAME_MIN_LENGTH, NAME_MAX_LENGTH, {
    message: `name must be between ${NAME_MIN_LENGTH} and ${NAME_MAX_LENGTH} characters`,
  })
  name: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @MaxLength(EMAIL_MAX_LENGTH)
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;
}
