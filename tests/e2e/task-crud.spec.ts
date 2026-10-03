import { test, expect } from '@playwright/test';
import { cardIn, column, createTask } from './board.helpers';

test.describe('Task CRUD', () => {
  test('create, edit, and delete a task', async ({ page }) => {
    const uniq = Date.now();
    const title = `E2E Task ${uniq}`;
    const edited = `E2E Task Edited ${uniq}`;

    await createTask(page, title);
    const taskCard = page.locator('.task-card', { hasText: title });

    // -- EDIT --
    // Click the card body (not an action button) to open the edit panel
    await taskCard.locator('.card-body').click();
    await expect(page.locator('.slide-panel')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.slide-panel h2')).toHaveText('Edit Task');

    const titleInput = page.locator('.slide-panel input[placeholder="What needs to be done?"]');
    await titleInput.fill(edited);
    await page.locator('.slide-panel').getByRole('button', { name: 'Save Changes' }).click();

    // Panel closes after save
    await expect(page.locator('.slide-panel')).not.toBeVisible({ timeout: 5000 });

    // Verify updated title and old title is gone
    const editedCard = page.locator('.task-card', { hasText: edited });
    await expect(editedCard).toBeVisible({ timeout: 5000 });
    await expect(taskCard).not.toBeVisible({ timeout: 3000 });

    // -- DELETE --
    await editedCard.locator('button.delete').click();
    await expect(editedCard).not.toBeVisible({ timeout: 5000 });
  });

  test('moving a task between status columns updates its status', async ({ page }) => {
    const title = `Status Board ${Date.now()}`;
    await createTask(page, title);

    // A new task starts in the To Do column
    await expect(cardIn(page, 'todo', title)).toBeVisible({ timeout: 5000 });

    // 2 → In Progress
    await cardIn(page, 'todo', title).press('2');
    await expect(cardIn(page, 'in-progress', title)).toBeVisible({ timeout: 3000 });
    await expect(cardIn(page, 'todo', title)).toHaveCount(0);

    // 3 → Done
    await cardIn(page, 'in-progress', title).press('3');
    await expect(cardIn(page, 'done', title)).toBeVisible({ timeout: 3000 });

    // Cleanup
    await cardIn(page, 'done', title).locator('button.delete').click();
    await expect(page.locator('.task-card', { hasText: title })).toHaveCount(0, { timeout: 5000 });
  });

  test('the board has a column per status and no filter pills', async ({ page }) => {
    const title = `Columns Test ${Date.now()}`;
    await createTask(page, title);

    await expect(page.locator('.board-column')).toHaveCount(3);
    await expect(column(page, 'todo').locator('.column-title')).toHaveText('To Do');
    await expect(column(page, 'in-progress').locator('.column-title')).toHaveText('In Progress');
    await expect(column(page, 'done').locator('.column-title')).toHaveText('Done');

    // The old status pills are gone — the columns are the filter
    await expect(page.locator('.chip')).toHaveCount(0);

    // Cleanup
    await page.locator('.task-card', { hasText: title }).locator('button.delete').click();
    await expect(page.locator('.task-card', { hasText: title })).toHaveCount(0, { timeout: 5000 });
  });

  test('search filters tasks by title', async ({ page }) => {
    const unique = `SearchMe-${Date.now()}`;
    await createTask(page, unique);

    const taskCard = page.locator('.task-card', { hasText: unique });
    await expect(taskCard).toBeVisible({ timeout: 5000 });

    // The search field and the sort dropdown are the same control height, and
    // a one-line card stays compact instead of reserving empty vertical space.
    const searchHeight = await page.locator('.search-box').evaluate(el => el.getBoundingClientRect().height);
    const sortHeight = await page.locator('.sort-control select').evaluate(el => el.getBoundingClientRect().height);
    expect(Math.abs(searchHeight - sortHeight)).toBeLessThanOrEqual(1);
    const cardHeight = await taskCard.evaluate(el => el.getBoundingClientRect().height);
    expect(cardHeight).toBeLessThanOrEqual(60);

    // Search for a known non-matching string
    await page.locator('.search-box input').fill('xyzzy-not-a-match');
    await expect(taskCard).not.toBeVisible({ timeout: 3000 });

    // Search for our task
    await page.locator('.search-box input').fill(unique);
    await expect(taskCard).toBeVisible({ timeout: 3000 });

    // Clear search and cleanup
    await page.locator('.search-box input').fill('');
    await taskCard.locator('button.delete').click();
    await expect(taskCard).not.toBeVisible({ timeout: 5000 });
  });

  test('reopening Add Task starts with a pristine form', async ({ page }) => {
    const title = `Pristine Form ${Date.now()}`;
    await page.goto('/tasks');
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });

    const addButton = page.getByRole('button', { name: 'Add Task' });
    const titleInput = page.locator('.slide-panel input[placeholder="What needs to be done?"]');

    // Submitting a valid task is what marks the fields touched/submitted.
    await addButton.click();
    await titleInput.fill(title);
    await titleInput.press('Enter');
    await expect(page.locator('.slide-panel')).not.toBeVisible({ timeout: 5000 });

    // A fresh Add Task panel must not inherit those validation messages.
    await addButton.click();
    await expect(page.locator('.slide-panel')).toBeVisible();
    await expect(titleInput).toHaveValue('');
    await expect(page.locator('.slide-panel .error-message')).toHaveCount(0);

    // Once the user interacts, validation still works.
    await titleInput.fill('x');
    await titleInput.fill('');
    await titleInput.blur();
    await expect(page.locator('.slide-panel .error-message').first()).toBeVisible();

    await page.locator('.slide-panel').getByRole('button', { name: 'Cancel' }).click();
    await page.locator('.task-card', { hasText: title }).locator('button.delete').click();
    await expect(page.locator('.task-card', { hasText: title })).toHaveCount(0, { timeout: 5000 });
  });

  test('opening Add Task starts in the title field', async ({ page }) => {
    const title = `Focus Check ${Date.now()}`;
    await page.goto('/tasks');
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });

    const addButton = page.getByRole('button', { name: 'Add Task' });
    const titleInput = page.locator('.slide-panel input[placeholder="What needs to be done?"]');

    await addButton.click();
    await expect(page.locator('.slide-panel')).toBeVisible({ timeout: 3000 });
    await expect(titleInput).toBeFocused();

    // Typing lands in the title without clicking the field first.
    await page.keyboard.type('Typed without clicking');
    await expect(titleInput).toHaveValue('Typed without clicking');

    await page.locator('.slide-panel').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.slide-panel')).not.toBeVisible();

    // Editing an existing task focuses its title too.
    await createTask(page, title);
    const card = page.locator('.task-card', { hasText: title });
    await card.locator('.card-body').click();
    await expect(page.locator('.slide-panel')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.slide-panel h2')).toHaveText('Edit Task');
    await expect(titleInput).toBeFocused();

    await page.locator('.slide-panel').getByRole('button', { name: 'Cancel' }).click();
    await card.locator('button.delete').click();
    await expect(card).toHaveCount(0, { timeout: 5000 });
  });
});
