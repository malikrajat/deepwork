import { test, expect } from '@playwright/test';

test.describe('Eisenhower Matrix', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/matrix');
    await expect(page.locator('.page-title')).toHaveText('Eisenhower Matrix', { timeout: 8000 });
    await page.waitForTimeout(400); // allow async init
  });

  test('four quadrants render with headers', async ({ page }) => {
    const quadrants = page.locator('.quadrant');
    await expect(quadrants).toHaveCount(4, { timeout: 5000 });

    // Labels come from QUADRANT_CONFIG: Do First / Schedule / Delegate / Eliminate
    await expect(page.locator('.quadrant-header h3', { hasText: 'Do First' })).toBeVisible();
    await expect(page.locator('.quadrant-header h3', { hasText: 'Schedule' })).toBeVisible();
    await expect(page.locator('.quadrant-header h3', { hasText: 'Delegate' })).toBeVisible();
    await expect(page.locator('.quadrant-header h3', { hasText: 'Eliminate' })).toBeVisible();
  });

  test('each quadrant has a task drop zone', async ({ page }) => {
    const dropZones = page.locator('.task-drop-zone');
    await expect(dropZones).toHaveCount(4, { timeout: 5000 });
  });

  test('unassigned panel renders', async ({ page }) => {
    const panel = page.locator('.unassigned-panel');
    await expect(panel).toBeVisible({ timeout: 5000 });
    await expect(panel.locator('.panel-title')).toContainText('Unassigned');
  });

  test('quadrant descriptions are shown', async ({ page }) => {
    await expect(page.locator('.quadrant-desc').first()).toBeVisible({ timeout: 5000 });
    const descs = page.locator('.quadrant-desc');
    await expect(descs).toHaveCount(4);
  });

  test('tasks created with a quadrant appear in the correct quadrant', async ({ page }) => {
    const taskTitle = `Matrix Q1 ${Date.now()}`;

    // Create a task and assign it to "urgent-important" (Q1) via tasks page
    await page.goto('/tasks');
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });
    await page.getByRole('button', { name: 'Add Task' }).click();
    await expect(page.locator('.slide-panel')).toBeVisible();

    await page.locator('.slide-panel input[placeholder="What needs to be done?"]').fill(taskTitle);
    // Slide panel select order: 0=Priority, 1=Quadrant, 2=Repeat
    await page.locator('.slide-panel select').nth(1).selectOption('urgent-important');
    await page.locator('.slide-panel').getByRole('button', { name: 'Create Task' }).click();
    await expect(page.locator('.slide-panel')).not.toBeVisible({ timeout: 5000 });

    // Navigate to matrix
    await page.goto('/matrix');
    await expect(page.locator('.page-title')).toHaveText('Eisenhower Matrix', { timeout: 8000 });
    await page.waitForTimeout(600);

    // Task should appear in the "urgent-important" quadrant (class="quadrant urgent-important")
    const q1 = page.locator('.quadrant.urgent-important');
    await expect(q1).toBeVisible({ timeout: 5000 });
    await expect(q1.locator('.card-title', { hasText: taskTitle })).toBeVisible({ timeout: 5000 });
  });

  test('unassigned task appears in the unassigned panel', async ({ page }) => {
    const taskTitle = `Unassigned Matrix ${Date.now()}`;

    // Create a task with no quadrant
    await page.goto('/tasks');
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });
    await page.getByRole('button', { name: 'Add Task' }).click();
    await expect(page.locator('.slide-panel')).toBeVisible();
    await page.locator('.slide-panel input[placeholder="What needs to be done?"]').fill(taskTitle);
    // Leave quadrant as "Unassigned" (default)
    await page.locator('.slide-panel').getByRole('button', { name: 'Create Task' }).click();
    await expect(page.locator('.slide-panel')).not.toBeVisible({ timeout: 5000 });

    await page.goto('/matrix');
    await expect(page.locator('.page-title')).toHaveText('Eisenhower Matrix', { timeout: 8000 });
    await page.waitForTimeout(600);

    // Should appear in the unassigned panel
    const panel = page.locator('.unassigned-panel');
    await expect(panel.locator('.card-title', { hasText: taskTitle })).toBeVisible({ timeout: 5000 });
  });
});
