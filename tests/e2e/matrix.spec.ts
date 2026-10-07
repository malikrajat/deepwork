import { test, expect, Page } from '@playwright/test';

/** Create an unassigned task from the Tasks page. */
async function createMatrixTask(page: Page, title: string): Promise<void> {
  await page.goto('/tasks');
  await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });
  await page.getByRole('button', { name: 'Add Task' }).click();
  await expect(page.locator('.slide-panel')).toBeVisible();
  await page.locator('.slide-panel input[placeholder="What needs to be done?"]').fill(title);
  await page.locator('.slide-panel').getByRole('button', { name: 'Create Task' }).click();
  await expect(page.locator('.slide-panel')).not.toBeVisible({ timeout: 5000 });
}

test.describe('Eisenhower Matrix', () => {
  /**
   * The matrix only draws its quadrants when there is a task to sort: with none,
   * the page is an empty state pointing at the Tasks page (covered below). So
   * every test here starts with one task on the board, created the way a user
   * would — through the slide panel.
   */
  test.beforeEach(async ({ page }) => {
    await createMatrixTask(page, `Seed ${Date.now()}`);
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
    // Priority and quadrant live behind "Advanced options", and the quadrant is
    // the second select in there: 0=Priority, 1=Quadrant, 2=Repeat.
    await page.locator('.slide-panel').getByRole('button', { name: 'Advanced options' }).click();
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
    await expect(panel.locator('.card-title', { hasText: taskTitle })).toBeVisible({
      timeout: 5000,
    });
  });

  test('cards use a one-click status switch instead of a completion checkbox', async ({ page }) => {
    const taskTitle = `Matrix Status ${Date.now()}`;
    await createMatrixTask(page, taskTitle);

    await page.goto('/matrix');
    await expect(page.locator('.page-title')).toHaveText('Eisenhower Matrix', { timeout: 8000 });
    await page.waitForTimeout(600);

    const card = page.locator('.unassigned-panel .matrix-card', { hasText: taskTitle });
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(card.locator('.card-check')).toHaveCount(0);

    const statusSwitch = card.locator('.status-switch');
    await expect(statusSwitch).toBeVisible();
    await expect(statusSwitch.getByRole('button', { name: 'To Do' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await statusSwitch.getByRole('button', { name: 'Doing' }).click();
    await expect(statusSwitch.getByRole('button', { name: 'Doing' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The status write is persisted, not just a temporary UI state.
    await page.reload();
    await page.waitForTimeout(600);
    const reloadedCard = page.locator('.unassigned-panel .matrix-card', { hasText: taskTitle });
    await expect(
      reloadedCard.locator('.status-switch').getByRole('button', { name: 'Doing' }),
    ).toHaveAttribute('aria-pressed', 'true', { timeout: 5000 });
  });

  test('right-click menu moves a card and changes its status', async ({ page }) => {
    const taskTitle = `Matrix Menu ${Date.now()}`;
    await createMatrixTask(page, taskTitle);

    await page.goto('/matrix');
    await expect(page.locator('.page-title')).toHaveText('Eisenhower Matrix', { timeout: 8000 });
    await page.waitForTimeout(600);

    const unassignedCard = page.locator('.unassigned-panel .matrix-card', { hasText: taskTitle });
    await expect(unassignedCard).toBeVisible({ timeout: 5000 });

    await unassignedCard.click({ button: 'right' });
    const menu = page.locator('.matrix-menu');
    await expect(menu).toBeVisible({ timeout: 3000 });
    await expect(menu).toContainText('Move to quadrant');
    await expect(menu).toContainText('Status');
    await expect(menu).toContainText('Unassigned · To Do');

    await menu.locator('.menu-option', { hasText: 'Do First' }).click();
    const q1Card = page.locator('.quadrant.urgent-important .matrix-card', { hasText: taskTitle });
    await expect(q1Card).toBeVisible({ timeout: 5000 });

    await q1Card.click({ button: 'right' });
    await page.locator('.matrix-menu .menu-option', { hasText: 'Eliminate' }).click();
    const movedCard = page.locator('.quadrant.neither .matrix-card', { hasText: taskTitle });
    await expect(movedCard).toBeVisible({ timeout: 5000 });

    await movedCard.click({ button: 'right' });
    await page.locator('.matrix-menu .menu-option', { hasText: 'In Progress' }).click();
    await expect(
      movedCard.locator('.status-switch').getByRole('button', { name: 'Doing' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await movedCard.click({ button: 'right' });
    await page.locator('.matrix-menu .menu-option', { hasText: 'Done' }).click();
    // Done tasks leave the matrix; they are still available on the Tasks/Today boards.
    await expect(page.locator('.matrix-card', { hasText: taskTitle })).toHaveCount(0, {
      timeout: 5000,
    });
  });

  test('a card can be edited from the matrix, and a quadrant can add one', async ({ page }) => {
    const taskTitle = `Matrix Edit ${Date.now()}`;
    await createMatrixTask(page, taskTitle);

    await page.goto('/matrix');
    await expect(page.locator('.page-title')).toHaveText('Eisenhower Matrix', { timeout: 8000 });
    await page.waitForTimeout(600);

    // The pencil on a card — the affordance that was missing — hands the task to
    // the app's one editor, on the Tasks page, already open on it.
    const card = page.locator('.unassigned-panel .matrix-card', { hasText: taskTitle });
    await expect(card).toBeVisible({ timeout: 5000 });
    await card.locator('.card-edit').click();

    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 5000 });
    await expect(page.locator('.slide-panel h2')).toHaveText('Edit Task');
    await expect(
      page.locator('.slide-panel input[placeholder="What needs to be done?"]'),
    ).toHaveValue(taskTitle);
    await page.locator('.slide-panel').getByRole('button', { name: 'Cancel' }).click();

    // A quadrant's "+" opens the add form already sorted into that quadrant:
    // Priority, Quadrant and Repeat are the panel's selects, in that order.
    await page.goto('/matrix');
    await expect(page.locator('.page-title')).toHaveText('Eisenhower Matrix', { timeout: 8000 });
    await page.waitForTimeout(600);
    await page.locator('.quadrant.urgent-important .add-task-btn').click();

    await expect(page.locator('.slide-panel h2')).toHaveText('New Task');
    await expect(page.locator('.slide-panel select').nth(1)).toHaveValue('urgent-important');
    await page.locator('.slide-panel').getByRole('button', { name: 'Cancel' }).click();
  });
});

/**
 * The other half of the page: four empty quadrants say nothing, so with nothing
 * to sort the matrix offers the one action worth taking instead.
 */
test.describe('Eisenhower Matrix with nothing to sort', () => {
  test('points at the Tasks page instead of drawing empty quadrants', async ({ page }) => {
    await page.goto('/matrix');
    await expect(page.locator('.page-title')).toHaveText('Eisenhower Matrix', { timeout: 8000 });
    await page.waitForTimeout(400);

    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state h3')).toHaveText('No tasks for today yet');
    await expect(page.locator('.quadrant')).toHaveCount(0);

    await page.locator('.empty-cta').click();
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });
  });
});
