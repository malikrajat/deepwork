import { test, expect } from '@playwright/test';

test.describe('Pomodoro Timer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard', { timeout: 8000 });
  });

  test('start → pause → resume → stop restores initial state', async ({ page }) => {
    const controls = page.locator('.timer-controls');

    // Initially shows "Start Focus"
    const startBtn = controls.getByRole('button', { name: /Start Focus/i });
    await expect(startBtn).toBeVisible({ timeout: 5000 });

    // Start the timer
    await startBtn.click();

    // Pause button appears; start button disappears
    const pauseBtn = controls.getByRole('button', { name: /Pause/i });
    await expect(pauseBtn).toBeVisible({ timeout: 3000 });
    await expect(startBtn).not.toBeVisible();

    // Wait for at least one timer tick so remainingSeconds < totalDuration,
    // which causes the button to read "Resume" instead of "Start Focus" when paused.
    await page.waitForTimeout(1100);

    // Pause
    await pauseBtn.click();

    // Resume button appears
    const resumeBtn = controls.getByRole('button', { name: /Resume/i });
    await expect(resumeBtn).toBeVisible({ timeout: 3000 });
    await expect(pauseBtn).not.toBeVisible();

    // Resume
    await resumeBtn.click();
    await expect(pauseBtn).toBeVisible({ timeout: 3000 });

    // Stop (first .btn-ghost in .timer-controls)
    await controls.locator('.btn-ghost').first().click();

    // Returns to "Start Focus" after a full stop
    await expect(startBtn).toBeVisible({ timeout: 3000 });
  });

  test('skip work session advances to break phase', async ({ page }) => {
    const controls = page.locator('.timer-controls');

    // Start the timer
    const startBtn = controls.getByRole('button', { name: /Start Focus/i });
    await expect(startBtn).toBeVisible({ timeout: 5000 });
    await startBtn.click();
    await expect(controls.getByRole('button', { name: /Pause/i })).toBeVisible({ timeout: 3000 });

    // Skip (last .btn-ghost in .timer-controls)
    await controls.locator('.btn-ghost').last().click();

    // After skipping a work session the timer offers a break
    const nextBtn = controls.locator('.btn-primary');
    await expect(nextBtn).toBeVisible({ timeout: 5000 });
    await expect(nextBtn).toContainText(/Start Break/i);
  });

  test('session indicator reflects progress after skip', async ({ page }) => {
    const controls = page.locator('.timer-controls');
    const sessionLabel = page.locator('.session-label');

    // Session label shows "/4" pattern before any sessions
    await expect(sessionLabel).toBeVisible({ timeout: 5000 });
    await expect(sessionLabel).toContainText('/4');

    // Start and skip a work session
    await controls.getByRole('button', { name: /Start Focus/i }).click();
    await expect(controls.getByRole('button', { name: /Pause/i })).toBeVisible({ timeout: 3000 });
    await controls.locator('.btn-ghost').last().click();

    // After one completed work session, break phase is offered
    await expect(controls.locator('.btn-primary')).toContainText(/Start Break/i, { timeout: 5000 });
  });

  test('session dots render in the indicator row', async ({ page }) => {
    const indicator = page.locator('.session-indicator');
    await expect(indicator).toBeVisible({ timeout: 5000 });

    // There should be 4 session dots (one per pomodoro before long break)
    const dots = indicator.locator('.dot');
    await expect(dots).toHaveCount(4, { timeout: 3000 });
  });

  test('fullscreen mode opens and closes', async ({ page }) => {
    // Click fullscreen action button
    await page.locator('.card-actions .action-btn').last().click();
    await expect(page.locator('.fullscreen-overlay')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.exit-fullscreen-btn')).toBeVisible();

    // Close fullscreen
    await page.locator('.exit-fullscreen-btn').click();
    await expect(page.locator('.fullscreen-overlay')).not.toBeVisible({ timeout: 3000 });
  });
});

