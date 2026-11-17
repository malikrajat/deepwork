import { test, expect } from '@playwright/test';

/**
 * The Dashboard's new keyboard and assistive-technology surface.
 *
 * These are behaviours a screenshot cannot prove: that the clock has a name, that
 * the first Tab reaches the content, that Ctrl+K is a real combobox and that a
 * focused button keeps Space for itself instead of starting the timer twice.
 */
test.describe('Dashboard accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard', { timeout: 8000 });
  });

  test('the timer, goals and cycle expose names and live state', async ({ page }) => {
    const timer = page.getByRole('timer');
    await expect(timer).toBeVisible();
    await expect(timer).toHaveAttribute(
      'aria-label',
      /(Focus Session|Short Break|Long Break): \d{2}:\d{2}/,
    );

    await expect(page.getByRole('progressbar', { name: 'Daily focus goal' })).toHaveAttribute(
      'aria-valuetext',
      /\d+ of 8 focus sessions completed today/,
    );
    await expect(
      page.getByRole('progressbar', { name: 'Progress through the current session cycle' }),
    ).toBeVisible();

    // The state is text as well as colour.
    await expect(page.locator('.header-live')).toContainText(/(ready|in progress)/i);
    await expect(page.locator('.page-subtitle')).toContainText('·');
    await expect(page.locator('.page-subtitle')).not.toContainText('Â');
    await expect(page.locator('.mode-chip')).toContainText(
      /(Focus Session|Short Break|Long Break)/,
    );
    await expect(page.locator('.cycle-status')).toHaveText(/In progress|Long break ready/);
  });

  test('the skip link is the first tab stop and moves focus to the content', async ({ page }) => {
    await page.keyboard.press('Tab');
    const focusedText = await page.evaluate(() => document.activeElement?.textContent?.trim());
    expect(focusedText).toContain('Skip to content');

    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('Ctrl+K opens a real combobox, filters and closes on Escape', async ({ page }) => {
    await page.keyboard.press('Control+k');

    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette).toBeVisible();

    const input = palette.getByRole('combobox', { name: 'Search commands' });
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('aria-expanded', 'true');

    await input.fill('settings');
    await expect(palette.getByRole('option')).toHaveCount(1);
    await expect(palette.getByRole('option')).toContainText('Open Settings');

    await page.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);
  });

  test('a command runs and navigates from the palette', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    const input = palette.getByRole('combobox', { name: 'Search commands' });
    await input.fill('open tasks');
    const options = palette.getByRole('option');
    // "Focus the next task" also mentions "open tasks" in its hint; the command
    // whose *name* matches sorts first, and Enter runs the selected row.
    await expect(options.first()).toContainText('Open Tasks');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/tasks$/);
    await expect(page.locator('.page-title').first()).toHaveText('Tasks', { timeout: 8000 });
  });

  test('the shortcut panel is reachable and closes on Escape', async ({ page }) => {
    await page.keyboard.press('Shift+Slash');

    const dialog = page.getByRole('dialog', { name: 'Shortcuts' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Start or pause the timer');
    await expect(dialog).toContainText('Open the command palette');

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('a focused button keeps Space and the timer stays ready', async ({ page }) => {
    const shortcutsButton = page.getByRole('button', { name: 'Keyboard shortcuts' });
    await shortcutsButton.focus();
    await page.keyboard.press('Space');

    await expect(page.getByRole('dialog', { name: 'Shortcuts' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pause$/ })).toHaveCount(0);
  });

  test('S skips to the next phase from the keyboard', async ({ page }) => {
    await expect(page.locator('.mode-chip')).toContainText('Focus Session');
    await page.keyboard.press('s');
    await expect(page.locator('.mode-chip')).toContainText('Short Break');
  });

  test('fullscreen takes focus and Escape brings the page back', async ({ page }) => {
    await page.locator('.card-actions .action-btn').last().click();
    await expect(page.getByRole('dialog', { name: 'Focus timer fullscreen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Focus timer fullscreen' })).toHaveCount(0);
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard');
  });

  test('reduced motion turns the page animations off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard');

    const animation = await page
      .locator('.main-row')
      .evaluate((element) => getComputedStyle(element).animationName);
    expect(animation).toBe('none');
  });

  test('the live rail says so when the day has no sessions', async ({ page }) => {
    await expect(page.locator('.live-empty')).toContainText('No sessions yet');
    await expect(page.locator('.live-empty').getByRole('button')).toHaveText(
      'Start your first session',
    );
  });
});
