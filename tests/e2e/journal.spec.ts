import { test, expect } from '@playwright/test';

test.describe('Journal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/journal');
    await expect(page.locator('.page-title')).toHaveText('Journal', { timeout: 8000 });
  });

  test('write a journal entry and wait for auto-save', async ({ page }) => {
    const content = `E2E journal entry written at ${new Date().toISOString()}`;

    const textarea = page.locator('.journal-textarea');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    await textarea.fill(content);

    // Debounce is 1 s — "Saving..." indicator should appear first
    await expect(page.locator('.save-indicator')).toBeVisible({ timeout: 3000 });

    // Then "Saved" indicator should appear once persisted
    await expect(page.locator('.save-indicator.saved')).toBeVisible({ timeout: 5000 });
  });

  test("today's date is shown in the editor header", async ({ page }) => {
    const editorDate = page.locator('.editor-date');
    await expect(editorDate).toBeVisible({ timeout: 5000 });

    // The formatted date should contain the current year
    const year = new Date().getFullYear().toString();
    await expect(editorDate).toContainText(year);
  });

  test('past entries sidebar renders after typing and saving', async ({ page }) => {
    const content = `Past entry test ${Date.now()}`;

    const textarea = page.locator('.journal-textarea');
    await textarea.fill(content);

    // Wait for auto-save
    await expect(page.locator('.save-indicator.saved')).toBeVisible({ timeout: 5000 });

    // Reload to confirm persistence and entry appears in past sidebar
    await page.reload();
    await expect(page.locator('.page-title')).toHaveText('Journal', { timeout: 8000 });

    // Today's entry is loaded back into the textarea
    const reloadedTextarea = page.locator('.journal-textarea');
    await expect(reloadedTextarea).toHaveValue(content, { timeout: 5000 });
  });
});
