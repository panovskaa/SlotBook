import { expect, test } from '@playwright/test';
import { createSlot, daysFromNow, expectAccessibleAndFits, resetDatabase, weekParam } from '../helpers';

test.beforeEach(resetDatabase);

test('FR-3: a visitor books a slot and lands on the confirmation', async ({ page }) => {
  const day = daysFromNow(2);
  await createSlot(day, '14:00', 45);
  const dayLabel = day.setLocale('en-GB').toFormat('cccc d LLLL');

  await page.goto(`/?week=${weekParam(day)}`);
  await page.getByRole('link', { name: new RegExp(`^Book 14:00 to 14:45, ${dayLabel}`) }).click();

  await expect(page.getByRole('heading', { name: 'Confirm your booking' })).toBeVisible();
  await expect(page.getByText(dayLabel)).toBeVisible();
  await expectAccessibleAndFits(page);

  // Inline validation before anything is sent.
  const submit = page.getByRole('button', { name: 'Book this time' });
  await expect(submit).toBeDisabled();
  await page.getByLabel('Your name').fill('A');
  await page.getByLabel('Email address').click();
  await expect(page.getByLabel('Your name')).toHaveAttribute('aria-invalid', 'true');
  await expectAccessibleAndFits(page);

  await page.getByLabel('Your name').fill('Ada Lovelace');
  await page.getByLabel('Email address').fill('ada@example.com');
  await submit.click();

  await expect(page.getByRole('heading', { name: "You're booked." })).toBeFocused();
  await expect(page.getByText(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/)).toBeVisible();
  await expect(page.getByLabel('Private cancellation link')).toHaveValue(/\/manage\/[A-Za-z0-9_-]{43}$/);
  await expectAccessibleAndFits(page);

  // Everyone now sees it as booked.
  await page.getByRole('link', { name: 'Back to all times' }).click();
  await page.goto(`/?week=${weekParam(day)}`);
  await expect(page.getByRole('group', { name: '14:00 to 14:45, booked' })).toBeVisible();
});
