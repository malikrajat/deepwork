import { test, expect } from '@playwright/test';

test.describe('Quick add task dialog', () => {
  test('the dialog opens with the cursor in the title field', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });

    const dialog = page.locator('.qa-dialog');
    const titleInput = dialog.locator('input[placeholder="What needs to be done?"]');

    await page.locator('.qa-fab').click();
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(titleInput).toBeFocused();

    // Typing lands in the title without clicking the field first.
    await page.keyboard.type('Typed without clicking');
    await expect(titleInput).toHaveValue('Typed without clicking');

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();

    // Opening it again focuses the title again, not the leftover close button.
    await page.locator('.qa-fab').click();
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(titleInput).toBeFocused();
    await expect(titleInput).toHaveValue('');

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('Ctrl+N opens the dialog with the cursor in the title field', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });

    const dialog = page.locator('.qa-dialog');
    const titleInput = dialog.locator('input[placeholder="What needs to be done?"]');

    await page.keyboard.press('Control+n');
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(titleInput).toBeFocused();

    // Pressing it again must not throw away a half-typed task.
    await titleInput.fill('Half typed');
    await page.keyboard.press('Control+n');
    await expect(titleInput).toHaveValue('Half typed');
    await expect(titleInput).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });
});
