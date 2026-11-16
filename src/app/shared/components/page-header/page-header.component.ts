import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * The page header every section shares.
 *
 * The dashboard grew a header that says three things at a glance — a small
 * uppercase eyebrow that names the kind of page, a large title, and one line of
 * context underneath — with its actions pushed to the right. Every other page
 * still opened with a bare `<h1>`, so the app read as a dashboard bolted onto a
 * set of older screens.
 *
 * This component is that header, once. Pages pass their three strings and
 * project their own controls into the action slot; spacing, type scale, the
 * gradient title, wrapping and the phone layout all come from here, so a page
 * cannot drift out of step by being written on a different afternoon.
 */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <div class="header-copy">
        @if (eyebrow) {
          <span class="page-eyebrow">{{ eyebrow }}</span>
        }
        <h1 class="page-title gradient-text">{{ title }}</h1>
        @if (subtitle) {
          <p class="page-subtitle">{{ subtitle }}</p>
        }
      </div>
      <div class="header-actions">
        <ng-content />
      </div>
    </header>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .page-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: var(--space-md);
        margin-bottom: 18px;
      }
      .header-copy {
        min-width: 0;
      }
      .page-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--color-accent-secondary);
        font-size: var(--text-2xs);
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        line-height: 1;
      }
      .page-title {
        margin: 7px 0 0;
        font-size: clamp(30px, 2.8vw, 40px);
        font-weight: 800;
        letter-spacing: -0.04em;
        line-height: 1;
      }
      .page-subtitle {
        margin: 8px 0 0;
        max-width: 78ch;
        color: var(--color-text-muted);
        font-size: var(--text-sm);
        line-height: 1.45;
      }
      .header-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: var(--space-sm);
        flex-wrap: wrap;
        flex-shrink: 0;
      }

      @media (max-width: 720px) {
        .page-header {
          align-items: flex-start;
          flex-direction: column;
        }
        .page-title {
          font-size: clamp(27px, 8vw, 34px);
        }
        .header-actions {
          width: 100%;
          justify-content: flex-start;
        }
      }

      @media (min-width: 2560px) {
        .page-title {
          font-size: var(--text-7xl);
        }
        .page-subtitle {
          font-size: var(--text-md);
        }
      }
    `,
  ],
})
export class PageHeaderComponent {
  /**
   * The small line above the title: "Plan the day", "Reflect", "Tune it".
   *
   * Plain `@Input()` rather than a signal input on purpose. This component is
   * the one child that the About page's unit tests render through Angular's JIT
   * compiler, which cannot resolve signal inputs; the page would otherwise
   * arrive in that suite with a blank title and a required-input error. The
   * six lines of projection below are all it does, so there is no reactivity
   * here worth paying that cost for.
   */
  @Input() eyebrow = '';
  /** The page name. This is the `.page-title` every test and screen reader reads. */
  @Input({ required: true }) title = '';
  /** One line of context: the date, a count, or what the page is for. */
  @Input() subtitle = '';
}
