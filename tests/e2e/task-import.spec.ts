import { test, expect } from '@playwright/test';
import { cardIn } from './board.helpers';

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

    // The tasks now exist on the board, in the column that matches the sheet.
    const importedCard = cardIn(page, 'in-progress', unique);
    await expect(importedCard).toBeVisible({ timeout: 5000 });
    await expect(importedCard.locator('.priority-badge')).toHaveText('P1');
    await expect(importedCard.locator('.meta-badge.recurring')).toContainText('daily');
    await expect(importedCard.locator('.meta-badge.quadrant')).toContainText('Do First');

    // Cleanup
    await importedCard.locator('button.delete').click();
    await expect(importedCard).not.toBeVisible({ timeout: 5000 });
    const secondCard = cardIn(page, 'todo', 'Imported two');
    if (await secondCard.count()) await secondCard.locator('button.delete').click();
  });

  /**
   * The date decides the day. A sheet for the rest of the week used to arrive as
   * a pile of today's work, because a row imported today counted as today's task
   * whatever date it carried.
   */
  test('files a row dated for another day under that day, not on today', async ({ page }) => {
    const unique = `Future row ${Date.now()}`;
    const future = new Date();
    future.setDate(future.getDate() + 3);
    const pad = (value: number) => String(value).padStart(2, '0');
    const iso = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}`;
    const csv = `Title,Deadline,Add to Today\n"${unique}","${iso}","No"\n`;

    await page.goto('/tasks');
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });

    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page
      .locator('.import-modal input[type="file"]')
      .setInputFiles({ name: 'future.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
    await expect(page.locator('.import-modal tbody tr')).toHaveCount(1, { timeout: 5000 });
    await page.getByRole('button', { name: 'Import 1 task(s)' }).click();
    await expect(page.locator('.done-state h3')).toContainText('1 task(s) added', { timeout: 8000 });
    await page.getByRole('button', { name: 'Done', exact: true }).click();

    // The Tasks page opens the section it landed in, so the row is visible...
    const imported = page.locator('.task-card', { hasText: unique });
    await expect(imported).toBeVisible({ timeout: 5000 });

    // ...and today's board is today's: the future row is not on it.
    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });
    await expect(page.locator('.task-card', { hasText: unique })).toHaveCount(0);

    // Cleanup.
    await page.goto('/tasks');
    const card = page.locator('.task-card', { hasText: unique });
    await expect(card).toBeVisible({ timeout: 5000 });
    await card.locator('button.delete').click();
    await expect(card).toHaveCount(0, { timeout: 5000 });
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
