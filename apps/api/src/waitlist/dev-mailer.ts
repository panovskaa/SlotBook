import { Injectable, Logger } from '@nestjs/common';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

/**
 * A4: no real email is sent. This development mailer writes each "email" to the server log, so a
 * notification can be seen without a mail server. Swap it for a real provider to send for real.
 */
@Injectable()
export class DevMailer {
  private readonly logger = new Logger('DevMailer');

  async send(email: OutgoingEmail): Promise<void> {
    this.logger.log({ email }, `Email to ${email.to}: ${email.subject}`);
  }
}
