import { test, expect, type Page } from '@playwright/test';

/**
 * Pause, mute and focus, from wherever the user is.
 *
 * These three used to be reachable only from the system tray, which meant a
 * Linux session without tray icons — and every browser tab and phone — had no
 * way to stop the app talking at all. The feature is therefore not "a menu"; it
 * is that the same three controls exist on every surface and change the same
 * state. What this suite pins down:
 *
 * 1. Every entry point opens the same panel: the sidebar, the phone's top bar and
 *    Ctrl+Shift+Q.
 * 2. Pause really pauses — the timer's own Pause, not only a hidden flag — and
 *    the attention banner explains it until Resume is pressed.
 * 3. Mute and focus are separate: a mute leaves the cards, and focus mode leaves
 *    every reminder running, because a focus session is exactly when the
 *    completion alert matters.
 */

async function openQuietFromSidebar(page: Page): Promise<void> {
  await page.locator('.quiet-btn').click();
  await expect(page.locator('app-quiet-dialog #quiet-title')).toHaveText('Focus & reminders');
}

test.describe('the quiet controls on a desktop', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test('open from the sidebar and the keyboard, and close on Escape', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard');

    await openQuietFromSidebar(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('app-quiet-dialog #quiet-title')).not.toBeVisible();

    await page.keyboard.press('Control+Shift+Q');
    await expect(page.locator('app-quiet-dialog #quiet-title')).toHaveText('Focus & reminders');
    await page.keyboard.press('Escape');
    await expect(page.locator('app-quiet-dialog #quiet-title')).not.toBeVisible();
  });

  test('pause holds the timer and the reminders, and Resume hands them back', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard');

    // Start a session so the pause has a running timer to stop.
    await page.getByRole('button', { name: /start focus/i }).first().click();
    await page.waitForTimeout(300);

    await openQuietFromSidebar(page);
    // The second block is "Pause reminders"; the first is focus mode.
    await page.locator('app-quiet-dialog .quiet-block').nth(1).getByRole('button', { name: '30 min' }).click();

    await expect(page.locator('app-quiet-dialog .quiet-state')).toContainText('Paused');
    await expect(page.locator('app-attention-banner .banner-text')).toContainText('paused');

    await page
      .locator('app-quiet-dialog')
      .getByRole('button', { name: 'Resume', exact: true })
      .click();

    await expect(page.locator('app-quiet-dialog .quiet-state')).toHaveText('Reminders on');
    await expect(page.locator('app-attention-banner .banner-text')).not.toBeVisible();
  });

  test('a mute is a length of time, and Sound on ends it', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard');

    await openQuietFromSidebar(page);
    await page
      .locator('app-quiet-dialog .quiet-block')
      .nth(2)
      .getByRole('button', { name: '1 hour' })
      .click();

    await expect(page.locator('app-quiet-dialog .quiet-state')).toContainText('Sound muted until');

    await page.locator('app-quiet-dialog').getByRole('button', { name: 'Sound on' }).click();
    await expect(page.locator('app-quiet-dialog .quiet-state')).toHaveText('Reminders on');
  });

  test('focus mode hides the navigation and can be left from the panel', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard');

    await openQuietFromSidebar(page);
    await page.locator('app-quiet-dialog').getByRole('button', { name: 'Enter focus' }).click();

    await expect(page.locator('app-sidebar')).toHaveCount(0);
    await expect(page.locator('.exit-focus-btn')).toBeVisible();
    await expect(page.locator('app-quiet-dialog .quiet-state')).toHaveText('Focus mode on');

    await page.locator('app-quiet-dialog').getByRole('button', { name: 'Exit focus' }).click();
    await expect(page.locator('app-sidebar')).toBeVisible();
  });

  test('the settings page carries the same controls and the same state', async ({ page }) => {
    await page.goto('/dashboard');
    await openQuietFromSidebar(page);
    await page.locator('app-quiet-dialog .quiet-block').nth(1).getByRole('button', { name: '1 hour' }).click();
    await page.keyboard.press('Escape');

    await page.goto('/settings');
    await expect(page.locator('.page-title').first()).toHaveText('Settings');

    // The card on the page reads the same state the dialog changed.
    await expect(page.locator('app-quiet-panel .quiet-state').first()).toContainText('Paused');
    await expect(page.locator('app-quiet-panel .quiet-block').first()).toBeVisible();
  });
});

test.describe('the quiet controls on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('open from the top bar as a sheet, with thumb-sized answers', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard');

    await page.locator('.mobile-quiet-btn').click();
    const sheet = page.locator('app-quiet-dialog .quiet-sheet');
    await expect(sheet).toBeVisible();

    // The sheet comes up from the bottom edge and spans the phone.
    const box = await sheet.boundingBox();
    expect(box!.width).toBeGreaterThan(370);
    expect(Math.round(box!.y + box!.height)).toBeGreaterThanOrEqual(840);

    // Every answer is at least a fingertip tall.
    const pauseMinutes = page
      .locator('app-quiet-dialog .quiet-block')
      .nth(1)
      .getByRole('button', { name: '30 min' });
    const chip = await pauseMinutes.boundingBox();
    expect(chip!.height).toBeGreaterThanOrEqual(44);

    await pauseMinutes.click();
    await expect(page.locator('app-quiet-dialog .quiet-state')).toContainText('Paused');
  });
});
