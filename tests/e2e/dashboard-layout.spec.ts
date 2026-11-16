import { test, expect } from '@playwright/test';

/**
 * The clock card is not a scroll region.
 *
 * It used to grow a scrollbar as soon as a task was linked to the timer — the
 * dropdown row is a whole slice of the card — and in the stacked layout under
 * 1024px, because everything inside it was sized from the window while the card
 * itself is a fixed shape. The card now clips instead of scrolling and the dial
 * takes the height left over, so this drives the real page at the sizes where it
 * went wrong and checks that nothing overflows *or* gets clipped.
 *
 * The matching CSS invariant, which fails without a browser, lives in
 * `tests/unit/dashboard.component.spec.ts`.
 */

const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1200, height: 800 },
  { width: 1024, height: 768 },
  { width: 900, height: 700 },
  { width: 800, height: 600 },
];

/** A task created today, linked to the timer, so the task row is at its tallest. */
async function linkATaskToTheTimer(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem(
      'deepwork_tasks',
      JSON.stringify([
        {
          id: 'e2e-clock-card-task',
          title: 'Draft the quarterly report for the north region',
          description: '',
          priority: 2,
          status: 'todo',
          quadrant: 'important',
          deadline: null,
          tags: [],
          recurrence: null,
          todayOrder: 1,
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ]),
    );
    localStorage.setItem('deepwork_focusTaskId', 'e2e-clock-card-task');
    // The focused task is remembered per day, so a task seeded for this run has
    // to carry today's stamp as well — without it the app reads it as a task
    // chosen on an earlier day and deliberately ignores it.
    localStorage.setItem('deepwork_focusTaskDay', new Date().toISOString().slice(0, 10));
  });
}

test('the clock card fits its contents at every window size', async ({ page }) => {
  await page.goto('/dashboard');
  await linkATaskToTheTimer(page);
  await page.reload();
  await expect(page.locator('.page-title')).toBeVisible();
  // The row that used to push the card over its own height.
  await expect(page.locator('.timer-card-inner .task-selector')).toBeVisible();

  for (const size of SIZES) {
    await page.setViewportSize(size);
    // Let the flex layout settle after the resize.
    await page.waitForTimeout(150);

    const card = await page.evaluate(() => {
      const el = document.querySelector('.timer-card-inner');
      if (!el) return null;
      return {
        overflowY: getComputedStyle(el).overflowY,
        clipped: el.scrollHeight - el.clientHeight,
        dial: Math.round(
          el.querySelector('app-animated-clock')?.getBoundingClientRect().height ?? 0,
        ),
      };
    });

    const where = `${size.width}x${size.height}`;
    expect(card, `clock card missing at ${where}`).not.toBeNull();
    expect(card!.overflowY, `overflow-y at ${where}`).not.toMatch(/auto|scroll/);
    expect(card!.clipped, `the card scrolls or clips at ${where}`).toBeLessThanOrEqual(1);
    // A dial that has been squashed to nothing would pass the checks above.
    expect(card!.dial, `the dial is unreadably small at ${where}`).toBeGreaterThan(180);
  }
});

test('the live activity rail lists the whole day and scrolls inside the card', async ({ page }) => {
  await page.goto('/dashboard');
  await page.evaluate(() => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const sessions = Array.from({ length: 20 }, (_, index) => {
      const startedAt = new Date(dayStart.getTime() + (8 * 60 + index * 20) * 60_000);
      const work = index % 5 !== 4;
      return {
        id: `e2e-live-${index}`,
        taskId: null,
        taskTitle: work ? `Deep work block ${index + 1}` : null,
        type: work ? 'work' : 'short-break',
        durationPlanned: work ? 1500 : 300,
        durationActual: work ? 1500 : 300,
        startedAt: startedAt.toISOString(),
        completedAt: new Date(startedAt.getTime() + (work ? 1500 : 300) * 1000).toISOString(),
        interrupted: false,
      };
    });
    localStorage.setItem('deepwork_sessions', JSON.stringify(sessions));
  });
  await page.reload();
  await expect(page.locator('.page-title')).toBeVisible();

  const rows = page.locator('.activity-item');
  await expect(rows).toHaveCount(20);
  await expect(page.locator('.rail-count')).toContainText('20');

  const list = page.locator('.activity-list');
  const metrics = await list.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(metrics.overflowY).toBe('auto');
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 1);

  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(rows.last()).toBeInViewport();
});
