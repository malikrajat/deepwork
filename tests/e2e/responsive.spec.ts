import { test, expect, type Page } from '@playwright/test';

/**
 * The app on a phone.
 *
 * DeepWork is deployed as a website as well as shipped as a desktop window, and
 * the layout was built for the window: a 240px sidebar beside the content and
 * generous page padding. At 360px that sidebar is two thirds of the screen, and
 * on a real phone the app was unusable — which is what this suite pins down.
 *
 * Two things are checked, and they are the two that actually broke:
 *
 * 1. **Nothing sticks out sideways.** A page whose content is wider than the
 *    window can be dragged left and right, which slides every header out of
 *    view and cannot be explained to the user by anything on screen. Every
 *    element is measured against the window, with two deliberate exemptions —
 *    anything inside a horizontal scroller (a wide table is *meant* to scroll
 *    inside its own box, see `.table-scroll` in `styles.css`) and anything
 *    already clipped by an ancestor's `overflow`, which cannot reach the edge of
 *    the window at all.
 *
 * 2. **The navigation is reachable.** Below the breakpoint the sidebar leaves
 *    the row and becomes a drawer, so the shell's own menu button is the only
 *    way to it — and a drawer that opens but will not close is worse than no
 *    drawer. Opening it, navigating from it, tapping the backdrop and pressing
 *    Escape are all driven here.
 *
 * The desktop side is checked too, because "responsive" must not mean "different
 * on a big screen": `navigation.spec.ts` already owns the 1400px behaviour, and
 * the last test here only asserts that none of the mobile furniture leaked into
 * it.
 */

/** Every route the sidebar can reach, with the title that proves it rendered. */
const ROUTES = [
  { path: '/dashboard', title: 'Dashboard' },
  { path: '/today', title: 'Today' },
  { path: '/matrix', title: 'Eisenhower Matrix' },
  { path: '/calendar', title: 'Calendar' },
  { path: '/tasks', title: 'Tasks' },
  { path: '/analytics', title: 'Analytics' },
  { path: '/habits', title: 'Habits' },
  { path: '/journal', title: 'Journal' },
  { path: '/settings', title: 'Settings' },
  { path: '/about', title: 'About' },
];

/**
 * What a phone actually is, in CSS pixels.
 *
 * 360x740 is the most common Android shape and the one the work was aimed at;
 * 320x568 is an iPhone SE, still the narrowest screen in common use and the
 * size at which a seven-column month grid or a three-column board has nothing
 * left to give.
 */
const PHONE_SIZES = [
  { label: 'a 360px phone', width: 360, height: 740 },
  { label: 'the narrowest phone', width: 320, height: 568 },
];

/**
 * The other end of the same range.
 *
 * "Responsive" is not a synonym for "phone": the app is opened on tablets held
 * either way up, on laptops, on monitors, on an ultrawide, and on a TV in a
 * living room — where the window is 4K and the viewer is three metres away. The
 * desktop layout is the one these sizes get, and what is checked here is that it
 * survives them: nothing overflows, nothing is stranded at the far edge of a
 * 3840px window, and the one component with its own large-screen breakpoint (the
 * Dashboard, at 1600px) still holds together above it.
 */
const SCREEN_SIZES = [
  { label: 'a tablet, portrait', width: 768, height: 1024 },
  { label: 'a tablet, landscape', width: 1024, height: 768 },
  { label: 'a large laptop', width: 1600, height: 900 },
  { label: 'a desktop monitor', width: 1920, height: 1080 },
  { label: 'an ultrawide monitor', width: 2560, height: 1080 },
  { label: 'a very wide monitor', width: 3440, height: 1440 },
  { label: 'a 4K screen or a television', width: 3840, height: 2160 },
];

/**
 * Everything inside the page column that reaches past the right edge.
 *
 * `getBoundingClientRect` and not `scrollWidth`: an element clipped by an
 * ancestor's `overflow` still reports a rect that reaches past the window, and
 * that is the case a `scrollWidth` measure on the page column can miss — the
 * content is cut off with no scrollbar to hint that anything is there. The one
 * deliberate exemption is a real horizontal scroller, because a wide preview
 * table is *meant* to scroll inside its own box (`.table-scroll`) and its rows
 * legitimately extend past the column edge.
 */
async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    /** `tag#id.class.class`, so a failure names the element that overflowed. */
    const nameOf = (el: Element): string => {
      const id = el.id ? `#${el.id}` : '';
      const classes = el.classList.length ? `.${[...el.classList].join('.')}` : '';
      return `${el.tagName.toLowerCase()}${id}${classes}`;
    };

    /** True when an ancestor the user can actually scroll contains it. */
    const insideHorizontalScroller = (el: Element): boolean => {
      for (let parent = el.parentElement; parent && parent !== document.body; ) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
        parent = parent.parentElement;
      }
      return false;
    };

    const problems: string[] = [];
    const limit = window.innerWidth;

    for (const el of Array.from(document.querySelectorAll('.main-content *'))) {
      const style = getComputedStyle(el);
      // A closed drawer, a collapsed panel and everything else that is not on
      // screen cannot overflow the screen.
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (insideHorizontalScroller(el)) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > limit + 1) {
        problems.push(`${nameOf(el)} reaches ${Math.round(rect.right)}px into a ${limit}px window`);
      }
    }

    return problems;
  });
}

/** The page column must be the whole window minus its own padding. */
async function columnWidth(page: Page): Promise<number> {
  return page.locator('.main-content').evaluate((el) => el.getBoundingClientRect().width);
}

/**
 * How far the page column's content reaches past its own edge, in pixels.
 *
 * The browser's own measure, and the one that answers "can the page be dragged
 * sideways": the column is the app's only scrolling region, so anything inside
 * it that is wider than the column is collected here — whether the column then
 * scrolls it or, as it does today, clips it (`overflow-x: hidden`, which still
 * reports the overflow through `scrollWidth`). Content inside a `.table-scroll`
 * wrapper is deliberately excluded by the browser, because the wrapper contains
 * its own overflow, so a wide preview table is not an offender.
 * `overflowingElements` above names *what* spilled; this is the verdict on
 * *whether* anything did.
 */
async function columnOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const column = document.querySelector('.main-content');
    if (!column) return 0;
    return Math.max(0, column.scrollWidth - column.clientWidth);
  });
}

/** `/eisenhower-matrix` -> `about`; a route name safe to put in a file name. */
function nameOf(route: string): string {
  return route.replace(/\W+/g, '') || 'dashboard';
}

/**
 * Waits for the page's entrance animations to finish.
 *
 * Every page fades its content in and lifts it 12px as it arrives
 * (`animate-fade-in`), and the deferred variants wait a further 0.2s before they
 * start. Measuring or photographing mid-animation sees a page that is partly
 * transparent and 12px lower than it settles to — which is exactly how a
 * perfectly good page ends up in a screenshot looking half-empty.
 *
 * The endless background drift (`mesh-drift` on the body's pseudo-elements) is
 * filtered out: it never finishes, so waiting for it would hang.
 */
async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getComputedTiming();
      return timing ? timing.iterations !== Infinity : true;
    });
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
}

for (const size of PHONE_SIZES) {
  test.describe(`on ${size.label} (${size.width}x${size.height})`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: true,
      isMobile: true,
    });

    test('every page fits the window sideways', async ({ page }) => {
      for (const route of ROUTES) {
        await page.goto(route.path);
        await expect(page.locator('.page-title').first()).toHaveText(route.title, {
          timeout: 8000,
        });
        await settleAnimations(page);

        const problems = await overflowingElements(page);
        const tooWide = await columnOverflow(page);
        expect(
          tooWide,
          `${route.path} spills ${tooWide}px past the column at ${size.width}px: ${problems.join('; ')}`,
        ).toBeLessThanOrEqual(1);
        expect(problems, `${route.path} does not fit a ${size.width}px window`).toEqual([]);

        // The window itself must not have grown a horizontal scrollbar either.
        const pageScrollsSideways = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        expect(pageScrollsSideways, `${route.path} scrolls the whole window sideways`).toBe(false);

        // A picture of each page at this width, beside the desktop ones
        // `pages.spec.ts` already writes — the assertions above say nothing
        // overflowed, and only a person can say whether it looks right.
        //
        // The viewport and not `fullPage: true`: the app is exactly one screen
        // tall (`html, body { overflow: hidden }`) and the page scrolls inside
        // `.main-content`, so a full-page capture would be one screen plus a
        // stretch of empty document, which is not a thing anyone ever sees. This
        // is the first screen — the one the user actually lands on.
        await page.screenshot({ path: `playwright-report/mobile/${nameOf(route.path)}-${size.width}.png` });
      }
    });

    test('the sidebar leaves the row, so the page gets the width', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.locator('.page-title').first()).toHaveText('Dashboard', { timeout: 8000 });

      // The whole point of the drawer: a 240px column would leave 120px here.
      expect(await columnWidth(page)).toBeGreaterThan(size.width - 40);

      // ...and it is shut, so its labels are not on screen.
      await expect(page.locator('.nav-label').first()).not.toBeVisible();
      await expect(page.locator('.mobile-menu-btn')).toBeVisible();
    });
  });
}

for (const size of SCREEN_SIZES) {
  test.describe(`on ${size.label} (${size.width}x${size.height})`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('every page still fits, with the sidebar in the row', async ({ page }) => {
      for (const route of ROUTES) {
        await page.goto(route.path);
        await expect(page.locator('.page-title').first()).toHaveText(route.title, {
          timeout: 8000,
        });
        await settleAnimations(page);

        const problems = await overflowingElements(page);
        const tooWide = await columnOverflow(page);
        expect(
          tooWide,
          `${route.path} spills ${tooWide}px past the column at ${size.width}px: ${problems.join('; ')}`,
        ).toBeLessThanOrEqual(1);
        expect(problems, `${route.path} does not fit a ${size.width}px window`).toEqual([]);

        // The shell's own breakpoint decides which of the two navigations is on
        // screen, and this asserts the side of it each size lands on rather than
        // assuming that "not a phone" means "sidebar": a tablet held upright is
        // 768px, which is inside the compact layout, and it should get the drawer
        // exactly as a phone does.
        if (size.width > 900) {
          await expect(page.locator('.mobile-menu-btn')).not.toBeVisible();
          await expect(page.locator('.nav-label').first()).toBeVisible();
        } else {
          await expect(page.locator('.mobile-menu-btn')).toBeVisible();
          await expect(page.locator('.nav-label').first()).not.toBeVisible();
        }

        await page.screenshot({
          path: `playwright-report/screens/${nameOf(route.path)}-${size.width}.png`,
        });
      }
    });
  });
}

test.describe('the page column on a large screen', () => {
  test.use({ viewport: { width: 3840, height: 2160 } });

  test('stops growing at the token and centres itself beside the sidebar', async ({ page }) => {
    await page.goto('/tasks');
    await page.locator('.page-title').first().waitFor();

    const measured = await page.evaluate(() => {
      const main = document.querySelector('.main-content') as HTMLElement;
      const rect = main.getBoundingClientRect();
      const sidebar = document.querySelector('.sidebar') as HTMLElement;
      return {
        column: Math.round(rect.width),
        gapLeft: Math.round(rect.left),
        gapRight: Math.round(window.innerWidth - rect.right),
        sidebar: Math.round(sidebar.getBoundingClientRect().width),
        max: getComputedStyle(document.documentElement)
          .getPropertyValue('--content-max-width')
          .trim(),
      };
    });

    // Read from the token rather than repeated here, so a deliberate change to
    // the maximum does not also have to be made in the test.
    const max = Number.parseInt(measured.max, 10);
    expect(Number.isFinite(max), `--content-max-width is "${measured.max}"`).toBe(true);

    expect(measured.column).toBe(max);
    // Centred in what the sidebar left, which is why the two gaps are equal and
    // neither is the whole distance from the left edge of the window.
    const spare = 3840 - measured.sidebar - max;
    expect(measured.gapRight).toBe(Math.round(spare / 2));
    expect(measured.gapLeft).toBe(measured.sidebar + Math.round(spare / 2));
  });

  test('is not capped below the maximum', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/tasks');
    await page.locator('.page-title').first().waitFor();

    const measured = await page.evaluate(() => {
      const main = document.querySelector('.main-content') as HTMLElement;
      const sidebar = document.querySelector('.sidebar') as HTMLElement;
      return {
        column: Math.round(main.getBoundingClientRect().width),
        sidebar: Math.round(sidebar.getBoundingClientRect().width),
      };
    });

    // All the room there is, minus the navigation: `margin-inline: auto` has no
    // spare space to absorb, so it moves nothing.
    expect(measured.column).toBe(1440 - measured.sidebar);
  });
});

/**
 * The claim About makes, checked on the two screens it is about.
 *
 * The app page carries a "Fits any screen" row next to "Runs on". A claim that
 * the app works on any device is worth exactly as much as the suite behind it,
 * so this opens the tab and reads the row at both ends of the range — on the
 * narrowest phone and on a 4K window.
 */
test.describe('the claim on the About page', () => {
  for (const size of [
    { label: 'the narrowest phone', width: 320, height: 568, mobile: true },
    { label: 'a 4K screen', width: 3840, height: 2160, mobile: false },
  ]) {
    test.describe(`on ${size.label}`, () => {
      test.use({
        viewport: { width: size.width, height: size.height },
        hasTouch: size.mobile,
        isMobile: size.mobile,
      });

      test('says the app fits any screen, and shows it', async ({ page }) => {
        await page.goto('/about');
        await expect(page.locator('.page-title').first()).toHaveText('About', { timeout: 8000 });

        await page.getByRole('tab', { name: /updates/ }).click();
        const row = page.locator('.fact', { hasText: 'Fits any screen' });
        await expect(row).toBeVisible();
        await expect(row).toContainText('Phone, tablet, laptop');
        await expect(row).toContainText('TV');

        // The row is part of a card, and the card was checked for overflow by
        // the sweep above — but the row itself is new, so it is measured here
        // against the window rather than assumed.
        const right = await row.evaluate((el) => el.getBoundingClientRect().right);
        expect(right).toBeLessThanOrEqual(size.width);

        await settleAnimations(page);
        // Photographed where the row is, not at the top of a page whose first
        // screen is the version list: the point of the picture is the claim.
        await row.scrollIntoViewIfNeeded();
        await settleAnimations(page);
        await page.screenshot({
          path: `playwright-report/screens/about-app-${size.width}.png`,
        });
      });
    });
  }
});

test.describe('the navigation drawer', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('opens from the menu button and closes when a page is chosen', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard', { timeout: 8000 });

    const menu = page.locator('.mobile-menu-btn');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.nav-label').first()).toBeVisible();

    // The drawer covers the row it opened from, so it slides over the page it
    // was opened on rather than pushing it around.
    const drawer = page.locator('.sidebar');
    const drawerBox = await drawer.boundingBox();
    expect(drawerBox!.x).toBeLessThanOrEqual(1);
    expect(drawerBox!.width).toBeLessThanOrEqual(390);

    await page.locator('a.nav-item', { hasText: 'Tasks' }).click();
    await expect(page.locator('.page-title').first()).toHaveText('Tasks', { timeout: 8000 });
    await expect(page.locator('.nav-label').first()).not.toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  test('closes on a tap outside it, and on Escape', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard', { timeout: 8000 });
    const menu = page.locator('.mobile-menu-btn');

    await menu.click();
    await expect(page.locator('.nav-label').first()).toBeVisible();
    // Tapping the page behind the drawer is the gesture everyone tries first.
    await page.locator('.nav-backdrop').click({ position: { x: 360, y: 400 } });
    await expect(page.locator('.nav-label').first()).not.toBeVisible();

    await menu.click();
    await expect(page.locator('.nav-label').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.nav-label').first()).not.toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  test('does not hand the page a horizontal scrollbar while it is open', async ({ page }) => {
    await page.goto('/matrix');
    await expect(page.locator('.page-title').first()).toHaveText('Eisenhower Matrix', {
      timeout: 8000,
    });

    await page.locator('.mobile-menu-btn').click();
    await expect(page.locator('.nav-label').first()).toBeVisible();

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(sideways).toBe(false);
  });
});

test.describe('the desktop window', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test('keeps the sidebar, and none of the mobile furniture', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard', { timeout: 8000 });

    await expect(page.locator('.nav-label').first()).toBeVisible();
    await expect(page.locator('.mobile-menu-btn')).not.toBeVisible();
    await expect(page.locator('.mobile-topbar')).not.toBeVisible();
    await expect(page.locator('.nav-backdrop')).toHaveCount(0);

    // Still the full 240px column, not the phone's full-width drawer.
    const sidebar = await page.locator('.sidebar').boundingBox();
    expect(Math.round(sidebar!.width)).toBe(240);
  });
});
