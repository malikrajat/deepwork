import { test, expect } from '@playwright/test';

test.describe('Journal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/journal');
    await expect(page.locator('.page-title')).toHaveText('Journal', { timeout: 8000 });
  });

  test('write a journal entry and wait for auto-save', async ({ page }) => {
    const content = `E2E journal entry written at ${new Date().toISOString()}`;

    // The page writes through the rich text editor, whose editing surface is a
    // contenteditable rather than a textarea.
    const editor = page.locator('.journal-editor .editor-content');
    await expect(editor).toBeVisible({ timeout: 5000 });

    await editor.fill(content);

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

    const editor = page.locator('.journal-editor .editor-content');
    await editor.fill(content);

    // Wait for auto-save
    await expect(page.locator('.save-indicator.saved')).toBeVisible({ timeout: 5000 });

    // Reload to confirm persistence and entry appears in past sidebar
    await page.reload();
    await expect(page.locator('.page-title')).toHaveText('Journal', { timeout: 8000 });

    // Today's entry is loaded back into the editor
    const reloadedEditor = page.locator('.journal-editor .editor-content');
    await expect(reloadedEditor).toHaveText(content, { timeout: 5000 });
  });

  test('the entry is also rendered read-only below the editor', async ({ page }) => {
    const content = `Preview test ${Date.now()}`;

    await page.locator('.journal-editor .editor-content').fill(content);

    const preview = page.locator('.preview-card .preview-surface');
    await expect(preview).toBeVisible({ timeout: 5000 });
    await expect(preview).toContainText(content);
    await expect(page.locator('.preview-card .read-badge')).toHaveText('Read mode');
  });

  test('the card switches to read mode and back to writing', async ({ page }) => {
    const content = `Read mode test ${Date.now()}`;

    await page.locator('.journal-editor .editor-content').fill(content);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();

    await expect(page.locator('.editor-card .preview-surface')).toContainText(content);
    await expect(page.locator('.journal-editor')).toHaveCount(0);

    await page.getByRole('button', { name: 'Back to writing' }).click();
    await expect(page.locator('.journal-editor .editor-content')).toHaveText(content);
  });
});
