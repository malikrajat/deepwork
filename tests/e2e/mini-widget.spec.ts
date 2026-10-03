import { test, expect, type Locator } from '@playwright/test';

/**
 * The widget's shape, measured in a real browser.
 *
 * The panel is a fixed 136x76 and the numbers inside it are meant to account for
 * every pixel: 8px of padding, the 60px ring, the 8px gap, and a 2x2 grid of 24px
 * controls with a 4px gutter (52). Nothing here is expressible as a source
 * invariant — a grid that does not fit is a clipped button, not a failed string
 * comparison — so it is driven against the running app.
 *
 * The browser build draws the widget as a floating panel rather than a native
 * window, and it is the same shape as the window `UiService` resizes to, which is
 * what `tests/unit/visual-crispness.spec.ts` holds together.
 */

test.describe('the mini widget', () => {
  let panel: Locator;

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTitle('Minimize to floating clock').click();
    panel = page.locator('.mini-widget.floating');
    await expect(panel).toBeVisible();
  });

  test('is the size the window is resized to, with nothing spilling out', async () => {
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.width)).toBe(136);
    expect(Math.round(box!.height)).toBe(76);

    // `overflow: hidden` would hide a control that did not fit, so the content
    // is measured rather than trusted.
    const spill = await panel.evaluate((el) => ({
      x: el.scrollWidth - el.clientWidth,
      y: el.scrollHeight - el.clientHeight,
    }));
    expect(spill).toEqual({ x: 0, y: 0 });
  });

  test('keeps the ring and the four controls inside the panel', async ({ page }) => {
    const outer = (await panel.boundingBox())!;
    for (const selector of ['.ring-wrap', '.widget-actions']) {
      const inner = (await page.locator(selector).boundingBox())!;
      expect(inner.x).toBeGreaterThanOrEqual(outer.x);
      expect(inner.y).toBeGreaterThanOrEqual(outer.y);
      expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
      expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
    }
  });

  test('offers run, skip, stop and expand — and runs the timer', async ({ page }) => {
    for (const name of [
      'Start timer',
      'Skip to the next session',
      'Stop the timer',
      'Restore the full window',
    ]) {
      await expect(page.getByRole('button', { name })).toBeVisible();
    }

    await page.getByRole('button', { name: 'Start timer' }).click();
    await expect(page.getByRole('button', { name: 'Pause timer' })).toBeVisible();

    // The ring fills as the session runs — the same direction as the Dashboard
    // clock — so its dash offset has to shrink, never grow. The two surfaces
    // reading one value is only meaningful if this is the way round it is read.
    const offset = async (): Promise<number> =>
      Number(await page.locator('.ring-arc').getAttribute('stroke-dashoffset'));
    const justStarted = await offset();
    await page.waitForTimeout(2200);
    expect(await offset()).toBeLessThan(justStarted);

    await page.getByRole('button', { name: 'Skip to the next session' }).click();
    await expect(page.getByRole('button', { name: 'Start timer' })).toBeVisible();
  });

  test('comes back to the full window when asked', async ({ page }) => {
    await page.getByRole('button', { name: 'Restore the full window' }).click();
    await expect(panel).toHaveCount(0);
  });
});

/**
 * The alert, answered where the user actually is.
 *
 * This is the bug the widget's controls exist for: a session that ends while the
 * window is shrunk rings on its tone until something answers it, and the toast
 * that carries the close button is not on screen while the window *is* the
 * widget. So the ring has to be answerable here.
 *
 * Time is driven by Playwright's clock rather than waited out: the session is
 * started for real, 25 minutes are run off in one call, and the whole thing is
 * asserted against the running app.
 */
test.describe('answering a finished session', () => {
  test('happens in the widget, and the full window stays shrunk', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.getByTitle('Minimize to floating clock').click();

    const panel = page.locator('.mini-widget.floating');
    await expect(panel).toBeVisible();

    // Start the session from the widget and let it run out.
    await page.getByRole('button', { name: 'Start timer' }).click();
    await page.clock.runFor(25 * 60 * 1000);
    await page.clock.runFor(200); // the card is raised on a 50ms timeout

    const silence = page.getByRole('button', { name: 'Silence the alert' });
    await expect(silence).toBeVisible();
    // The surface itself is the alert: changed while it rings...
    const surface = async (): Promise<string> =>
      panel.evaluate((el) => getComputedStyle(el).backgroundColor);
    const resting = 'rgb(12, 9, 24)';
    await expect.poll(surface).not.toBe(resting);
    // ...and it moves: the whole widget shakes on the beat of the tone it
    // repeats, so an unanswered alert announces itself again instead of sitting
    // there. It is the panel itself that animates — the surface and all four
    // buttons with it — because that is what is visible from another window.
    const shake = async (): Promise<string> =>
      panel.evaluate((el) => getComputedStyle(el).animationName);
    // Angular's view encapsulation prefixes the animation name, so this matches
    // the shake wherever it ends, not from the first character.
    expect(await shake()).toMatch(/alert-shake-[ab]$/);
    // The full window is untouched: answering never had to leave the widget.
    await expect(panel).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause timer' })).toHaveCount(0);

    await silence.click();

    await expect(silence).toHaveCount(0);
    await expect(page.locator('.mini-time')).toBeVisible();
    await expect.poll(shake).toBe('none');
    // ...and it goes back to the widget's own colour once it is answered.
    await expect.poll(surface).toBe(resting);
  });
});
