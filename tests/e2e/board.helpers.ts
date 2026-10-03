import { expect, Locator, Page } from '@playwright/test';
import { TaskStatus } from '../../src/app/core/models/task.model';

/**
 * Shared helpers for the status board that the Tasks and Today pages both
 * render: three columns, `.task-card`s inside them, status in the class name.
 */

/** One status column of the board. */
export const column = (page: Page, status: TaskStatus) =>
  page.locator(`.board-column.status-${status}`);

/** The card for `title` as it currently sits in `status`. */
export const cardIn = (page: Page, status: TaskStatus, title: string) =>
  column(page, status).locator('.task-card', { hasText: title });

/**
 * Drag a card into a column the way a person does.
 *
 * `locator.dragTo()` moves the pointer in a single hop, which is below the CDK
 * drag threshold, so the drag never starts — the card has to be moved in steps
 * with the button held.
 *
 * NOTE: CDK only sometimes finishes a synthetic drag here (the drop can land
 * back in the source column, or the drag never ends), so a test that only looks
 * at where the card ended up can pass without the status ever being written.
 * Assert the change in the data (or after a reload) when the status matters.
 */
export async function dragCardToColumn(page: Page, card: Locator, status: TaskStatus): Promise<void> {
  const source = await card.boundingBox();
  const target = await column(page, status).boundingBox();
  if (!source || !target) throw new Error('Card or column is not visible');

  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2 + 12, { steps: 4 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
}

/** Create a task from the Tasks page and wait for its card to appear. */
export async function createTask(page: Page, title: string): Promise<void> {
  await page.goto('/tasks');
  await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });
  await page.getByRole('button', { name: 'Add Task' }).click();
  await expect(page.locator('.slide-panel')).toBeVisible({ timeout: 3000 });
  await page.locator('.slide-panel input[placeholder="What needs to be done?"]').fill(title);
  await page.locator('.slide-panel').getByRole('button', { name: 'Create Task' }).click();
  await expect(page.locator('.slide-panel')).not.toBeVisible({ timeout: 5000 });
  await expect(page.locator('.task-card', { hasText: title })).toBeVisible({ timeout: 5000 });
}
