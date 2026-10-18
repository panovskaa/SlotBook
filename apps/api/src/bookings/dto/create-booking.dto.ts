import { CreateBookingRequest, EMAIL_MAX_LENGTH, NAME_MAX_LENGTH, NAME_MIN_LENGTH } from '@slotbook/shared';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, IsUUID, Length, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** POST /bookings body (FR-3). */
export class CreateBookingDto implements CreateBookingRequest {
  @IsUUID('all', { message: 'slotId must be a valid slot ID' })
  slotId: string;

  @Transform(trim)
  @IsString()
  @Length(NAME_MIN_LENGTH, NAME_MAX_LENGTH, {
    message: `name must be between ${NAME_MIN_LENGTH} and ${NAME_MAX_LENGTH} characters`,
  })
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @MaxLength(EMAIL_MAX_LENGTH)
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;
}
