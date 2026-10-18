import { test, expect, type Page } from '@playwright/test';

/**
 * The width of a page, which is the thing a person notices first.
 *
 * The app was built for a desktop window and then made to survive a phone. Two
 * mistakes came out of that, and this suite is the guard against both:
 *
 * 1. **Squeezed into the middle on a desktop.** Settings was one 560px column,
 *    About one 780px column, and both grew a `margin-inline: auto` for very wide
 *    screens. At 1920px — the size most desktops actually are — that is a narrow
 *    strip in the middle of the window with nine hundred empty pixels on each
 *    side. A page has to use the width it is given.
 *
 * 2. **Not using the width on a phone.** The opposite mistake: a fixed minimum
 *    track in a grid, or a centred column, is wider than a 360px viewport. On a
 *    phone the content takes the whole width of the viewport minus its own
 *    padding, in one column, with nothing centred and nothing to scroll
 *    sideways.
 *
 * A third mistake is about height rather than width, and it came out of the fix
 * for the first one. Cards of different heights sharing a grid row are all drawn
 * as tall as the tallest card in that row, so the short card leaves a bare strip
 * of page under itself and the next card cannot start until the tall one ends —
 * on Settings, a one-row Appearance card beside the water card left four hundred
 * pixels of nothing. Settings packs its cards in columns for that reason, and
 * the measurement below asserts the page a person sees: every card starts one
 * gutter below the card above it, and no strip is left for a neighbour.
 *
 * The widths are measured rather than photographed, because a screenshot says
 * "this looks wrong" to a person and nothing to a test runner. The numbers here
 * are structural: how many columns of cards the page chose, how much of the
 * window the page column fills, and how much bare page was left in a column.
 */

/** How many columns of cards a page drew — the distinct left edges the cards landed on. */
async function cardColumns(page: Page, container: string, card: string): Promise<number> {
  return page
    .locator(container)
    .first()
    .evaluate((element, cardSelector) => {
      const lefts = new Set(
        Array.from(element.querySelectorAll(cardSelector)).map((item) =>
          Math.round(item.getBoundingClientRect().left),
        ),
      );
      return lefts.size;
    }, card);
}

/**
 * The largest bare strip between two cards stacked in the same column.
 *
 * Cards are identified as stacked by sharing a left edge, then sorted down it;
 * the gap is measured from the bottom of one to the top of the next. A packed
 * page keeps every one of those gaps at the gutter between cards, so a number
 * much larger than the gutter is a hole — the thing this asserts against.
 */
async function worstVerticalGap(page: Page, container: string, card: string): Promise<number> {
  return page
    .locator(container)
    .first()
    .evaluate((element, cardSelector) => {
      const stacks = new Map<number, { top: number; bottom: number }[]>();
      for (const item of Array.from(element.querySelectorAll(cardSelector))) {
        const rect = item.getBoundingClientRect();
        const left = Math.round(rect.left);
        const stack = stacks.get(left) ?? [];
        stack.push({ top: Math.round(rect.top), bottom: Math.round(rect.bottom) });
        stacks.set(left, stack);
      }

      let worst = 0;
      for (const stack of stacks.values()) {
        stack.sort((a, b) => a.top - b.top);
        for (let index = 1; index < stack.length; index++) {
          worst = Math.max(worst, stack[index].top - stack[index - 1].bottom);
        }
      }
      return worst;
    }, card);
}

/** The four edges of an element, rounded. */
async function box(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      };
    });
}

test.describe('a 1920px desktop', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('Settings fills the page with cards instead of a centred strip', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('.page-title').first()).toHaveText('Settings');

    const grid = await box(page, '.settings-grid');
    expect(grid.width).toBeGreaterThan(1400);
    expect(grid.left).toBeLessThan(400);

    // More than one card per row is the visible difference. At this width the
    // 380px column resolves to three.
    expect(await cardColumns(page, '.settings-grid', '.setting-group')).toBeGreaterThanOrEqual(3);

    // And no card leaves a bare strip under itself for a taller neighbour to
    // finish. The gutter is --space-md (16px); a rounding pixel is allowed.
    expect(await worstVerticalGap(page, '.settings-grid', '.setting-group')).toBeLessThanOrEqual(
      17,
    );
  });

  test('About uses the width for its cards, and keeps prose readable inside them', async ({
    page,
  }) => {
    await page.goto('/about');
    await expect(page.locator('.page-title').first()).toHaveText('About');

    const content = await box(page, '.content');
    expect(content.width).toBeGreaterThan(1200);
    expect(await cardColumns(page, '.content', 'section.card')).toBeGreaterThanOrEqual(2);

    // The card is the reading measure: the paragraph inside it is narrower than
    // the page, which is the whole reason the page can be this wide.
    const prose = await box(page, '.prose');
    expect(prose.width).toBeLessThan(800);
  });

  test('the calendar takes the whole day column', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page.locator('.page-title').first()).toHaveText('Calendar');

    const layout = await box(page, '.cal-layout');
    expect(layout.width).toBeGreaterThan(1400);

    const header = await box(page, '.page-header');
    expect(header.width).toBeGreaterThan(1400);
  });
});

test.describe('a 1400px laptop', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test('Settings is a multi-column page, not a single narrow column', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('.page-title').first()).toHaveText('Settings');

    const grid = await box(page, '.settings-grid');
    // The shell hands the page 1160px; the grid uses all of it.
    expect(grid.width).toBeGreaterThan(1000);
    expect(await cardColumns(page, '.settings-grid', '.setting-group')).toBeGreaterThanOrEqual(2);
  });
});

test.describe('a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('takes the whole viewport in one column, centred on nothing', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('.page-title').first()).toHaveText('Settings');

    const main = await box(page, '.main-content');
    expect(main.left).toBe(0);
    expect(main.width).toBe(390);

    const grid = await box(page, '.settings-grid');
    // The shell's own 16px gutters, and nothing else.
    expect(grid.left).toBe(16);
    expect(grid.width).toBe(358);
    expect(await cardColumns(page, '.settings-grid', '.setting-group')).toBe(1);
  });

  test('About stays in one full-width column with a readable hero', async ({ page }) => {
    await page.goto('/about');
    await expect(page.locator('.page-title').first()).toHaveText('About');

    const content = await box(page, '.content');
    expect(content.width).toBe(358);
    expect(await cardColumns(page, '.content', 'section.card')).toBe(1);

    // The avatar, the name and the status pill: the name column must keep the
    // room the avatar leaves it, rather than being squeezed to a word a line.
    const who = await box(page, '.hero-who');
    expect(who.width).toBeGreaterThan(180);
  });
});
