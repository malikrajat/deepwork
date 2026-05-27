import { test, expect } from '@playwright/test';

test.describe('Task CRUD', () => {
  test('create, edit, and delete a task', async ({ page }) => {
    const uniq = Date.now();
    const title = `E2E Task ${uniq}`;
    const edited = `E2E Task Edited ${uniq}`;

    await page.goto('/tasks');
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });

    // -- CREATE --
    await page.getByRole('button', { name: 'Add Task' }).click();
    await expect(page.locator('.slide-panel')).toBeVisible({ timeout: 3000 });

    await page.locator('.slide-panel input[placeholder="What needs to be done?"]').fill(title);
    await page.locator('.slide-panel').getByRole('button', { name: 'Create Task' }).click();

    // Panel closes after creation
    await expect(page.locator('.slide-panel')).not.toBeVisible({ timeout: 5000 });

    // Verify the new task appears in the list
    const taskRow = page.locator('.task-row', { hasText: title });
    await expect(taskRow).toBeVisible({ timeout: 5000 });

    // -- EDIT --
    // Click on the task-info area (not on any action button) to open edit panel
    await taskRow.locator('.task-info').click();
    await expect(page.locator('.slide-panel')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.slide-panel h2')).toHaveText('Edit Task');

    const titleInput = page.locator('.slide-panel input[placeholder="What needs to be done?"]');
    await titleInput.fill(edited);
    await page.locator('.slide-panel').getByRole('button', { name: 'Save Changes' }).click();

    // Panel closes after save
    await expect(page.locator('.slide-panel')).not.toBeVisible({ timeout: 5000 });

    // Verify updated title and old title is gone
    const editedRow = page.locator('.task-row', { hasText: edited });
    await expect(editedRow).toBeVisible({ timeout: 5000 });
    await expect(taskRow).not.toBeVisible({ timeout: 3000 });

    // -- DELETE --
    await editedRow.locator('button.delete').click();
    await expect(editedRow).not.toBeVisible({ timeout: 5000 });
  });

  test('task status toggle cycles through states', async ({ page }) => {
    const title = `Status Toggle ${Date.now()}`;
    await page.goto('/tasks');
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });

    // Create task
    await page.getByRole('button', { name: 'Add Task' }).click();
    await expect(page.locator('.slide-panel')).toBeVisible();
    await page.locator('.slide-panel input[placeholder="What needs to be done?"]').fill(title);
    await page.locator('.slide-panel').getByRole('button', { name: 'Create Task' }).click();
    await expect(page.locator('.slide-panel')).not.toBeVisible({ timeout: 5000 });

    const taskRow = page.locator('.task-row', { hasText: title });
    await expect(taskRow).toBeVisible({ timeout: 5000 });

    // Status badge starts as "To Do"
    await expect(taskRow.locator('.status-tag')).toHaveText('To Do');

    // Click status button to cycle to in-progress
    await taskRow.locator('.status-btn').click();
    await expect(taskRow.locator('.status-tag')).toContainText('Progress', { timeout: 3000 });

    // Click again to cycle to done
    await taskRow.locator('.status-btn').click();
    await expect(taskRow.locator('.status-tag')).toHaveText('Done', { timeout: 3000 });

    // Cleanup
    await taskRow.locator('button.delete').click();
    await expect(taskRow).not.toBeVisible({ timeout: 5000 });
  });

  test('filter chips show correct subset of tasks', async ({ page }) => {
    const title = `Filter Test ${Date.now()}`;
    await page.goto('/tasks');
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });

    // Create a task (default status = todo)
    await page.getByRole('button', { name: 'Add Task' }).click();
    await expect(page.locator('.slide-panel')).toBeVisible();
    await page.locator('.slide-panel input[placeholder="What needs to be done?"]').fill(title);
    await page.locator('.slide-panel').getByRole('button', { name: 'Create Task' }).click();
    await expect(page.locator('.slide-panel')).not.toBeVisible({ timeout: 5000 });

    const taskRow = page.locator('.task-row', { hasText: title });
    await expect(taskRow).toBeVisible({ timeout: 5000 });

    // Filter by "Done" — task is 'todo' so should be hidden
    await page.locator('.chip', { hasText: 'Done' }).click();
    await expect(taskRow).not.toBeVisible({ timeout: 3000 });

    // Filter by "To Do" — task should appear
    await page.locator('.chip', { hasText: 'To Do' }).click();
    await expect(taskRow).toBeVisible({ timeout: 3000 });

    // Back to All
    await page.locator('.chip', { hasText: 'All' }).click();
    await expect(taskRow).toBeVisible({ timeout: 3000 });

    // Cleanup
    await taskRow.locator('button.delete').click();
    await expect(taskRow).not.toBeVisible({ timeout: 5000 });
  });

  test('search filters tasks by title', async ({ page }) => {
    const unique = `SearchMe-${Date.now()}`;
    await page.goto('/tasks');
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });

    // Create task
    await page.getByRole('button', { name: 'Add Task' }).click();
    await expect(page.locator('.slide-panel')).toBeVisible();
    await page.locator('.slide-panel input[placeholder="What needs to be done?"]').fill(unique);
    await page.locator('.slide-panel').getByRole('button', { name: 'Create Task' }).click();
    await expect(page.locator('.slide-panel')).not.toBeVisible({ timeout: 5000 });

    const taskRow = page.locator('.task-row', { hasText: unique });
    await expect(taskRow).toBeVisible({ timeout: 5000 });

    // Search for a known non-matching string
    await page.locator('.search-box input').fill('xyzzy-not-a-match');
    await expect(taskRow).not.toBeVisible({ timeout: 3000 });

    // Search for our task
    await page.locator('.search-box input').fill(unique);
    await expect(taskRow).toBeVisible({ timeout: 3000 });

    // Clear search and cleanup
    await page.locator('.search-box input').fill('');
    await taskRow.locator('button.delete').click();
    await expect(taskRow).not.toBeVisible({ timeout: 5000 });
  });
});

