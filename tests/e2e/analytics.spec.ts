import { test, expect } from '@playwright/test';

/**
 * Analytics reads the user's own records, so a fresh browser context has nothing
 * to show: every figure is zero and every "not yet" note is on screen. These
 * tests describe that first-run page, and the last one adds a session and checks
 * that the numbers move with it.
 */
test.describe('Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics');
    await expect(page.locator('.page-title')).toHaveText('Analytics', { timeout: 8000 });
    await page.waitForTimeout(400); // allow async data load
  });

  test('the key numbers render with their labels', async ({ page }) => {
    await expect(page.locator('.kpi-card')).toHaveCount(6, { timeout: 5000 });

    for (const label of [
      'Focus · last 7 days',
      'Tasks closed · last 7 days',
      'Focus streak',
      'Completion rate · 30 days',
      'Habit consistency · 30 days',
      'Journal · 12 weeks',
    ]) {
      await expect(page.locator('.kpi-label', { hasText: label })).toBeVisible();
    }
  });

  test('every key number has a value and a hint to read it against', async ({ page }) => {
    const values = page.locator('.kpi-value');
    await expect(values).toHaveCount(6, { timeout: 5000 });

    // Each value is visible even at zero — the card shows "0%" or "--" rather
    // than an empty cell, which is the difference between "nothing yet" and
    // "the page is broken".
    for (const value of await values.all()) {
      await expect(value).toBeVisible();
      expect((await value.textContent())?.trim().length).toBeGreaterThan(0);
    }

    // A number on this page is never left without its reading.
    await expect(page.locator('.kpi-hint')).toHaveCount(6);
  });

  test('the consistency heatmap covers twelve weeks of days', async ({ page }) => {
    const card = page.locator('.chart-card').filter({ hasText: 'Focus consistency' });
    await expect(card).toBeVisible({ timeout: 5000 });

    await expect(card.locator('.heat-col')).toHaveCount(12, { timeout: 3000 });
    // Seven rows in every column: the grid is the whole quarter, not a sample.
    await expect(card.locator('.heatmap .heat-cell')).toHaveCount(84);
  });

  test('the hourly chart draws one bar per hour, labelled every third', async ({ page }) => {
    const card = page.locator('.chart-card').filter({ hasText: 'When you focus' });
    await expect(card).toBeVisible({ timeout: 5000 });

    await expect(card.locator('.bar-col')).toHaveCount(24, { timeout: 3000 });
    await expect(card.locator('.bar-label')).toHaveCount(8);
  });

  test('the weekday chart draws seven bars, each with its average', async ({ page }) => {
    const card = page.locator('.chart-card').filter({ hasText: 'Average focus by weekday' });
    await expect(card).toBeVisible({ timeout: 5000 });

    await expect(card.locator('.bar-col')).toHaveCount(7, { timeout: 3000 });
    await expect(card.locator('.bar-value')).toHaveCount(7);
    await expect(card.locator('.bar-label').first()).toHaveText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/);
  });

  test('the task flow chart draws eight weeks of created versus closed', async ({ page }) => {
    const card = page.locator('.chart-card').filter({ hasText: 'Task flow' });
    await expect(card).toBeVisible({ timeout: 5000 });

    await expect(card.locator('.bar-col.wide')).toHaveCount(8, { timeout: 3000 });
  });

  test('recent sessions says so when there are none yet', async ({ page }) => {
    const card = page.locator('.chart-card').filter({ hasText: 'Recent focus sessions' });
    await expect(card).toBeVisible({ timeout: 5000 });

    await expect(card.locator('.session-row')).toHaveCount(0);
    await expect(card.locator('.empty-note')).toContainText('No sessions yet');
  });

  test('a stopped session shows up in the numbers', async ({ page }) => {
    // Stopping records an interrupted session; skipping does not.
    await page.goto('/dashboard');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard', { timeout: 8000 });

    const controls = page.locator('.timer-controls');
    await controls.getByRole('button', { name: /Start Focus/i }).click();
    await expect(controls.getByRole('button', { name: /Pause/i })).toBeVisible({ timeout: 3000 });
    await controls.locator('.btn-ghost').first().click();
    await expect(controls.getByRole('button', { name: /Start Focus/i })).toBeVisible({
      timeout: 3000,
    });

    await page.goto('/analytics');
    await expect(page.locator('.page-title')).toHaveText('Analytics', { timeout: 8000 });
    await page.waitForTimeout(400);

    // The header counts it …
    await expect(page.locator('.pill', { hasText: 'focus sessions' })).toContainText(
      '1 focus sessions',
    );

    // … and the session itself is listed, marked as the interrupted one it is.
    const card = page.locator('.chart-card').filter({ hasText: 'Recent focus sessions' });
    await expect(card.locator('.session-row')).toHaveCount(1, { timeout: 5000 });
    await expect(card.locator('.interrupted-badge')).toBeVisible();
  });
});
