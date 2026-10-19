import { expect, test } from '@playwright/test';
import { bookSlot, createSlot, daysFromNow, expectAccessibleAndFits, resetDatabase, weekParam } from '../helpers';

test.beforeEach(resetDatabase);

test('FR-7: the private link cancels the booking and frees the slot', async ({ page }) => {
  const day = daysFromNow(3);
  const slot = await createSlot(day, '09:00');
  const booking = await bookSlot(slot.id, 'Ada Lovelace', 'ada@example.com');

  await page.goto(booking.managePath);
  await expect(page.getByRole('heading', { name: 'Your booking' })).toBeVisible();
  await expect(page.getByText(booking.reference)).toBeVisible();
  await expectAccessibleAndFits(page);

  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await expect(page.getByText(/^Cancel your booking for/)).toBeFocused();
  await expectAccessibleAndFits(page);
  await page.getByRole('button', { name: 'Yes, cancel booking' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Your booking is cancelled.' })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'This booking is cancelled.' })).toBeVisible();
  await expectAccessibleAndFits(page);

  await page.goto(`/?week=${weekParam(day)}`);
  await expect(page.getByRole('link', { name: /^Book 09:00 to 09:30/ })).toBeVisible();
});

test('FR-7: a wrong link says so without revealing anything', async ({ page }) => {
  await page.goto(`/manage/${'a'.repeat(43)}`);
  await expect(page.getByRole('alert')).toContainText("This link doesn't match a booking.");
  await expectAccessibleAndFits(page);
});
