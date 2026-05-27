import { test, expect } from '@playwright/test';
import fs from 'fs/promises';

const pages = [
  { path: '/dashboard', title: 'Dashboard', name: 'dashboard' },
  { path: '/tasks', title: 'Tasks', name: 'tasks' },
  { path: '/matrix', title: 'Eisenhower Matrix', name: 'matrix' },
  { path: '/today', title: 'Today', name: 'today' },
  { path: '/analytics', title: 'Analytics', name: 'analytics' },
  { path: '/habits', title: 'Habits', name: 'habits' },
  { path: '/journal', title: 'Journal', name: 'journal' },
  { path: '/settings', title: 'Settings', name: 'settings' },
];

test.beforeAll(async () => {
  await fs.mkdir('playwright-report/pages', { recursive: true });
});

for (const p of pages) {
  test(`Page loads: ${p.path}`, async ({ page }) => {
    await page.goto(p.path);
    await expect(page).not.toHaveURL(/error/, { timeout: 3000 });

    const title = page.locator('.page-title').first();
    await expect(title).toBeVisible({ timeout: 8000 });
    await expect(title).toHaveText(p.title, { timeout: 5000 });

    // Verify no JS errors crashed the page (no empty body)
    await expect(page.locator('body')).not.toBeEmpty();

    await page.screenshot({ path: `playwright-report/pages/${p.name}.png`, fullPage: true });
  });
}
