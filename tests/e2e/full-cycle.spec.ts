import { test, expect, type Page } from '@playwright/test';

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

/**
 * A finished session is announced from the timer, not from a page.
 *
 * The alert — tone, card and system notification — used to be raised by the
 * Dashboard component, so a session that ran out while the user was anywhere else
 * (or in the mini widget, which can be opened from any page) finished in
 * complete silence: no sound, no toast, no notification. Every session type is
 * checked here, because a break ending is exactly as much news as a focus block
 * ending.
 */
test.describe('a finished session is announced wherever the user is', () => {
  test.beforeEach(async ({ page }) => {
    // Two focus sessions to a long break, so one test can walk the whole cycle.
    await page.addInitScript(() => {
      localStorage.setItem('deepwork_settings', JSON.stringify({ sessionsBeforeLongBreak: 2 }));
    });
    await page.clock.install();
    await page.goto('/');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard', { timeout: 8000 });
  });

  /** Walks away from the Dashboard, leaving the timer running behind us. */
  const openTasksPage = async (page: Page): Promise<void> => {
    await page.getByRole('link', { name: 'Tasks' }).click();
    await expect(page.locator('.page-title')).toHaveText('Tasks', { timeout: 8000 });
  };

  const startSession = async (page: Page, name: RegExp): Promise<void> => {
    await page.locator('.timer-controls').getByRole('button', { name }).click();
  };

  const expectAnnouncement = async (page: Page, title: string): Promise<void> => {
    await expect(page.locator('.toast-title')).toHaveText(title, { timeout: 5000 });
    await page.locator('.toast-dismiss').click();
    await expect(page.locator('.toast-container')).toHaveCount(0, { timeout: 5000 });
  };

  test('focus, short break and long break all ring while another page is open', async ({
    page,
  }) => {
    const minutes = (count: number) => count * 60 * 1000;

    // Focus.
    await startSession(page, /Start Focus/i);
    await openTasksPage(page);
    await page.clock.runFor(minutes(25));
    await page.clock.runFor(300); // the card is raised on a 50ms timeout
    await expectAnnouncement(page, 'Focus session complete!');

    // The short break that follows it — the one that used to be silent.
    await page.goto('/');
    await startSession(page, /Start Break/i);
    await openTasksPage(page);
    await page.clock.runFor(minutes(5));
    await page.clock.runFor(300);
    await expectAnnouncement(page, 'Break is over!');

    // The second focus session closes the cycle, so its announcement says so.
    await page.goto('/');
    await startSession(page, /Start Focus/i);
    await openTasksPage(page);
    await page.clock.runFor(minutes(25));
    await page.clock.runFor(300);
    await expectAnnouncement(page, 'Cycle complete!');

    // And the long break that ends it.
    await page.goto('/');
    await startSession(page, /Start Break/i);
    await openTasksPage(page);
    await page.clock.runFor(minutes(15));
    await page.clock.runFor(300);
    await expectAnnouncement(page, 'Long break is over!');
  });
});

