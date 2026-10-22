import { test, expect } from '@playwright/test';

/**
 * The standing reminder, from the page the user writes it on to the card that
 * will not leave. The point of the feature is that the card is still there when
 * the moment has passed, so the test writes a reminder for yesterday and checks
 * that it is already standing — the same path a closed laptop takes.
 */
test.describe('Standing reminders', () => {
  test.beforeEach(async ({ page }) => {
    // Each test starts with its own list: the app stores reminders in
    // localStorage, and a previous test's reminder must not answer for this one.
    await page.addInitScript(() => globalThis.localStorage?.clear());
    await page.goto('/reminders');
    await expect(page.locator('.page-title').first()).toHaveText('Reminders', { timeout: 8000 });
  });

  test('writes one down and answers it from the card', async ({ page }) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = [
      yesterday.getFullYear(),
      `${yesterday.getMonth() + 1}`.padStart(2, '0'),
      `${yesterday.getDate()}`.padStart(2, '0'),
    ].join('-');

    await page.locator('#reminder-title').fill('Presentation — Room 4');
    await page.locator('#reminder-note').fill('Slides on the desktop');
    await page.locator('#reminder-date').fill(date);
    await page.locator('#reminder-time').fill('09:00');

    await page.getByRole('button', { name: 'Start standing' }).click();

    // A moment in the past is not refused: it is already standing.
    const card = page.locator('.reminder-card');
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(card.locator('.reminder-title')).toHaveText('Presentation — Room 4');
    await expect(card.locator('.reminder-eyebrow')).toContainText('Standing reminder');

    await card.getByRole('button', { name: 'Done' }).click();

    await expect(card).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('#finished-title')).toBeVisible();
    await expect(page.locator('.row.finished .row-title').first()).toHaveText(
      'Presentation — Room 4',
    );
  });

  test('snoozes one without losing it', async ({ page }) => {
    await page.locator('#reminder-title').fill('Call home');
    await page.locator('#reminder-date').fill('2020-01-01');
    await page.locator('#reminder-time').fill('09:00');
    await page.getByRole('button', { name: 'Start standing' }).click();

    const card = page.locator('.reminder-card');
    await expect(card).toBeVisible({ timeout: 5000 });

    await card.getByRole('button', { name: 'Snooze 10 min' }).click();
    await expect(card).not.toBeVisible({ timeout: 5000 });

    // It is not finished and not gone: it is coming up, ten minutes on.
    await expect(page.locator('#coming-title')).toBeVisible();
    await expect(page.locator('.row-title', { hasText: 'Call home' })).toBeVisible();
  });
});
