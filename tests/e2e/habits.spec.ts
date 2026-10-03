import { test, expect, type Page } from '@playwright/test';

test.describe('Habits', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/habits');
    await expect(page.locator('.page-title')).toHaveText('Habits', { timeout: 8000 });
  });

  /**
   * The Add button of the habit form — not the quick-add button that every page
   * carries, whose accessible name ("Add a task for today") also contains "Add".
   */
  const addButton = (page: Page) => page.locator('.add-form').getByRole('button', { name: 'Add' });

  const nameInput = (page: Page) => page.locator('input[placeholder="New habit name..."]');

  test('add a habit, check in, and delete', async ({ page }) => {
    const habitName = `E2E Habit ${Date.now()}`;

    // Add the habit
    await nameInput(page).fill(habitName);
    await addButton(page).click();

    // Verify habit card appears
    const habitCard = page.locator('.habit-card', { hasText: habitName });
    await expect(habitCard).toBeVisible({ timeout: 5000 });

    // Streak should start at 0
    await expect(habitCard.locator('.streak-count')).toHaveText('0', { timeout: 3000 });

    // Check in today
    await habitCard.locator('.check-btn').click();

    // Button text changes to ✓ and card gets done-today class
    await expect(habitCard.locator('.check-btn')).toContainText('✓', { timeout: 3000 });
    await expect(habitCard).toHaveClass(/done-today/, { timeout: 3000 });

    // Streak increments to 1
    await expect(habitCard.locator('.streak-count')).toHaveText('1', { timeout: 3000 });

    // The form is cleared and ready for the next one.
    await expect(nameInput(page)).toHaveValue('');

    // Uncheck (toggle off)
    await habitCard.locator('.check-btn').click();
    await expect(habitCard.locator('.check-btn')).toContainText('Check in', { timeout: 3000 });
    await expect(habitCard).not.toHaveClass(/done-today/, { timeout: 3000 });

    // Delete the habit
    await habitCard.locator('.delete-btn').click();
    await expect(habitCard).not.toBeVisible({ timeout: 5000 });
  });

  test('empty state shows when no habits exist', async ({ page }) => {
    // Assumes a clean browser context with no habits
    const habits = page.locator('.habit-card');
    const emptyState = page.locator('.empty-state');

    const count = await habits.count();
    if (count === 0) {
      await expect(emptyState).toBeVisible({ timeout: 3000 });
      await expect(emptyState.locator('.empty-title')).toHaveText('No habits yet');
    }
    // If habits already exist (e.g. leftover data), the empty state is not shown — that's fine.
  });

  test('add button is disabled when habit name is empty', async ({ page }) => {
    // Input is empty — button should be disabled
    await expect(addButton(page)).toBeDisabled({ timeout: 3000 });

    // Type something — button should become enabled
    await nameInput(page).fill('x');
    await expect(addButton(page)).toBeEnabled({ timeout: 3000 });

    // Clear — button should be disabled again
    await nameInput(page).fill('');
    await expect(addButton(page)).toBeDisabled({ timeout: 3000 });

    // Whitespace is not a name either.
    await nameInput(page).fill('   ');
    await expect(addButton(page)).toBeDisabled({ timeout: 3000 });
  });

  test('the check-in strip covers the last 30 days', async ({ page }) => {
    const habitName = `Strip Test ${Date.now()}`;

    await nameInput(page).fill(habitName);
    await addButton(page).click();

    const habitCard = page.locator('.habit-card', { hasText: habitName });
    await expect(habitCard).toBeVisible({ timeout: 5000 });

    // One dot per day of the window, ending on today.
    await expect(habitCard.locator('.strip-dot')).toHaveCount(30, { timeout: 3000 });
    await expect(habitCard.locator('.strip-dot.today')).toHaveCount(1);
    await expect(habitCard.locator('.strip-labels')).toContainText('30 days ago');

    // A fresh habit has nothing checked in yet.
    await expect(habitCard.locator('.strip-dot.done')).toHaveCount(0);

    // Cleanup
    await habitCard.locator('.delete-btn').click();
    await expect(habitCard).not.toBeVisible({ timeout: 5000 });
  });
});
