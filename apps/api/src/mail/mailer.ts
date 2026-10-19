import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Anything that can send an email. SMTP in production and local dev (Mailpit); a fake in tests. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Injection token. Resolves to null when SMTP_URL isn't set, so emails are skipped (and logged). */
export const MAILER = Symbol('MAILER');

/** Sends through any SMTP server, given as smtp://user:pass@host:port (smtps:// for TLS). */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    // Short timeouts: a slow mail server must never hold up the booking response for long.
    this.transport = createTransport(url, {
      connectionTimeout: 3_000,
      greetingTimeout: 3_000,
      socketTimeout: 5_000,
    } as Parameters<typeof createTransport>[1]);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}
