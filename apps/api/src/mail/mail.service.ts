import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { MAILER, MailMessage, Mailer } from './mailer';

/** An email is a convenience: give up after this long so nobody is kept waiting. */
export const EMAIL_TIMEOUT_MS = 6_000;

/** Sends every email the app writes: booking confirmations and waitlist messages. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(@Optional() @Inject(MAILER) private readonly mailer: Mailer | null = null) {}

  /**
   * Hands one email to the mail server. Returns whether that worked. Never throws: emails are sent
   * after the real work (a booking, a cancellation) is saved, and a mail problem must not undo it.
   * `context` names what the email is about in the log; the address and links stay out of it.
   */
  async send(message: MailMessage, context: Record<string, unknown> = {}): Promise<boolean> {
    if (!this.mailer) {
      this.logger.log({ ...context, subject: message.subject }, 'SMTP_URL is not set, so this email was not sent');
      return false;
    }
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
      this.logger.warn({ err, ...context, subject: message.subject }, 'Could not send an email');
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
