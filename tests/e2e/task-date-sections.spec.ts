import { test, expect, Page } from '@playwright/test';
import { cardIn } from './board.helpers';

/** The header of the section labelled `label` ("Today", "October", …). */
const sectionHeader = (page: Page, label: string) =>
  page.locator('.group-header').filter({ hasText: label });

/** The whole section labelled `label`, board included. */
const sectionOf = (page: Page, label: string) =>
  page.locator('.date-group').filter({ has: sectionHeader(page, label) });

const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

test.describe('Tasks page date sections', () => {
  test('folds by date and keeps the board inside each section', async ({ page }) => {
    const stamp = Date.now();
    const todayTitle = `Section today ${stamp}`;
    const laterTitle = `Section later ${stamp}`;

    const later = new Date();
    later.setDate(later.getDate() + 40);
    const laterMonth = later.toLocaleDateString(undefined, { month: 'long' });
    const laterLabel =
      later.getFullYear() === new Date().getFullYear()
        ? laterMonth
        : `${laterMonth} ${later.getFullYear()}`;

    await page.goto('/tasks');
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });

    // A task due today lands in the section that is open to begin with.
    await page.getByRole('button', { name: 'Add Task' }).click();
    await page.locator('.slide-panel input[placeholder="What needs to be done?"]').fill(todayTitle);
    await page.locator('.slide-panel').getByRole('button', { name: 'Create Task' }).click();
    await expect(sectionHeader(page, 'Today')).toBeVisible({ timeout: 5000 });
    await expect(cardIn(page, 'todo', todayTitle)).toBeVisible({ timeout: 5000 });

    // A task for next month gets a section of its own — and that section opens,
    // because a task you just added must not hide behind a folded header.
    await page.getByRole('button', { name: 'Add Task' }).click();
    await page.locator('.slide-panel input[placeholder="What needs to be done?"]').fill(laterTitle);
    await page.locator('.slide-panel').getByRole('button', { name: 'Advanced options' }).click();
    await page.locator('.slide-panel input[type="date"]').first().fill(isoDay(later));
    await page.locator('.slide-panel').getByRole('button', { name: 'Create Task' }).click();
    await expect(sectionHeader(page, laterLabel)).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.task-card', { hasText: laterTitle })).toBeVisible({
      timeout: 5000,
    });
    await expect(sectionOf(page, laterLabel).locator('.board-column')).toHaveCount(3);

    // Changing status still works per section, and the reload below proves the
    // write went to the database rather than only moving the card in the DOM.
    await cardIn(page, 'todo', todayTitle).press('2');
    await expect(cardIn(page, 'in-progress', todayTitle)).toBeVisible({ timeout: 5000 });
    await expect(sectionOf(page, 'Today').locator('.task-card')).toHaveCount(1);
    await expect(sectionOf(page, laterLabel).locator('.task-card')).toHaveCount(1);

    // A section closes from its header …
    await sectionHeader(page, laterLabel).click();
    await expect(page.locator('.task-card', { hasText: laterTitle })).toHaveCount(0);

    // … and a fresh load starts with Today open and the rest folded away.
    await page.reload();
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });
    await expect(cardIn(page, 'in-progress', todayTitle)).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.task-card', { hasText: laterTitle })).toHaveCount(0);

    // With one section open, its board fills the space under the filters —
    // the scroll area is not left with a short fixed-height board.
    await expect
      .poll(() => page.locator('.date-groups').evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeLessThanOrEqual(2);

    await sectionHeader(page, laterLabel).click();
    await expect(page.locator('.task-card', { hasText: laterTitle })).toBeVisible({
      timeout: 5000,
    });

    // Collapse all folds every board away; expand all brings them back.
    await page.getByRole('button', { name: 'Collapse all' }).click();
    await expect(page.locator('.group-board')).toHaveCount(0);
    await expect(page.locator('.task-card', { hasText: todayTitle })).toHaveCount(0);
    await expect(page.locator('.task-card', { hasText: laterTitle })).toHaveCount(0);
    await page.getByRole('button', { name: 'Expand all' }).click();
    await expect(cardIn(page, 'in-progress', todayTitle)).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.task-card', { hasText: laterTitle })).toBeVisible({
      timeout: 5000,
    });

    // Expand all is the deliberate exception: each board keeps a full-height
    // view and the date area scrolls instead of squeezing the columns.
    await expect
      .poll(() => page.locator('.date-groups').evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeGreaterThan(10);

    // Cleanup
    await cardIn(page, 'in-progress', todayTitle).locator('button.delete').click();
    await expect(page.locator('.task-card', { hasText: todayTitle })).toHaveCount(0, {
      timeout: 5000,
    });
    await page.locator('.task-card', { hasText: laterTitle }).locator('button.delete').click();
    await expect(page.locator('.task-card', { hasText: laterTitle })).toHaveCount(0, {
      timeout: 5000,
    });
  });

  test('a section adds a task to its own day', async ({ page }) => {
    const stamp = Date.now();
    const anchorTitle = `Anchor tomorrow ${stamp}`;
    const addedTitle = `Added to tomorrow ${stamp}`;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = isoDay(tomorrow);

    // A task due tomorrow gives the page a Tomorrow section to add to.
    await page.goto('/tasks');
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });
    await page.getByRole('button', { name: 'Add Task' }).click();
    await page
      .locator('.slide-panel input[placeholder="What needs to be done?"]')
      .fill(anchorTitle);
    await page.locator('.slide-panel').getByRole('button', { name: 'Advanced options' }).click();
    await page.locator('.slide-panel input[type="date"]').first().fill(tomorrowIso);
    await page.locator('.slide-panel').getByRole('button', { name: 'Create Task' }).click();
    await expect(sectionHeader(page, 'Tomorrow')).toBeVisible({ timeout: 5000 });

    // The "+" in that section's header opens the form already dated for it …
    await sectionOf(page, 'Tomorrow').locator('.group-add').click();
    await expect(page.locator('.slide-panel h2')).toHaveText('New Task');
    await expect(page.locator('.slide-panel input[type="date"]').first()).toHaveValue(tomorrowIso);

    // … so what comes out of it lands in the section the button belonged to.
    await page.locator('.slide-panel input[placeholder="What needs to be done?"]').fill(addedTitle);
    await page.locator('.slide-panel').getByRole('button', { name: 'Create Task' }).click();
    await expect(
      sectionOf(page, 'Tomorrow').locator('.task-card', { hasText: addedTitle }),
    ).toBeVisible({ timeout: 5000 });

    // Cleanup
    await page.locator('.task-card', { hasText: anchorTitle }).locator('button.delete').click();
    await expect(page.locator('.task-card', { hasText: anchorTitle })).toHaveCount(0, {
      timeout: 5000,
    });
    await page.locator('.task-card', { hasText: addedTitle }).locator('button.delete').click();
    await expect(page.locator('.task-card', { hasText: addedTitle })).toHaveCount(0, {
      timeout: 5000,
    });
  });
});
