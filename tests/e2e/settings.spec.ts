import { test, expect } from '@playwright/test';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('.page-title')).toHaveText('Settings', { timeout: 8000 });
    // Wait for async init to populate form values
    await page.waitForTimeout(500);
  });

  test('all setting groups render', async ({ page }) => {
    await expect(page.locator('.group-header', { hasText: 'Timer' })).toBeVisible();
    await expect(page.locator('.group-header', { hasText: 'Notifications' })).toBeVisible();
    await expect(page.locator('.group-header', { hasText: 'Behavior' })).toBeVisible();
    await expect(page.locator('.group-header', { hasText: 'Data' })).toBeVisible();
    await expect(page.locator('.group-header', { hasText: 'Keyboard Shortcuts' })).toBeVisible();
  });

  test('focus duration slider shows value in minutes', async ({ page }) => {
    const focusItem = page.locator('.setting-item').filter({ hasText: 'Focus Duration' });
    await expect(focusItem).toBeVisible({ timeout: 5000 });

    const slider = focusItem.locator('input[type="range"]');
    await expect(slider).toBeVisible();

    // Current slider value should be a valid positive number
    const val = await slider.inputValue();
    expect(Number(val)).toBeGreaterThan(0);

    // Range value label should show "min"
    await expect(focusItem.locator('.range-value')).toContainText('min');
  });

  test('short break slider shows value in minutes', async ({ page }) => {
    const shortBreakItem = page.locator('.setting-item').filter({ hasText: 'Short Break' });
    await expect(shortBreakItem).toBeVisible({ timeout: 5000 });

    const slider = shortBreakItem.locator('input[type="range"]');
    await expect(slider).toBeVisible();
    await expect(shortBreakItem.locator('.range-value')).toContainText('min');
  });

  test('notification sound dropdown switches options', async ({ page }) => {
    const soundItem = page.locator('.setting-item').filter({ hasText: 'Sound' }).first();
    await expect(soundItem).toBeVisible({ timeout: 5000 });

    const select = soundItem.locator('select');
    await expect(select).toBeVisible();

    // Cycle through all sound options
    for (const sound of ['bell', 'chime', 'ding', 'none']) {
      await select.selectOption(sound);
      await expect(select).toHaveValue(sound);
    }

    // Restore default
    await select.selectOption('bell');
  });

  test('close action dropdown switches between minimize and quit', async ({ page }) => {
    const trayItem = page.locator('.setting-item').filter({ hasText: 'Close Action' });
    await expect(trayItem).toBeVisible({ timeout: 5000 });

    const select = trayItem.locator('select');
    await select.selectOption('quit');
    await expect(select).toHaveValue('quit');

    await select.selectOption('minimize');
    await expect(select).toHaveValue('minimize');
  });

  test('export and import buttons are clickable', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: 'Export JSON' });
    const importBtn = page.getByRole('button', { name: 'Import' });

    await expect(exportBtn).toBeVisible({ timeout: 5000 });
    await expect(importBtn).toBeVisible({ timeout: 5000 });

    await expect(exportBtn).toBeEnabled();
    await expect(importBtn).toBeEnabled();
  });

  test('keyboard shortcuts section lists 5 shortcut rows', async ({ page }) => {
    const shortcutsGroup = page.locator('.setting-group').filter({
      has: page.locator('.group-header', { hasText: 'Keyboard Shortcuts' }),
    });
    await expect(shortcutsGroup).toBeVisible({ timeout: 5000 });

    // Exactly 5 keyboard shortcut rows with <kbd> elements
    await expect(shortcutsGroup.locator('kbd')).toHaveCount(5);
  });

  test('repeat reminder interval shows seconds label', async ({ page }) => {
    const repeatItem = page.locator('.setting-item').filter({ hasText: 'Repeat Reminder' });
    await expect(repeatItem).toBeVisible({ timeout: 5000 });
    await expect(repeatItem.locator('.range-value')).toContainText('sec');
  });
});
