import { IsString } from 'class-validator';
import { IsCalendarDate } from './create-slot.dto';

/** GET /slots?from&to — both are calendar dates in the app's time zone, inclusive. */
export class ListSlotsQuery {
  @IsString()
  @IsCalendarDate()
  from: string;

  @IsString()
  @IsCalendarDate()
  to: string;
}
