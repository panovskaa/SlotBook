import { expect, test } from '@playwright/test';
import { HOST_KEY } from '../config';
import { bookSlot, createSlot, daysFromNow, expectAccessibleAndFits, resetDatabase, weekParam } from '../helpers';

test.beforeEach(resetDatabase);

test('FR-1, FR-8, FR-10: the host opens the dashboard, adds a slot, sees it in the calendar and deletes it', async ({
  page,
}) => {
  // Some history, so the stats and insights have something to show.
  const booked = await createSlot(daysFromNow(2), '10:00');
  await bookSlot(booked.id);
  await createSlot(daysFromNow(2), '11:00');

  await page.goto('/host');
  await expectAccessibleAndFits(page);
  await page.getByLabel('Host key').fill('not-the-key');
  await page.getByRole('button', { name: 'Open dashboard' }).click();
  await expect(page.getByRole('alert')).toContainText("That key didn't work.");

  await page.getByLabel('Host key').fill(HOST_KEY);
  await page.getByRole('button', { name: 'Open dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Published slots').locator('..')).toContainText('2');
  await expect(page.getByRole('heading', { name: 'Most-booked times' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Bookings by weekday and start hour' })).toBeAttached();
  await expectAccessibleAndFits(page);

  // Add a slot from the form.
  const day = daysFromNow(4);
  await page.getByLabel('Date').fill(day.toISODate()!);
  await page.getByLabel('Start time').fill('15:00');
  await page.getByLabel('Length').selectOption({ label: '1 h' });
  await page.getByRole('button', { name: 'Add slot' }).click();
  const dayLabel = day.setLocale('en-GB').toFormat('cccc d LLLL');
  await expect(page.getByRole('status').filter({ hasText: `Added ${dayLabel}, 15:00 – 16:00.` })).toBeVisible();
  await expect(page.getByText('Published slots').locator('..')).toContainText('3');

  // A visitor sees it.
  const visitor = await page.context().newPage();
  await visitor.goto(`/?week=${weekParam(day)}`);
  await expect(visitor.getByRole('link', { name: new RegExp(`^Book 15:00 to 16:00, ${dayLabel}`) })).toBeVisible();
  await visitor.close();

  // Delete it again, with the confirm step.
  await page.getByRole('button', { name: `Delete 15:00 – 16:00 on ${dayLabel}` }).click();
  await page.getByRole('button', { name: 'Delete 15:00 – 16:00 now' }).click();
  await expect(page.getByText('Published slots').locator('..')).toContainText('2');
  await expect(page.getByRole('button', { name: `Delete 15:00 – 16:00 on ${dayLabel}` })).toHaveCount(0);
});
