import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The crispness pass, pinned down.
 *
 * Every rule below comes from feedback that parts of the app looked soft: the
 * minimised widget's countdown ring was blurred and sat inside a square box, and
 * small labels were hard to read. Each one is invisible in a code review — a
 * class name, a filter, a font size with a fraction in it — and only shows up on
 * screen as a smudged or boxed pixel, so they are asserted against the sources.
 */
const read = (relative: string): string =>
  readFileSync(resolve(__dirname, '../../', relative), 'utf8');

const WIDGET = 'src/app/shared/components/mini-widget/mini-widget.component.ts';
const CLOCK = 'src/app/shared/components/animated-clock/animated-clock.component.ts';
const UI_SERVICE = 'src/app/core/services/ui.service.ts';

const widget = read(WIDGET);
const clock = read(CLOCK);
const uiService = read(UI_SERVICE);
const styles = read('src/styles.css');

/** Every TypeScript and CSS file under `src/`, so the type scale covers all of them. */
function sourceFiles(): string[] {
  const root = resolve(__dirname, '../../src');
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.ts') || entry.endsWith('.css')) files.push(full);
    }
  };
  walk(root);
  return files;
}

describe('Shapes are drawn, not blurred', () => {
  it('draws the widget ring with strokes instead of a Gaussian blur', () => {
    expect(widget).not.toMatch(/<feGaussianBlur/);
    expect(widget).not.toMatch(/filter="url\(#/);
  });

  it('draws the clock arc and needle without blur filters either', () => {
    expect(clock).not.toMatch(/<feGaussianBlur/);
    expect(clock).not.toMatch(/filter="url\(#/);
  });

  it('sizes the widget ring so it is never resampled', () => {
    // A 60px SVG with a 60-unit viewBox is one unit per pixel; drawing it in a
    // 100-unit box and scaling it down makes the browser refilter the circle.
    expect(widget).toContain('const RING_SIZE = 60');
    expect(widget).toContain('const RING_RADIUS = 24');
    expect(widget).toContain('[attr.viewBox]="viewBox"');
  });

  it('keeps the widget text a whole pixel with tabular figures', () => {
    expect(widget).toContain('font-size: 12px');
    expect(widget).toContain('font-variant-numeric: tabular-nums');
  });

  it('gives the floating panel the same size as the widget window', () => {
    // The window is sized in `UiService` and the browser build's floating panel
    // in CSS, and nothing else ties the two together: a widget that grew a
    // control in one and not the other is a clipped button on screen.
    const windowSize = /const WIDGET_SIZE = \{ width: (\d+), height: (\d+) \}/.exec(uiService);
    const panelSize = /\.mini-widget\.floating \{[^}]*width: (\d+)px;[^}]*height: (\d+)px;/s.exec(
      widget,
    );

    expect(windowSize, 'WIDGET_SIZE not found in ui.service.ts').not.toBeNull();
    expect(panelSize, '.mini-widget.floating size not found in the widget').not.toBeNull();
    expect([panelSize![1], panelSize![2]]).toEqual([windowSize![1], windowSize![2]]);
  });
});

describe('No square box around the widget', () => {
  /**
   * Tailwind's `ring` utility is exactly one 1px `currentColor` box-shadow, and
   * Tailwind reads bare class names out of the source — which is how the
   * countdown circle grew a pale square outline the size of its own SVG box.
   */
  const TAILWIND_UTILITIES = new Set([
    'block',
    'inline',
    'inline-block',
    'inline-flex',
    'flex',
    'grid',
    'contents',
    'hidden',
    'table',
    'flow-root',
    'list-item',
    'static',
    'fixed',
    'absolute',
    'relative',
    'sticky',
    'visible',
    'invisible',
    'collapse',
    'isolate',
    'container',
    'border',
    'ring',
    'shadow',
    'blur',
    'filter',
    'transform',
    'transition',
    'resize',
    'truncate',
    'underline',
    'overline',
    'italic',
    'not-italic',
    'uppercase',
    'lowercase',
    'capitalize',
    'grow',
    'shrink',
    'antialiased',
    'subpixel-antialiased',
    'sr-only',
  ]);

  it('never hands an element a class name Tailwind would claim', () => {
    for (const file of sourceFiles()) {
      for (const attribute of read(file).matchAll(/class="([^"]*)"/g)) {
        for (const token of attribute[1].split(/\s+/).filter(Boolean)) {
          expect(
            TAILWIND_UTILITIES.has(token),
            `"${token}" in ${file} collides with a Tailwind utility`,
          ).toBe(false);
        }
      }
    }
  });

  it('switches Tailwind content detection off, so custom names stay custom', () => {
    expect(styles).toContain('@import "tailwindcss" source(none);');
  });

  it('fills the widget window edge to edge, and rounds only the floating panel', () => {
    // The native widget *is* its window, and that window is a rectangle the OS
    // frames. Rounding the card inside it leaves the desktop at the four
    // corners — a white border around the widget whenever what is behind is
    // light — so the surface fills the window and only the browser build's
    // floating panel, which really does float over the app, gets a radius.
    expect(widget).toMatch(/\.mini-widget\s*{[^}]*box-shadow: inset/);
    expect(widget).not.toMatch(/\.mini-widget\s*{[^}]*border-radius/);
    expect(widget).toMatch(/\.mini-widget\.floating \{[^}]*border-radius: 18px;/s);
    expect(widget).not.toMatch(/\.mini-widget\s*{[^}]*\n\s*border:\s/);
  });

  it('asks for a transparent window and clears the page behind it', () => {
    const config = JSON.parse(read('src-tauri/tauri.conf.json')) as {
      app: { windows: Array<{ transparent?: boolean }> };
    };
    expect(config.app.windows[0].transparent).toBe(true);
    // The class is what makes the rounded corners empty rather than painted, and
    // it is claimed only while the widget is open and only where transparency
    // actually works.
    expect(uiService).toContain("classList.toggle(\n      'widget-transparent'");
    expect(styles).toContain('html.widget-transparent');
    expect(styles).toContain('widget-transparent body::before');
  });
});

describe('Whole-pixel type scale', () => {
  it('has no fractional font sizes left anywhere in the app', () => {
    const offenders = sourceFiles().filter((file) =>
      /font(?:-size)?\s*:\s*[^;{}]*\d+\.\d+(rem|em|px)/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps every font size a whole pixel of at least 10px', () => {
    for (const file of sourceFiles()) {
      for (const match of read(file).matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
        const size = Number(match[1]);
        expect(Number.isInteger(size), `${file} uses ${match[1]}px`).toBe(true);
        expect(size, `${file} uses a ${match[1]}px label`).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('publishes the scale and the radius ladder as design tokens', () => {
    for (const token of ['--text-2xs: 10px', '--text-base: 13px', '--text-5xl: 24px']) {
      expect(styles).toContain(token);
    }
    for (const token of ['--radius-sm: 8px', '--radius-lg: 12px', '--radius-2xl: 20px']) {
      expect(styles).toContain(token);
    }
  });
});

describe('Edges and text are legible on the dark surfaces', () => {
  it('keeps the muted text above the contrast floor for small type', () => {
    // 5.5:1 against #080613, where the old #5c5878 managed about 3.4:1.
    expect(styles).toContain('--color-text-muted: #8b87ab');
    expect(styles).toContain('--color-text-secondary: #b6b2d0');
  });

  it('defines the widget edge with a hairline that follows its radius', () => {
    expect(widget).toContain('box-shadow: inset 0 0 0 1px');
  });

  it('themes the platform sliders and checkboxes instead of leaving them default', () => {
    expect(styles).toContain('input[type="range"]::-webkit-slider-runnable-track');
    expect(styles).toContain('accent-color: var(--color-accent-primary)');
  });
});
