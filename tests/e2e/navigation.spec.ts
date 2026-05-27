import { test, expect } from '@playwright/test';

/** Sidebar nav items: { nav label → expected page-title } */
const navRoutes = [
  { navLabel: 'Dashboard',  pageTitle: 'Dashboard' },
  { navLabel: 'Tasks',      pageTitle: 'Tasks' },
  { navLabel: 'Matrix',     pageTitle: 'Eisenhower Matrix' },
  { navLabel: 'Today',      pageTitle: 'Today' },
  { navLabel: 'Analytics',  pageTitle: 'Analytics' },
  { navLabel: 'Habits',     pageTitle: 'Habits' },
  { navLabel: 'Journal',    pageTitle: 'Journal' },
  { navLabel: 'Settings',   pageTitle: 'Settings' },
];

test.describe('Sidebar Navigation', () => {
  test('navigates to every page via sidebar links', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard', { timeout: 8000 });

    for (const { navLabel, pageTitle } of navRoutes) {
      // Click the sidebar anchor that contains the given nav label
      await page.locator('a.nav-item', { hasText: navLabel }).click();
      await expect(page.locator('.page-title').first()).toHaveText(pageTitle, { timeout: 8000 });
    }
  });

  test('active nav item is highlighted after navigation', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.locator('.page-title').first()).toHaveText('Tasks', { timeout: 8000 });

    const tasksLink = page.locator('a.nav-item', { hasText: 'Tasks' });
    await expect(tasksLink).toHaveClass(/active/, { timeout: 3000 });
  });

  test('sidebar collapse toggle hides nav labels', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard', { timeout: 8000 });

    // Nav labels are visible before collapse
    await expect(page.locator('.nav-label').first()).toBeVisible({ timeout: 3000 });

    // Collapse the sidebar
    await page.locator('.toggle-btn').click();
    await expect(page.locator('.nav-label').first()).not.toBeVisible({ timeout: 3000 });

    // Expand again
    await page.locator('.toggle-btn').click();
    await expect(page.locator('.nav-label').first()).toBeVisible({ timeout: 3000 });
  });
});
