import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Booking, Slot } from '@prisma/client';
import { DateTime } from 'luxon';
import { APP_CONFIG, AppConfig } from '../config';
import { MAILER, MailMessage, Mailer } from '../mail/mailer';

/** The email is a convenience: give up after this long so the visitor isn't kept waiting. */
export const EMAIL_TIMEOUT_MS = 6_000;

/** Emails the booking confirmation with the private cancellation link (FR-7). */
@Injectable()
export class BookingEmailService {
  private readonly logger = new Logger(BookingEmailService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(MAILER) private readonly mailer: Mailer | null = null,
  ) {}

  /**
   * Sends the confirmation. Returns whether it was handed to the mail server.
   * Never throws: the booking is already committed and a mail problem must not undo or fail it.
   */
  async sendConfirmation(booking: Booking, slot: Slot, manageToken: string): Promise<boolean> {
    if (!this.mailer) {
      this.logger.log('SMTP_URL is not set, so no confirmation email was sent');
      return false;
    }
    const message = this.compose(booking, slot, manageToken);
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.mailer.send(message),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`No answer within ${EMAIL_TIMEOUT_MS} ms`)), EMAIL_TIMEOUT_MS);
        }),
      ]);
      return true;
    } catch (err) {
      // The address and link are personal data and a secret, so neither goes into the log.
      this.logger.warn({ err, bookingId: booking.id }, 'Could not send the confirmation email');
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  compose(booking: Booking, slot: Slot, manageToken: string): MailMessage {
    const zone = this.config.timezone;
    const start = DateTime.fromJSDate(slot.startsAt, { zone }).setLocale('en-GB');
    const end = DateTime.fromJSDate(slot.endsAt, { zone }).setLocale('en-GB');
    const when = `${start.toFormat('cccc d LLLL yyyy')}, ${start.toFormat('HH:mm')}–${end.toFormat('HH:mm')} (${zone})`;
    const reference = booking.reference;
    const link = `${this.config.webOrigin.replace(/\/+$/, '')}/manage/${manageToken}`;
    const firstName = booking.name.trim().split(/\s+/)[0];

    const text = [
      `Hi ${firstName},`,
      '',
      `You're booked for office hours on ${when}.`,
      `Booking reference: ${reference}`,
      '',
      'Need to cancel? Use your private link, up to an hour before the start:',
      link,
      '',
      'Keep this email safe: anyone with the link can cancel the booking.',
    ].join('\n');

    const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
    <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#0062c4">Office hours</p>
    <h1 style="margin:0 0 16px;font-size:24px">You're booked, ${escapeHtml(firstName)}.</h1>
    <p style="margin:0 0 4px;font-size:16px">${escapeHtml(when)}</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6e6e73">Booking reference: <strong style="color:#1d1d1f;font-family:Menlo,Consolas,monospace">${escapeHtml(reference)}</strong></p>
    <p style="margin:0 0 12px;font-size:15px">Need to cancel? Use your private link, up to an hour before the start.</p>
    <p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0071e3;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">Manage or cancel</a></p>
    <p style="margin:0;font-size:13px;color:#6e6e73">Keep this email safe: anyone with the link can cancel the booking.<br>${escapeHtml(link)}</p>
  </div>
</body></html>`;

    return {
      to: booking.email,
      subject: `You're booked: office hours on ${start.toFormat('ccc d LLL')} at ${start.toFormat('HH:mm')}`,
      text,
      html,
    };
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
