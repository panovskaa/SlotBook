import { Inject, Injectable } from '@nestjs/common';
import { Booking, Slot } from '@prisma/client';
import { DateTime } from 'luxon';
import { APP_CONFIG, AppConfig } from '../config';
import { firstName, formatSlotTime, renderEmailHtml, webLink } from '../mail/layout';
import { MailService } from '../mail/mail.service';
import { MailMessage } from '../mail/mailer';

/** Emails the booking confirmation with the private cancellation link (FR-7). */
@Injectable()
export class BookingEmailService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly mail: MailService,
  ) {}

  /** Sends the confirmation. Returns whether it was handed to the mail server; never throws. */
  sendConfirmation(booking: Booking, slot: Slot, manageToken: string): Promise<boolean> {
    return this.mail.send(this.compose(booking, slot, manageToken), { bookingId: booking.id });
  }

  compose(booking: Booking, slot: Slot, manageToken: string): MailMessage {
    const when = `${formatSlotTime(this.config, slot.startsAt, slot.endsAt)} (${this.config.timezone})`;
    const start = DateTime.fromJSDate(slot.startsAt, { zone: this.config.timezone }).setLocale('en-GB');
    const reference = booking.reference;
    const link = webLink(this.config, `/manage/${manageToken}`);
    const name = firstName(booking.name);

    const text = [
      `Hi ${name},`,
      '',
      `You're booked for office hours on ${when}.`,
      `Booking reference: ${reference}`,
      '',
      'Need to cancel? Use your private link, up to an hour before the start:',
      link,
      '',
      'Keep this email safe: anyone with the link can cancel the booking.',
    ].join('\n');

    return {
      to: booking.email,
      subject: `You're booked: office hours on ${start.toFormat('ccc d LLL')} at ${start.toFormat('HH:mm')}`,
      text,
      html: renderEmailHtml({
        eyebrow: 'Office hours',
        heading: `You're booked, ${name}.`,
        lines: [
          when,
          `Booking reference: ${reference}`,
          'Need to cancel? Use your private link, up to an hour before the start.',
        ],
        button: { label: 'Manage or cancel', href: link },
        footer: 'Keep this email safe: anyone with the link can cancel the booking.',
      }),
    };
  }
}
