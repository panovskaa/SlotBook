import { expect, test } from '@playwright/test';
import {
  bookSlot,
  cancelBooking,
  createSlot,
  daysFromNow,
  expectAccessibleAndFits,
  resetDatabase,
  weekParam,
} from '../helpers';

test.beforeEach(resetDatabase);

test('FR-9: join the waitlist for a fully booked day, then get the slot when it frees up', async ({ page }) => {
  const day = daysFromNow(3);
  const slot = await createSlot(day, '13:00');
  const booking = await bookSlot(slot.id);
  const dayLabel = day.setLocale('en-GB').toFormat('cccc d LLLL');

  await page.goto(`/?week=${weekParam(day)}`);
  const dayRegion = page.getByRole('region', { name: new RegExp(dayLabel) });
  await expect(dayRegion.getByText('Fully booked')).toBeVisible();
  await dayRegion.getByRole('link', { name: `Join the waitlist for ${dayLabel}` }).click();

  await expect(page.getByRole('heading', { name: 'Join the waitlist' })).toBeVisible();
  await expectAccessibleAndFits(page);
  await page.getByLabel('Your name').fill('Ada Lovelace');
  await page.getByLabel('Email address').fill('ada@example.com');
  await page.getByRole('button', { name: 'Join the waitlist' }).click();

  await expect(page.getByRole('heading', { name: "You're on the waitlist." })).toBeFocused();
  await expect(page.getByLabel('Private waitlist link')).toHaveValue(/\/waitlist\/[A-Za-z0-9_-]{43}$/);
  await expectAccessibleAndFits(page);

  // The booker cancels. The slot goes straight to Ada, first on the waitlist.
  await cancelBooking(booking.manageToken);
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByRole('heading', { name: 'You got a slot!' })).toBeVisible();
  await expect(page.getByText('13:00 – 13:30')).toBeVisible();
  await expect(page.getByText('Booked for you', { exact: true })).toBeVisible();
  await expectAccessibleAndFits(page);

  // It never shows as free in the calendar: the day is still fully booked.
  await page.goto(`/?week=${weekParam(day)}`);
  await expect(page.getByRole('region', { name: new RegExp(dayLabel) }).getByText('Fully booked')).toBeVisible();
});
