import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { VISITOR_RANGES } from '../../../core/constants/visitor.constants';
import { VisitorCounterService } from '../../../core/services/visitor-counter.service';
import { VisitorStatsService } from '../../../core/services/visitor-stats.service';

/**
 * The settings row for the visitor counter, and the door to the details popup.
 *
 * One number and one button, deliberately: the figure is the only thing worth a
 * row here, and everything else the counter can say is a click away in the popup
 * — including whether to be counted at all, which is a decision about the app
 * rather than a setting to be read at a glance.
 *
 * The popup itself is rendered by the app shell, not by this row: see `app.html`
 * for why. This component only opens it.
 *
 * This is a web-only feature, and the desktop app says so rather than hiding the
 * group: a setting that vanishes looks like a bug, while a line explaining that
 * the packaged app has no web address to report looks like an answer. The
 * counting itself refuses to run there as well — the panel is the explanation,
 * not the enforcement.
 */
@Component({
  selector: 'app-visitor-counter-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="group-header">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M3 12h4l3 8 4-16 3 8h4" />
      </svg>
      <span>Visitor Counter</span>
    </div>

    @if (counter.isWeb) {
      <div class="setting-item">
        <span>
          Visitors
          <small class="setting-note">{{ countNote() }}</small>
        </span>
        <div class="counter-control">
          <span class="counter-value">{{ visitorCount() }}</span>
          <button type="button" class="action-btn primary" (click)="stats.openDialog()">
            Details
          </button>
        </div>
      </div>

      @if (counter.counterError(); as failure) {
        <p class="panel-error" role="status" aria-live="polite">{{ failure }}</p>
      }
      <!-- The dialog is not rendered here on purpose: this row lives inside a
           setting-group, whose backdrop-filter makes it the containing block for
           position: fixed, so the panel rendered from here was the width of this
           card. The shell renders it — see app.html. -->
    } @else {
      <div class="setting-item">
        <span>
          Web app only
          <small class="setting-note"
            >The packaged desktop app is not counted: it is served from your own disk, has no web
            address to report, and how many people opened your laptop is nobody's business. The
            counter runs in the browser build, at malikrajat.github.io/deepwork</small
          >
        </span>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .group-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--color-text-muted);
        margin-bottom: var(--space-md, 16px);
        padding-bottom: var(--space-sm, 8px);
        border-bottom: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
      }
      .group-header svg {
        opacity: 0.5;
      }
      .setting-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 10px 0;
        font-size: 14px;
        color: var(--color-text-secondary);
        border-bottom: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
      }
      .setting-item:last-child {
        border-bottom: none;
      }
      .setting-note {
        display: block;
        font-size: 10px;
        line-height: 1.45;
        color: var(--color-text-muted);
        margin-top: 2px;
        max-width: 320px;
      }
      .counter-control {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .counter-value {
        min-width: 34px;
        text-align: right;
        font-weight: 700;
        font-size: 15px;
        font-variant-numeric: tabular-nums;
        color: var(--color-text-primary);
      }
      .panel-error {
        margin: 10px 0 0;
        font-size: 12px;
        line-height: 1.5;
        color: #fca5a5;
      }
      .action-btn {
        padding: 6px 14px;
        border-radius: 8px;
        border: 1px solid rgba(139, 92, 246, 0.2);
        background: rgba(139, 92, 246, 0.06);
        color: var(--color-text-primary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }
      .action-btn.primary {
        background: rgba(139, 92, 246, 0.1);
        border-color: rgba(139, 92, 246, 0.35);
      }
      .action-btn:hover {
        background: rgba(139, 92, 246, 0.22);
        border-color: rgba(139, 92, 246, 0.6);
      }
    `,
  ],
})
export class VisitorCounterPanelComponent implements OnInit {
  protected readonly counter = inject(VisitorCounterService);
  protected readonly stats = inject(VisitorStatsService);

  ngOnInit(): void {
    void this.counter.loadTotal();
    void this.stats.loadHeadline();
  }

  /**
   * The number to show, in order of how much it is worth.
   *
   * With a token it is this app's own visitors over the last seven days, which
   * is the number somebody actually wants. Without one the public counter can
   * only answer for the whole GoatCounter site — which carries rajatmalik.dev
   * too — and saying so under the number is more honest than showing a figure
   * that quietly belongs to two apps at once.
   */
  protected visitorCount(): string {
    const headline = this.stats.headline();
    if (headline) return String(headline.visitors);
    if (this.stats.headlineLoading()) return '…';
    if (this.counter.total() !== null) return this.counter.total() as string;
    if (this.counter.counterLoading()) return '…';
    return '—';
  }

  /** What the number above is, in one line. */
  protected countNote(): string {
    if (this.stats.headline()) {
      const range = VISITOR_RANGES.find((entry) => entry.key === this.stats.range());
      return `${range?.label ?? 'Last 7 days'} · this web app only, from the API`;
    }
    if (this.stats.headlineLoading()) return 'Reading the GoatCounter API…';

    const failure = this.stats.failures()['totals'];
    if (failure) return failure;

    if (!this.counter.token()) {
      return 'The whole site — DeepWork and rajatmalik.dev together. The public counter cannot separate them; a token in the popup can';
    }
    return 'This web app only. The public counter below the popup covers the whole site';
  }
}
