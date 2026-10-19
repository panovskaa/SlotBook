import { DateTime } from 'luxon';
import { AppConfig } from '../config';
import { firstName, renderEmailHtml, webLink } from '../mail/layout';
import { MailMessage } from '../mail/mailer';

function longDate(date: string): string {
  return DateTime.fromISO(date, { locale: 'en-GB' }).toFormat('cccc d LLLL');
}

/** Sent on joining: confirms the date and carries the private status link (FR-9). */
export function joinedEmail(
  config: AppConfig,
  entry: { name: string; email: string },
  date: string,
  statusToken: string,
): MailMessage {
  const day = longDate(date);
  const name = firstName(entry.name);
  const link = webLink(config, `/waitlist/${statusToken}`);
  return {
    to: entry.email,
    subject: `You're on the waitlist for ${day}`,
    text: [
      `Hi ${name},`,
      '',
      `You're on the waitlist for office hours on ${day}.`,
      "If a time opens up that day and you're first in line, we'll book it for you and email you the details.",
      '',
      'Check your place on the waitlist any time:',
      link,
      '',
      'Keep this email safe: the link is private to you.',
    ].join('\n'),
    html: renderEmailHtml({
      eyebrow: 'Waitlist',
      heading: `You're on the waitlist, ${name}.`,
      lines: [
        `Office hours on ${day} are fully booked right now.`,
        "If a time opens up that day and you're first in line, we'll book it for you and email you the details.",
      ],
      button: { label: 'Check the waitlist', href: link },
      footer: 'Keep this email safe: the link is private to you.',
    }),
  };
}
