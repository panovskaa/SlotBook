import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { DateTime } from 'luxon';
import { Client } from 'pg';
import { API_URL, E2E_DATABASE_URL, HOST_KEY, TIMEZONE } from './config';

/** Empties every table, so each test starts from nothing. */
export async function resetDatabase(): Promise<void> {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    await db.query('TRUNCATE "booking", "waitlist_entry", "slot" RESTART IDENTITY CASCADE');
  } finally {
    await db.end();
  }
}

/** A calendar date some days from now, in the app's time zone. */
export function daysFromNow(days: number): DateTime {
  return DateTime.now().setZone(TIMEZONE).plus({ days }).startOf('day');
}

/** The ?week= value that shows a date in the calendar. */
export const weekParam = (date: DateTime) => `${date.weekYear}-W${String(date.weekNumber).padStart(2, '0')}`;

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API_URL + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const body = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${JSON.stringify(body)}`);
  return body as T;
}

export interface CreatedSlot {
  id: string;
  startsAt: string;
}

/** Arranges data through the real API, as the host would. */
export function createSlot(date: DateTime, startTime: string, durationMinutes = 30): Promise<CreatedSlot> {
  return api('/host/slots', {
    method: 'POST',
    headers: { 'X-Host-Key': HOST_KEY },
    body: JSON.stringify({ date: date.toISODate(), startTime, durationMinutes }),
  });
}

export function bookSlot(slotId: string, name = 'Grace Hopper', email = 'grace@example.com') {
  return api<{ reference: string; manageToken: string; managePath: string }>('/bookings', {
    method: 'POST',
    body: JSON.stringify({ slotId, name, email }),
  });
}

export function cancelBooking(token: string) {
  return api(`/manage/${token}/cancel`, { method: 'POST' });
}

/**
 * NFR-1 and NFR-2 on the page as it is now: no WCAG 2.1 A/AA violations from axe, and nothing
 * wider than the screen.
 */
export async function expectAccessibleAndFits(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const violations = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(violations, 'axe violations').toEqual([]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}
