import { DateTime } from 'luxon';
import { AppConfig } from '../config';
import { firstName, formatSlotTime, renderEmailHtml, webLink } from '../mail/layout';
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
      "If a time opens up that day, we'll email you straight away, with a link to book it.",
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
        "If a time opens up that day, we'll email you straight away, with a link to book it.",
      ],
      button: { label: 'Check the waitlist', href: link },
      footer: 'Keep this email safe: the link is private to you.',
    }),
  };
}

/** Sent when a slot on the date opens up. The button books that exact slot. */
export function slotOpenedEmail(
  config: AppConfig,
  entry: { name: string; email: string },
  slot: { slotId: string; startsAt: Date; endsAt: Date },
): MailMessage {
  const name = firstName(entry.name);
  const when = formatSlotTime(config, slot.startsAt, slot.endsAt);
  const start = DateTime.fromJSDate(slot.startsAt, { zone: config.timezone }).setLocale('en-GB');
  const link = webLink(config, `/book/${slot.slotId}`);
  return {
    to: entry.email,
    subject: `A slot opened up! Office hours on ${start.toFormat('ccc d LLL')} at ${start.toFormat('HH:mm')}`,
    text: [
      `Hi ${name},`,
      '',
      `A slot opened up! ${when} (${config.timezone}) is free again.`,
      'Book it now, before someone else does:',
      link,
      '',
      'Everyone on the waitlist for this day gets this email, so it goes to whoever books first.',
    ].join('\n'),
    html: renderEmailHtml({
      eyebrow: 'Waitlist',
      heading: 'A slot opened up!',
      lines: [`Hi ${name}, ${when} (${config.timezone}) is free again.`, 'Book it now, before someone else does.'],
      button: { label: `Book ${start.toFormat('HH:mm')}`, href: link },
      footer: 'Everyone on the waitlist for this day gets this email, so it goes to whoever books first.',
    }),
  };
}
