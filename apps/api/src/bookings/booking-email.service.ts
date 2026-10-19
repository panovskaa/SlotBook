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

  /**
   * Sends the confirmation. Returns whether it was handed to the mail server; never throws.
   * `fromWaitlist`: the slot freed up and was booked for this person because they were first in line.
   */
  sendConfirmation(
    booking: Booking,
    slot: Slot,
    manageToken: string,
    options: { fromWaitlist?: boolean } = {},
  ): Promise<boolean> {
    return this.mail.send(this.compose(booking, slot, manageToken, options), { bookingId: booking.id });
  }

  compose(booking: Booking, slot: Slot, manageToken: string, options: { fromWaitlist?: boolean } = {}): MailMessage {
    const when = `${formatSlotTime(this.config, slot.startsAt, slot.endsAt)} (${this.config.timezone})`;
    const start = DateTime.fromJSDate(slot.startsAt, { zone: this.config.timezone }).setLocale('en-GB');
    const shortWhen = `${start.toFormat('ccc d LLL')} at ${start.toFormat('HH:mm')}`;
    const reference = booking.reference;
    const link = webLink(this.config, `/manage/${manageToken}`);
    const name = firstName(booking.name);
    const cancelLine = options.fromWaitlist
      ? "Can't make it after all? Cancel with your private link, up to an hour before the start, and the time goes to the next person waiting."
      : 'Need to cancel? Use your private link, up to an hour before the start.';
    const footer = 'Keep this email safe: anyone with the link can cancel the booking.';

    const intro = options.fromWaitlist
      ? [
          "A slot opened up, and it's yours!",
          `You were first on the waitlist, so we booked office hours for you on ${when}.`,
        ]
      : [`You're booked for office hours on ${when}.`];

    return {
      to: booking.email,
      subject: options.fromWaitlist
        ? `A slot opened up, and it's yours: office hours on ${shortWhen}`
        : `You're booked: office hours on ${shortWhen}`,
      text: [`Hi ${name},`, '', ...intro, `Booking reference: ${reference}`, '', cancelLine, link, '', footer].join(
        '\n',
      ),
      html: renderEmailHtml(
        options.fromWaitlist
          ? {
              eyebrow: 'Waitlist',
              heading: "A slot opened up, and it's yours!",
              lines: [
                `Hi ${name}, you were first on the waitlist, so we booked it for you.`,
                when,
                `Booking reference: ${reference}`,
                cancelLine,
              ],
              button: { label: 'Manage or cancel', href: link },
              footer,
            }
          : {
              eyebrow: 'Office hours',
              heading: `You're booked, ${name}.`,
              lines: [when, `Booking reference: ${reference}`, cancelLine],
              button: { label: 'Manage or cancel', href: link },
              footer,
            },
      ),
    };
  }
}
