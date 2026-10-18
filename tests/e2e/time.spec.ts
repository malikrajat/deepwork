import { test, expect } from '@playwright/test';

/**
 * Time is the page that answers "how much of my life has code review taken?".
 * These cases drive it with a small, real shape of data: a daily routine that
 * arrives as three separate task rows, one one-off task, and a break that must
 * not be counted as work.
 */

/** A local timestamp `daysAgo` days back at 09:00. */
function dayAt(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

/** A local `YYYY-MM-DD` `daysAgo` days back, for the date inputs. */
function inputDay(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function makeTasks() {
  return ['review-1', 'review-2', 'review-3'].map((id) => ({
    id,
    title: 'Code review',
    description: '',
    priority: 2,
    status: 'done',
    quadrant: null,
    deadline: null,
    tags: [],
    recurrence: null,
    todayOrder: null,
    todayOrderDate: null,
    createdAt: dayAt(2),
    completedAt: dayAt(0),
  }));
}

function makeSessions() {
  const review = ['review-1', 'review-2', 'review-3'].map((taskId, index) => ({
    id: `review-session-${index}`,
    taskId,
    taskTitle: 'Code review',
    type: 'work',
    durationPlanned: 1500,
    durationActual: 1500,
    startedAt: dayAt(2 - index),
    completedAt: dayAt(2 - index),
    interrupted: false,
  }));

  return [
    ...review,
    {
      id: 'proposal-session',
      taskId: 'proposal',
      taskTitle: 'Write the proposal',
      type: 'work',
      durationPlanned: 1800,
      durationActual: 1800,
      startedAt: dayAt(0),
      completedAt: dayAt(0),
      interrupted: false,
    },
    {
      id: 'break-session',
      taskId: null,
      taskTitle: null,
      type: 'short-break',
      durationPlanned: 300,
      durationActual: 300,
      startedAt: dayAt(0),
      completedAt: dayAt(0),
      interrupted: false,
    },
  ];
}

function makeProposal() {
  return {
    id: 'proposal',
    title: 'Write the proposal',
    description: '',
    priority: 3,
    status: 'todo',
    quadrant: null,
    deadline: null,
    tags: [],
    recurrence: null,
    todayOrder: null,
    todayOrderDate: null,
    createdAt: dayAt(0),
    completedAt: null,
  };
}

test.describe('Time Page', () => {
  test('groups the daily copies of one task and keeps the all-time total', async ({ page }) => {
    const tasks = [...makeTasks(), makeProposal()];
    const sessions = makeSessions();

    await page.addInitScript(
      ({ seededTasks, seededSessions }) => {
        localStorage.setItem('deepwork_tasks', JSON.stringify(seededTasks));
        localStorage.setItem('deepwork_sessions', JSON.stringify(seededSessions));
      },
      { seededTasks: tasks, seededSessions: sessions },
    );

    await page.goto('/time');
    await expect(page.locator('.page-title')).toHaveText('Time by Task', { timeout: 8000 });

    // The default window is this month; all time is the one that certainly holds
    // sessions whatever the date is today.
    await page.getByRole('tab', { name: 'All time' }).click();

    const review = page.locator('.time-card', { hasText: 'Code review' });
    await expect(review).toBeVisible({ timeout: 5000 });
    await expect(review.locator('.cadence')).toHaveText('Repeats daily');
    await expect(review.locator('.badges')).toContainText('3 task rows');
    await expect(review.locator('.totals strong')).toHaveText('1h 15m');
    await expect(review.locator('.totals span')).toContainText('3 sessions');
    await expect(review.locator('.totals span')).toContainText('3 days');

    const proposal = page.locator('.time-card', { hasText: 'Write the proposal' });
    await expect(proposal.locator('.cadence')).toHaveText('One-off');
    await expect(proposal.locator('.totals strong')).toHaveText('30m');

    // The break is a session but not time on a task, so the page counts four
    // sessions, not five.
    const sessionsCard = page.locator('.summary-card', { hasText: 'Sessions' });
    await expect(sessionsCard.locator('.summary-value')).toHaveText('4');
  });

  test('opens a task into its breakdown and closes it with Escape', async ({ page }) => {
    await page.addInitScript(
      ({ seededTasks, seededSessions }) => {
        localStorage.setItem('deepwork_tasks', JSON.stringify(seededTasks));
        localStorage.setItem('deepwork_sessions', JSON.stringify(seededSessions));
      },
      { seededTasks: [...makeTasks(), makeProposal()], seededSessions: makeSessions() },
    );

    await page.goto('/time');
    await page.getByRole('tab', { name: 'All time' }).click();

    const review = page.locator('.time-card', { hasText: 'Code review' });
    await review.locator('.time-card-head').click();

    const sheet = page.locator('.detail-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.breakdown-table')).toBeVisible();
    await expect(sheet.locator('.session-list li')).toHaveCount(3);
    await expect(sheet.locator('.detail-stat').first()).toContainText('This period');
    await expect(sheet.locator('.detail-stat').first()).toContainText('1h 15m');

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });

  test('shows the reading the numbers add up to', async ({ page }) => {
    await page.addInitScript(
      ({ seededTasks, seededSessions }) => {
        localStorage.setItem('deepwork_tasks', JSON.stringify(seededTasks));
        localStorage.setItem('deepwork_sessions', JSON.stringify(seededSessions));
      },
      { seededTasks: [...makeTasks(), makeProposal()], seededSessions: makeSessions() },
    );

    await page.goto('/time');
    await page.getByRole('tab', { name: 'All time' }).click();

    const insights = page.locator('.insight-list li');
    await expect(insights.first()).toContainText('Code review');
    await expect(insights.first()).toContainText('repeats daily');
    await expect(page.locator('.insight-card')).toBeVisible();
  });

  test('shows an empty state before any focus time exists', async ({ page }) => {
    await page.goto('/time');
    await expect(page.locator('.page-title')).toHaveText('Time by Task', { timeout: 8000 });
    await expect(page.locator('.empty-state h2')).toHaveText('No focus time tracked yet');
  });

  test("Today keeps today's sessions and drops yesterday's", async ({ page }) => {
    await page.addInitScript(
      ({ seededTasks, seededSessions }) => {
        localStorage.setItem('deepwork_tasks', JSON.stringify(seededTasks));
        localStorage.setItem('deepwork_sessions', JSON.stringify(seededSessions));
      },
      { seededTasks: [...makeTasks(), makeProposal()], seededSessions: makeSessions() },
    );

    await page.goto('/time');
    await page.getByRole('tab', { name: 'Today' }).click();

    await expect(page.locator('.result-count')).toContainText('2 of 2 with time');
    const review = page.locator('.time-card', { hasText: 'Code review' });
    // The row keeps the all-time figure; the window's own figure is in the note.
    await expect(review.locator('.totals strong')).toHaveText('1h 15m');
    await expect(review.locator('.chart-note')).toContainText('25m in this window');
    await expect(page.locator('.time-card', { hasText: 'Write the proposal' })).toBeVisible();
  });

  test('a custom range can be one chosen day', async ({ page }) => {
    await page.addInitScript(
      ({ seededTasks, seededSessions }) => {
        localStorage.setItem('deepwork_tasks', JSON.stringify(seededTasks));
        localStorage.setItem('deepwork_sessions', JSON.stringify(seededSessions));
      },
      { seededTasks: [...makeTasks(), makeProposal()], seededSessions: makeSessions() },
    );

    await page.goto('/time');
    await page.getByRole('tab', { name: 'Custom' }).click();

    const inputs = page.locator('.date-field input');
    await inputs.nth(0).fill(inputDay(2));
    await inputs.nth(0).dispatchEvent('change');
    await inputs.nth(1).fill(inputDay(2));
    await inputs.nth(1).dispatchEvent('change');

    await expect(page.locator('.period-range')).toContainText('2');
    await expect(page.locator('.result-count')).toContainText('1 of 1 with time');
    const review = page.locator('.time-card', { hasText: 'Code review' });
    await expect(review.locator('.totals strong')).toHaveText('1h 15m');
    await expect(review.locator('.chart-note')).toContainText('25m in this window');
    await expect(page.locator('.time-card', { hasText: 'Write the proposal' })).toHaveCount(0);
  });

  test('bar colours carry one meaning each and have a legend', async ({ page }) => {
    await page.addInitScript(
      ({ seededTasks, seededSessions }) => {
        localStorage.setItem('deepwork_tasks', JSON.stringify(seededTasks));
        localStorage.setItem('deepwork_sessions', JSON.stringify(seededSessions));
      },
      { seededTasks: [...makeTasks(), makeProposal()], seededSessions: makeSessions() },
    );

    await page.goto('/time');
    await page.getByRole('tab', { name: 'All time' }).click();

    const legend = page.locator('.chart-legend');
    await expect(legend).toContainText('Repeating work');
    await expect(legend).toContainText('One-off');
    await expect(legend).toContainText('Multi-day');
    await expect(legend).toContainText('Untasked');
    await expect(legend).toContainText('Ring = current');

    const reviewChart = page.locator('.time-card', { hasText: 'Code review' }).locator('.chart');
    await expect(reviewChart).toHaveClass(/chart repeating/);
    await expect(
      page.locator('.time-card', { hasText: 'Write the proposal' }).locator('.chart'),
    ).toHaveClass(/chart one-off/);

    // A bar is one solid colour, never a gradient: the colour says what kind of
    // work it is, not how much time it holds.
    const barImage = await reviewChart
      .locator('.bar')
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(barImage).toBe('none');
  });

  test('virtualises the list so only the rows in view exist in the DOM', async ({ page }) => {
    const tasks: Record<string, unknown>[] = [];
    const sessions: Record<string, unknown>[] = [];
    for (let i = 1; i <= 50; i++) {
      const title = `Virtual work ${String(i).padStart(2, '0')}`;
      const id = `virtual-${i}`;
      tasks.push({
        id,
        title,
        description: '',
        priority: 3,
        status: 'todo',
        quadrant: null,
        deadline: null,
        tags: [],
        recurrence: null,
        todayOrder: null,
        todayOrderDate: null,
        createdAt: dayAt(0),
        completedAt: null,
      });
      sessions.push({
        id: `virtual-session-${i}`,
        taskId: id,
        taskTitle: title,
        type: 'work',
        durationPlanned: 1500,
        durationActual: 1500,
        startedAt: dayAt(0),
        completedAt: dayAt(0),
        interrupted: false,
      });
    }

    await page.addInitScript(
      ({ seededTasks, seededSessions }) => {
        localStorage.setItem('deepwork_tasks', JSON.stringify(seededTasks));
        localStorage.setItem('deepwork_sessions', JSON.stringify(seededSessions));
      },
      { seededTasks: tasks, seededSessions: sessions },
    );

    await page.goto('/time');
    await page.getByRole('tab', { name: 'All time' }).click();

    const list = page.locator('.time-list');
    await expect(list).toBeVisible();
    const initialCount = await page.locator('.time-card').count();
    expect(initialCount).toBeGreaterThan(0);
    expect(initialCount).toBeLessThan(30);

    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll'));
    });
    await expect(page.locator('.time-card', { hasText: 'Virtual work 50' })).toBeVisible({
      timeout: 5000,
    });
    expect(await page.locator('.time-card').count()).toBeLessThan(30);
  });
});
