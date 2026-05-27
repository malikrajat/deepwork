import { test, expect } from '@playwright/test';

test.describe('Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics');
    await expect(page.locator('.page-title')).toHaveText('Analytics', { timeout: 8000 });
    await page.waitForTimeout(400); // allow async data load
  });

  test('four stat cards render with labels', async ({ page }) => {
    const statCards = page.locator('.stat-card');
    await expect(statCards).toHaveCount(4, { timeout: 5000 });

    await expect(page.locator('.stat-label', { hasText: 'Focus Hours (30d)' })).toBeVisible();
    await expect(page.locator('.stat-label', { hasText: 'Sessions (30d)' })).toBeVisible();
    await expect(page.locator('.stat-label', { hasText: 'Day Streak' })).toBeVisible();
    await expect(page.locator('.stat-label', { hasText: 'Peak Hour' })).toBeVisible();
  });

  test('stat card values are visible (even if zero)', async ({ page }) => {
    const values = page.locator('.stat-value');
    await expect(values).toHaveCount(4, { timeout: 5000 });

    // Each value cell should contain visible text (numbers or "--")
    for (const val of await values.all()) {
      await expect(val).toBeVisible();
      const text = await val.textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });

  test('daily chart renders 7 bars', async ({ page }) => {
    const dailyChart = page.locator('.chart-card').filter({ hasText: 'Daily Focus' });
    await expect(dailyChart).toBeVisible({ timeout: 5000 });

    const bars = dailyChart.locator('.bar-col');
    await expect(bars).toHaveCount(7, { timeout: 3000 });

    // Each bar column has a label (day abbreviation)
    const labels = dailyChart.locator('.bar-label');
    await expect(labels).toHaveCount(7);
  });

  test('weekly trend chart renders 4 bars', async ({ page }) => {
    const weeklyChart = page.locator('.chart-card').filter({ hasText: 'Weekly Trend' });
    await expect(weeklyChart).toBeVisible({ timeout: 5000 });

    const bars = weeklyChart.locator('.bar-col');
    await expect(bars).toHaveCount(4, { timeout: 3000 });
  });

  test('recent sessions section renders', async ({ page }) => {
    const sessionsCard = page.locator('.chart-card').filter({ hasText: 'Recent Sessions' });
    await expect(sessionsCard).toBeVisible({ timeout: 5000 });

    // If no sessions yet, "No sessions yet" message appears
    const sessionRows = sessionsCard.locator('.session-row');
    const rowCount = await sessionRows.count();
    if (rowCount === 0) {
      await expect(sessionsCard.locator('.empty-sessions')).toBeVisible({ timeout: 3000 });
      await expect(sessionsCard.locator('.empty-sessions')).toContainText('No sessions yet');
    } else {
      // Sessions exist — verify first row structure
      const first = sessionRows.first();
      await expect(first.locator('.session-type')).toBeVisible();
      await expect(first.locator('.session-info')).toBeVisible();
    }
  });

  test('analytics page loads session data after completing a timer', async ({ page }) => {
    // Complete a work session via Dashboard: start → skip → go to analytics
    await page.goto('/dashboard');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard', { timeout: 8000 });

    const controls = page.locator('.timer-controls');
    await controls.getByRole('button', { name: /Start Focus/i }).click();
    await expect(controls.getByRole('button', { name: /Pause/i })).toBeVisible({ timeout: 3000 });

    // Stop (first .btn-ghost) records an interrupted session; skip does not.
    await controls.locator('.btn-ghost').first().click();
    await expect(controls.getByRole('button', { name: /Start Focus/i })).toBeVisible({ timeout: 3000 });

    // Navigate to analytics
    await page.goto('/analytics');
    await expect(page.locator('.page-title')).toHaveText('Analytics', { timeout: 8000 });
    await page.waitForTimeout(400);

    // Sessions (30d) card value should now be at least 1
    const sessionsCard = page.locator('.stat-card').filter({ has: page.locator('.stat-label', { hasText: 'Sessions (30d)' }) });
    const val = await sessionsCard.locator('.stat-value').textContent();
    expect(Number(val?.trim())).toBeGreaterThanOrEqual(1);
  });
});
