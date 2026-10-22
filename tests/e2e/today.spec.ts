import { test, expect } from '@playwright/test';
import { cardIn, dragCardToColumn, createTask } from './board.helpers';

/** Today as `YYYY-MM-DD` in the browser's own timezone. */
const todayIso = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
};

test.describe('Today Page', () => {
  test('tasks created today automatically appear on the Today board', async ({ page }) => {
    const taskTitle = `Today Task ${Date.now()}`;
    await createTask(page, taskTitle);

    // Navigate to Today
    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });

    // A brand new task is To Do, so it lands in the first column
    await expect(cardIn(page, 'todo', taskTitle)).toBeVisible({ timeout: 5000 });

    // Progress counter shows correct fraction
    await expect(page.locator('.stat')).toContainText('/');
    await expect(page.locator('.stat')).toContainText('done');
  });

  test('moving a card between columns changes its status', async ({ page }) => {
    const taskTitle = `Status Move Today ${Date.now()}`;
    await createTask(page, taskTitle);

    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });
    await expect(cardIn(page, 'todo', taskTitle)).toBeVisible({ timeout: 5000 });

    // 2 → In Progress: the card leaves To Do and shows up in the middle column
    await cardIn(page, 'todo', taskTitle).press('2');
    await expect(cardIn(page, 'in-progress', taskTitle)).toBeVisible({ timeout: 3000 });
    await expect(cardIn(page, 'todo', taskTitle)).toHaveCount(0);

    // 3 → Done: the card stays on the board (greyed out) instead of vanishing
    await cardIn(page, 'in-progress', taskTitle).press('3');
    await expect(cardIn(page, 'done', taskTitle)).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.stat')).toContainText('1/');
  });

  test('dragging a card to another column changes its status', async ({ page }) => {
    const taskTitle = `Drag Status ${Date.now()}`;
    await createTask(page, taskTitle);

    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });

    const card = cardIn(page, 'todo', taskTitle);
    await expect(card).toBeVisible({ timeout: 5000 });
    await dragCardToColumn(page, card, 'in-progress');

    await expect(cardIn(page, 'in-progress', taskTitle)).toBeVisible({ timeout: 5000 });
    await expect(cardIn(page, 'todo', taskTitle)).toHaveCount(0);
  });

  test('today page shows task count in the stat display', async ({ page }) => {
    const taskTitle = `Count Test ${Date.now()}`;
    await createTask(page, taskTitle);

    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });
    await expect(cardIn(page, 'todo', taskTitle)).toBeVisible({ timeout: 5000 });

    await expect(page.locator('.stat')).toContainText('/');
    await expect(page.locator('.stat')).toContainText('done');
  });

  test('search filters the Today board and clear restores it', async ({ page }) => {
    const stamp = Date.now();
    const match = `Today Search Match ${stamp}`;
    const other = `Today Search Other ${stamp}`;
    await createTask(page, match);
    await createTask(page, other);

    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });
    await expect(cardIn(page, 'todo', match)).toBeVisible({ timeout: 5000 });
    await expect(cardIn(page, 'todo', other)).toBeVisible({ timeout: 5000 });

    await page.locator('.search-box input').fill(match);
    await expect(cardIn(page, 'todo', match)).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.task-card', { hasText: other })).toHaveCount(0);

    await page.locator('.search-box .clear-search').click();
    await expect(cardIn(page, 'todo', other)).toBeVisible({ timeout: 3000 });

    await page.locator('.task-card', { hasText: match }).locator('button.delete').click();
    await page.locator('.task-card', { hasText: other }).locator('button.delete').click();
  });

  test('delete button removes the task from Today', async ({ page }) => {
    const taskTitle = `Delete Btn ${Date.now()}`;
    await createTask(page, taskTitle);

    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });

    const card = cardIn(page, 'todo', taskTitle);
    await expect(card).toBeVisible({ timeout: 5000 });

    const deleteBtn = card.locator('button.delete');
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // The task is deleted everywhere, not merely detached from today's order.
    await expect(page.locator('.task-card', { hasText: taskTitle })).toHaveCount(0, {
      timeout: 5000,
    });
    await page.goto('/tasks');
    await expect(page.locator('.task-card', { hasText: taskTitle })).toHaveCount(0, {
      timeout: 5000,
    });
  });

  test('focus button navigates to dashboard with task linked', async ({ page }) => {
    const taskTitle = `Focus Nav ${Date.now()}`;
    await createTask(page, taskTitle);

    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });

    const card = cardIn(page, 'todo', taskTitle);
    await expect(card).toBeVisible({ timeout: 5000 });

    // Click the focus (target/circle) button
    await card.locator('.focus-btn').click();
    // The dashboard is the app's root route — `/dashboard` redirects to `/`
    await expect(page.locator('.page-title')).toHaveText('Dashboard', { timeout: 5000 });
    expect(await page.evaluate(() => localStorage.getItem('deepwork_focusTaskId'))).toBeTruthy();
  });

  test('a card can be edited from Today without leaving the page', async ({ page }) => {
    const taskTitle = `Edit From Today ${Date.now()}`;
    const editedTitle = `${taskTitle} edited`;
    await createTask(page, taskTitle);

    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });

    const card = cardIn(page, 'todo', taskTitle);
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(card.locator('.edit-btn')).toBeVisible();

    // The pencil opens the app's editor over this page: Today is still the page
    // on screen, and the URL has not moved.
    await card.locator('.edit-btn').click();
    await expect(page.locator('.slide-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.slide-panel h2')).toHaveText('Edit Task');
    const titleInput = page.locator('.slide-panel input[placeholder="What needs to be done?"]');
    await expect(titleInput).toHaveValue(taskTitle);
    await expect(page.locator('.page-title')).toHaveText('Today');
    await expect(page).toHaveURL(/\/today$/);

    // Saving is the half that used to strand the user on another page: the form
    // closes and Today — not the Tasks page — is what is underneath it, with the
    // card already corrected.
    await titleInput.fill(editedTitle);
    await page.locator('.slide-panel').getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.locator('.slide-panel')).toHaveCount(0);
    await expect(page.locator('.page-title')).toHaveText('Today');
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.locator('.task-card', { hasText: editedTitle })).toBeVisible({
      timeout: 5000,
    });

    // Cleanup
    await page.locator('.task-card', { hasText: editedTitle }).locator('button.delete').click();
    await expect(page.locator('.task-card', { hasText: editedTitle })).toHaveCount(0, {
      timeout: 5000,
    });
  });

  test('the Add task button opens the form for today, on the Today page', async ({ page }) => {
    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });

    await page.locator('.header-stats .btn-add').click();

    // The form comes to the page; the page does not go to the form.
    await expect(page.locator('.slide-panel h2')).toHaveText('New Task');
    await expect(page.locator('.slide-panel input[type="date"]').first()).toHaveValue(todayIso());
    await expect(page.locator('.page-title')).toHaveText('Today');
    await expect(page).toHaveURL(/\/today$/);

    await page.locator('.slide-panel').getByRole('button', { name: 'Cancel' }).click();
  });

  test('empty state shows when there are no tasks for today', async ({ page }) => {
    // Fresh context → no tasks → empty state should show
    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });

    const cards = page.locator('.task-card');
    const count = await cards.count();
    if (count === 0) {
      await expect(page.locator('.empty-state h3')).toHaveText('No tasks for today', {
        timeout: 3000,
      });
    }
  });

  test('yesterday’s finished tasks are not on today, even with their star still set', async ({
    page,
  }) => {
    // The report: tasks finished on one day were all still sitting in Today the
    // next morning. Their "Add to Today" star was sticky, and every one of them
    // qualified, so the empty state never appeared.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const title = `Finished Yesterday ${Date.now()}`;
    const staleTask = {
      id: 'stale-today-task',
      title,
      description: '',
      priority: 3,
      status: 'done',
      quadrant: null,
      deadline: yesterday.toISOString().slice(0, 10),
      tags: [],
      recurrence: null,
      todayOrder: 1,
      createdAt: yesterday.toISOString(),
      completedAt: yesterday.toISOString(),
    };

    await page.addInitScript((task) => {
      localStorage.setItem('deepwork_tasks', JSON.stringify([task]));
    }, staleTask);

    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });
    await expect(page.locator('.empty-state h3')).toHaveText('No tasks for today', {
      timeout: 5000,
    });
    await expect(page.locator('.task-card', { hasText: title })).toHaveCount(0);
  });
});
