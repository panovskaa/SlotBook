import { expect, test } from '@playwright/test';
import { createSlot, daysFromNow, expectAccessibleAndFits, resetDatabase, weekParam } from '../helpers';

test.beforeEach(resetDatabase);

test('FR-2: the week lives in the URL; next, reload and Today all behave', async ({ page }) => {
  const day = daysFromNow(2);
  await createSlot(day, '10:00');
  const week = weekParam(day);

  await page.goto(`/?week=${week}`);
  const label = new RegExp(`^Book 10:00 to 10:30, ${day.setLocale('en-GB').toFormat('cccc d LLLL')}`);
  await expect(page.getByRole('link', { name: label })).toBeVisible();
  await expectAccessibleAndFits(page);

  await page.getByRole('button', { name: 'Next week' }).click();
  const next = weekParam(day.plus({ weeks: 1 }));
  await expect(page).toHaveURL(new RegExp(`week=${next}`));
  await expect(page.getByRole('link', { name: label })).toHaveCount(0);

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`week=${next}`));
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible();

  await page.getByRole('button', { name: 'Today' }).click();
  await expect(page).toHaveURL(new RegExp(`week=${weekParam(daysFromNow(0))}`));
});

test('FR-2: an empty week says so and offers the next one', async ({ page }) => {
  await page.goto(`/?week=${weekParam(daysFromNow(70))}`);
  await expect(page.getByText('No times this week.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show next week' })).toBeVisible();
  await expectAccessibleAndFits(page);
});
