import { Booking, Slot } from '@prisma/client';
import { AppConfig } from '../config';
import { MailMessage, Mailer } from '../mail/mailer';
import { BookingEmailService, EMAIL_TIMEOUT_MS } from './booking-email.service';

const CONFIG = { timezone: 'Europe/Berlin', webOrigin: 'https://book.example.com/' } as AppConfig;
const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz0123456789ABCDE';
const BOOKING = {
  id: 'b1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  reference: 'K7M2-QX9P',
} as Booking;
const SLOT = { startsAt: new Date('2026-11-03T10:00:00Z'), endsAt: new Date('2026-11-03T10:30:00Z') } as Slot;

class RecordingMailer implements Mailer {
  sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
  }
}

describe('BookingEmailService', () => {
  it('emails the private cancellation link, the reference and the local time', async () => {
    const mailer = new RecordingMailer();
    const service = new BookingEmailService(CONFIG, mailer);

    await expect(service.sendConfirmation(BOOKING, SLOT, TOKEN)).resolves.toBe(true);

    expect(mailer.sent).toHaveLength(1);
    const [mail] = mailer.sent;
    expect(mail.to).toBe('ada@example.com');
    expect(mail.subject).toBe("You're booked: office hours on Tue 3 Nov at 11:00");
    const link = `https://book.example.com/manage/${TOKEN}`;
    expect(mail.text).toContain(link);
    expect(mail.text).toContain('Tuesday 3 November 2026, 11:00–11:30 (Europe/Berlin)');
    expect(mail.text).toContain('K7M2-QX9P');
    expect(mail.text).toContain('Hi Ada,');
    expect(mail.html).toContain(`href="${link}"`);
  });

  it('escapes the name in the HTML version', () => {
    const service = new BookingEmailService(CONFIG, null);
    const mail = service.compose({ ...BOOKING, name: '<b>Eve</b> X' }, SLOT, TOKEN);
    expect(mail.html).toContain('&lt;b&gt;Eve&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>Eve</b>');
  });

  it('returns false without a mailer (SMTP_URL not set)', async () => {
    const service = new BookingEmailService(CONFIG, null);
    await expect(service.sendConfirmation(BOOKING, SLOT, TOKEN)).resolves.toBe(false);
  });

  it('returns false instead of throwing when the mail server fails', async () => {
    const mailer: Mailer = { send: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const service = new BookingEmailService(CONFIG, mailer);
    await expect(service.sendConfirmation(BOOKING, SLOT, TOKEN)).resolves.toBe(false);
  });

  it('gives up on a mail server that never answers', async () => {
    jest.useFakeTimers();
    try {
      const mailer: Mailer = { send: () => new Promise(() => {}) };
      const service = new BookingEmailService(CONFIG, mailer);
      const result = service.sendConfirmation(BOOKING, SLOT, TOKEN);
      await jest.advanceTimersByTimeAsync(EMAIL_TIMEOUT_MS);
      await expect(result).resolves.toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
