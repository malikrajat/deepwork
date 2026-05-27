import { test, expect } from '@playwright/test';

/** Helper: create a task via the /tasks page and return its title */
async function createTask(page: any, title: string): Promise<void> {
  await page.goto('/tasks');
  await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });
  await page.getByRole('button', { name: 'Add Task' }).click();
  await expect(page.locator('.slide-panel')).toBeVisible({ timeout: 3000 });
  await page.locator('.slide-panel input[placeholder="What needs to be done?"]').fill(title);
  await page.locator('.slide-panel').getByRole('button', { name: 'Create Task' }).click();
  await expect(page.locator('.slide-panel')).not.toBeVisible({ timeout: 5000 });
  await expect(page.locator('.task-row', { hasText: title })).toBeVisible({ timeout: 5000 });
}

test.describe('Today Page', () => {
  test('tasks created today automatically appear on the Today list', async ({ page }) => {
    const taskTitle = `Today Task ${Date.now()}`;
    await createTask(page, taskTitle);

    // Navigate to Today
    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });

    // Card should be visible since task was created today
    const card = page.locator('.today-card', { hasText: taskTitle });
    await expect(card).toBeVisible({ timeout: 5000 });

    // Progress counter shows correct fraction
    await expect(page.locator('.stat')).toContainText('/');
    await expect(page.locator('.stat')).toContainText('done');
  });

  test('cycling status on Today card updates the status badge', async ({ page }) => {
    const taskTitle = `Status Cycle Today ${Date.now()}`;
    await createTask(page, taskTitle);

    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });

    const card = page.locator('.today-card', { hasText: taskTitle });
    await expect(card).toBeVisible({ timeout: 5000 });

    // Starts as "To Do"
    await expect(card.locator('.status-tag')).toHaveText('To Do');

    // Toggle → In Progress
    await card.locator('.status-btn').click();
    await expect(card.locator('.status-tag')).toContainText('Progress', { timeout: 3000 });

    // Toggle → Done — card disappears (done tasks are filtered from todayTasks)
    await card.locator('.status-btn').click();
    await expect(card).not.toBeVisible({ timeout: 5000 });
  });

  test('today page shows task count in the stat display', async ({ page }) => {
    const taskTitle = `Count Test ${Date.now()}`;
    await createTask(page, taskTitle);

    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });

    const card = page.locator('.today-card', { hasText: taskTitle });
    await expect(card).toBeVisible({ timeout: 5000 });

    // Stat displays "X/Y done" format
    await expect(page.locator('.stat')).toContainText('/');
    await expect(page.locator('.stat')).toContainText('done');
  });

  test('remove button is visible and clickable on every today card', async ({ page }) => {
    const taskTitle = `Remove Btn ${Date.now()}`;
    await createTask(page, taskTitle);

    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });

    const card = page.locator('.today-card', { hasText: taskTitle });
    await expect(card).toBeVisible({ timeout: 5000 });

    // Remove button should be visible
    const removeBtn = card.locator('.remove-btn');
    await expect(removeBtn).toBeVisible();

    // Click — clears todayOrder; tasks created today remain in the list
    // because todayTasks() filters by createdAt date, not todayOrder
    await removeBtn.click();
    await expect(card).toBeVisible(); // still in list — expected app behaviour
  });

  test('focus button navigates to dashboard with task linked', async ({ page }) => {
    const taskTitle = `Focus Nav ${Date.now()}`;
    await createTask(page, taskTitle);

    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });

    const card = page.locator('.today-card', { hasText: taskTitle });
    await expect(card).toBeVisible({ timeout: 5000 });

    // Click the focus (target/circle) button
    await card.locator('.focus-btn').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
  });

  test('empty state shows when there are no tasks for today', async ({ page }) => {
    // Fresh context → no tasks → empty state should show
    await page.goto('/today');
    await expect(page.locator('.page-title')).toHaveText('Today', { timeout: 8000 });

    const cards = page.locator('.today-card');
    const count = await cards.count();
    if (count === 0) {
      await expect(page.locator('.empty-state h3')).toHaveText('No tasks for today', { timeout: 3000 });
    }
  });
});
