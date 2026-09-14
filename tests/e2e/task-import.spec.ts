import { test, expect } from '@playwright/test';

const CSV = [
  'Title,Description,Priority,Quadrant,Deadline,Status,Repeat,Tags,Add to Today',
  '"Imported one","from a csv file","P1","Urgent + Important","2027-03-01","In Progress","Daily","work","Yes"',
  '"Imported two","","P4","Neither","","To Do","No repeat","","No"',
  '"Imported three","","not a priority","","","","","",""',
].join('\n');

test.describe('Task import from spreadsheet', () => {
  test('shows a preview for an uploaded csv and imports the valid rows', async ({ page }) => {
    const unique = `Imported ${Date.now()}`;
    const csv = CSV.replace('Imported one', unique);

    await page.goto('/tasks');
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });

    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.locator('.import-modal')).toBeVisible({ timeout: 3000 });

    await page
      .locator('.import-modal input[type="file"]')
      .setInputFiles({ name: 'tasks.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });

    // Preview: three data rows, one of them invalid.
    await expect(page.locator('.import-modal tbody tr')).toHaveCount(3, { timeout: 5000 });
    await expect(page.locator('.stat.ready')).toContainText('2 ready');
    await expect(page.locator('.stat.error')).toContainText('1 skipped');
    await expect(page.locator('.import-modal tbody tr.error')).toHaveCount(1);

    // Only the two valid rows are imported.
    await page.getByRole('button', { name: 'Import 2 task(s)' }).click();
    await expect(page.locator('.done-state h3')).toContainText('2 task(s) added', { timeout: 8000 });
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.locator('.import-modal')).not.toBeVisible();

    // The tasks now exist in the list.
    const importedRow = page.locator('.task-row', { hasText: unique });
    await expect(importedRow).toBeVisible({ timeout: 5000 });
    await expect(importedRow.locator('.status-tag')).toHaveText('In Progress');
    await expect(importedRow.locator('.priority-badge')).toHaveText('P1');
    await expect(importedRow.locator('.meta-badge.recurring')).toContainText('daily');
    await expect(importedRow.locator('.meta-badge.quadrant')).toContainText('Do First');

    // Cleanup
    await importedRow.locator('button.delete').click();
    await expect(importedRow).not.toBeVisible({ timeout: 5000 });
    const secondRow = page.locator('.task-row', { hasText: 'Imported two' });
    if (await secondRow.count()) await secondRow.locator('button.delete').click();
  });

  test('rejects a sheet without a Title column', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });

    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page
      .locator('.import-modal input[type="file"]')
      .setInputFiles({
        name: 'owner-list.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('Owner,Sprint\nme,12\n', 'utf8'),
      });

    await expect(page.locator('.import-modal .alert')).toContainText('No Title column found', {
      timeout: 5000,
    });
  });

  test('offers the Excel template download', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });

    await page.getByRole('button', { name: 'Import', exact: true }).click();
    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download template' }).click(),
    ]).then(([event]) => event);

    const today = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const expectedName = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.xlsx`;
    expect(download.suggestedFilename()).toBe(expectedName);
  });
});
