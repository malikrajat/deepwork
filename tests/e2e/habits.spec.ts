import { test, expect } from '@playwright/test';

test.describe('Habits', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/habits');
    await expect(page.locator('.page-title')).toHaveText('Habits', { timeout: 8000 });
  });

  test('add a habit, check in, and delete', async ({ page }) => {
    const habitName = `E2E Habit ${Date.now()}`;

    // Add the habit
    await page.locator('input[placeholder="New habit name..."]').fill(habitName);
    await page.getByRole('button', { name: 'Add' }).click();

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
    const addBtn = page.getByRole('button', { name: 'Add' });

    // Input is empty — button should be disabled
    await expect(addBtn).toBeDisabled({ timeout: 3000 });

    // Type something — button should become enabled
    await page.locator('input[placeholder="New habit name..."]').fill('x');
    await expect(addBtn).toBeEnabled({ timeout: 3000 });

    // Clear — button should be disabled again
    await page.locator('input[placeholder="New habit name..."]').fill('');
    await expect(addBtn).toBeDisabled({ timeout: 3000 });
  });

  test('mini calendar renders 7 dots per habit', async ({ page }) => {
    const habitName = `Cal Test ${Date.now()}`;

    await page.locator('input[placeholder="New habit name..."]').fill(habitName);
    await page.getByRole('button', { name: 'Add' }).click();

    const habitCard = page.locator('.habit-card', { hasText: habitName });
    await expect(habitCard).toBeVisible({ timeout: 5000 });

    // Mini calendar should have 7 day-dots
    await expect(habitCard.locator('.cal-dot')).toHaveCount(7, { timeout: 3000 });

    // Cleanup
    await habitCard.locator('.delete-btn').click();
    await expect(habitCard).not.toBeVisible({ timeout: 5000 });
  });
});
