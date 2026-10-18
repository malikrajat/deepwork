import { test, expect } from '@playwright/test';

/**
 * The app knows whether it is a tab, an installed web app or the desktop app,
 * and says so differently in each.
 *
 * Running as a tab, it must offer installation — at the top of the window while
 * the user is looking, and through the Notification API while they are not (that
 * half is unit-tested, because a real permission prompt is not something a test
 * should answer). Running installed, it must stop offering, and instead answer
 * the question that follows: how to start it with the computer, and the one
 * always-on-top a browser can give.
 *
 * What is checked here is the part that can be seen: the bar, the explanation,
 * the dismissal that survives a reload, and the Settings card that never claims
 * a capability the browser does not have.
 */
test.describe('the install bar in a browser tab', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test('offers installation and explains how this browser does it', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard');

    const banner = page.locator('.install-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Install');

    // Headless Chromium has not fired `beforeinstallprompt`, so the honest
    // control is "How", not an Install button that would do nothing.
    await banner.locator('.btn-install').click();

    const dialog = page.locator('app-install-dialog');
    await expect(dialog.locator('#install-dialog-title')).toHaveText('Install DeepWork');
    await expect(dialog).toContainText('How to install in this browser');
    await expect(dialog).toContainText('Nothing leaves this device');

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog.locator('#install-dialog-title')).not.toBeVisible();
  });

  test('a dismissed bar stays dismissed across a reload, and can be brought back', async ({
    page,
  }) => {
    await page.goto('/settings');
    await expect(page.locator('.page-title').first()).toHaveText('Settings');

    await page.locator('.install-banner .btn-dismiss').click();
    await expect(page.locator('.install-banner')).toHaveCount(0);

    await page.reload();
    await expect(page.locator('.page-title').first()).toHaveText('Settings');
    await expect(page.locator('.install-banner')).toHaveCount(0);

    // Settings is where the decision can be undone.
    await page.getByRole('button', { name: /show the install prompt again/i }).click();
    await expect(page.locator('app-install-dialog #install-dialog-title')).toHaveText(
      'Install DeepWork',
    );
    await page.locator('app-install-dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.install-banner')).toBeVisible();
  });

  test('Settings describes what installation adds instead of faking the switches', async ({
    page,
  }) => {
    await page.goto('/settings');
    await expect(page.locator('.page-title').first()).toHaveText('Settings');

    const behaviour = page.locator('.setting-group', { hasText: 'APP BEHAVIOUR' });
    await expect(behaviour).toBeVisible();
    await expect(behaviour).toContainText('Installing gives DeepWork a window');
    // No switch is offered where the browser would ignore it.
    await expect(behaviour.locator('[role="switch"]')).toHaveCount(0);
  });
});

test.describe('the install offer on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('speaks about a home screen rather than a desktop', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard');

    const banner = page.locator('.install-banner');
    await expect(banner).toContainText('home screen');

    await banner.locator('.btn-install').click();
    const dialog = page.locator('app-install-dialog');
    await expect(dialog).toContainText('home-screen icon');
    await expect(dialog).toContainText('On a phone, DeepWork installs to your home screen');
  });
});
