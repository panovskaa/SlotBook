import { Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { APP_CONFIG, AppConfig } from '../config';

export const MESSAGE_MAX_LENGTH = 300;

/**
 * Writes the confirmation message shown after booking. For now this is the template that FR-11
 * falls back to; the Gemini call will slot in here with the template as its fallback.
 */
@Injectable()
export class ConfirmationMessageService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async compose(fullName: string, startsAt: Date): Promise<string> {
    return this.template(fullName, startsAt);
  }

  template(fullName: string, startsAt: Date): string {
    const local = DateTime.fromJSDate(startsAt, { zone: this.config.timezone }).setLocale('en-GB');
    const firstName = fullName.trim().split(/\s+/)[0];
    const message = `Thanks, ${firstName}. You're booked for ${local.toFormat('cccc d LLLL')} at ${local.toFormat('HH:mm')}. See you then.`;
    return message.slice(0, MESSAGE_MAX_LENGTH);
  }
}
