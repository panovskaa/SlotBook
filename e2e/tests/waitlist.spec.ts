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

test('FR-9: join the waitlist for a fully booked day, then see the slot that opens up', async ({ page }) => {
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

  // The booker cancels, so the slot opens up.
  await cancelBooking(booking.manageToken);
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByRole('heading', { name: 'A slot opened up!' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(`^Book 13:00 to 13:30, ${dayLabel}`) })).toBeVisible();
  await expectAccessibleAndFits(page);

  // The calendar says so too.
  await page.goto(`/?week=${weekParam(day)}`);
  await expect(page.getByRole('region', { name: new RegExp(dayLabel) }).getByText('A slot opened up!')).toBeVisible();
});
