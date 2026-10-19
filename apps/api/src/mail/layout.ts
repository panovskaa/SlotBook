import { DateTime } from 'luxon';
import { AppConfig } from '../config';

/** The parts of an email. All strings are plain text; the layout escapes them for HTML. */
export interface EmailContent {
  eyebrow: string;
  heading: string;
  /** Short paragraphs, in order. */
  lines: string[];
  button: { label: string; href: string };
  /** Small print under the button. */
  footer: string;
}

/** The HTML version: one card in the site's look, with inline styles because many mail apps drop <style>. */
export function renderEmailHtml(content: EmailContent): string {
  const lines = content.lines
    .map((line) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${escapeHtml(line)}</p>`)
    .join('\n    ');
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
    <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#0062c4">${escapeHtml(content.eyebrow)}</p>
    <h1 style="margin:0 0 16px;font-size:24px">${escapeHtml(content.heading)}</h1>
    ${lines}
    <p style="margin:12px 0 24px"><a href="${escapeHtml(content.button.href)}" style="display:inline-block;background:#0071e3;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">${escapeHtml(content.button.label)}</a></p>
    <p style="margin:0;font-size:13px;color:#6e6e73">${escapeHtml(content.footer)}<br>${escapeHtml(content.button.href)}</p>
  </div>
</body></html>`;
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** A full link to a page of the web app. */
export function webLink(config: AppConfig, path: string): string {
  return `${config.webOrigin.replace(/\/+$/, '')}${path}`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0];
}

/** "Tuesday 3 November 2026, 11:00–11:30" in the app's time zone. */
export function formatSlotTime(config: AppConfig, startsAt: Date, endsAt: Date): string {
  const start = DateTime.fromJSDate(startsAt, { zone: config.timezone }).setLocale('en-GB');
  const end = DateTime.fromJSDate(endsAt, { zone: config.timezone }).setLocale('en-GB');
  return `${start.toFormat('cccc d LLLL yyyy')}, ${start.toFormat('HH:mm')}–${end.toFormat('HH:mm')}`;
}
