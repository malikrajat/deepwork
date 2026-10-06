import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import {
  GOATCOUNTER_DASHBOARD_URL,
  GOATCOUNTER_ORIGIN,
  GOATCOUNTER_PATH_PREFIX,
  GOATCOUNTER_TOKENS_URL,
  VISITOR_KPIS,
  VISITOR_RANGES,
  VISITOR_SCOPES,
  VISITOR_STAT_SECTIONS,
  type VisitorKpiKey,
  type VisitorSectionKey,
} from '../../../core/constants/visitor.constants';
import type { VisitorStatRow } from '../../../core/models/visitor-stats.model';
import { VisitorCounterService } from '../../../core/services/visitor-counter.service';
import { VisitorStatsService } from '../../../core/services/visitor-stats.service';
import { formatCount, shortDay } from '../../../core/utils/visitor-stats.util';
import { ExternalLinkDirective } from '../../directives/external-link.directive';

/** One day in the sparkline, with the height its bar should be drawn at. */
interface SparkBar {
  day: string;
  label: string;
  visits: number;
  height: number;
}

/**
 * "Who is reading this, and where did they come from?" — answered in one place.
 *
 * The popup has two halves, and they are different in kind. The top half is
 * what GoatCounter knows: visitors over a range, the pages they read, and the
 * browsers, systems, countries, languages, screen sizes and referrers they
 * arrived with. That needs an API token, because those lists are not public —
 * the site's settings let anybody read a *count*, and nothing else.
 *
 * The bottom half needs nothing from anybody. It is what this page can see
 * about the person in front of it — their referrer, their campaign, their
 * screen, their language, their time zone — read from the browser as the popup
 * renders and sent nowhere. It is the honest answer to "what do you know about
 * me?", and it is here rather than in the dashboard on purpose.
 */
@Component({
  selector: 'app-visitor-stats-dialog',
  imports: [ExternalLinkDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'close()',
    // The sidebar can be collapsed or opened while the panel is up, and the
    // window can be resized around it.
    '(window:resize)': 'measureSidebar()',
  },
  template: `
    @if (stats.dialogOpen()) {
      <div class="dialog-backdrop" [style.left.px]="panelLeft()" (click)="close()">
        <div
          class="dialog-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="visitor-stats-title"
          (click)="$event.stopPropagation()"
        >
          <div class="dialog-head">
            <div>
              <h2 id="visitor-stats-title" class="dialog-title gradient-text">Visitor counter</h2>
              <p class="dialog-subtitle">
                {{ siteLabel }} · the web app only — the installed desktop app has no web address to
                report, so it is never counted. Two apps share this one GoatCounter site, and every
                number below says which of them it covers.
              </p>
            </div>
            <button type="button" class="close-btn" aria-label="Close" (click)="close()">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>

          <!-- Everything above the facts needs a token; without one, ask for it. -->
          @if (!stats.hasToken()) {
            <section class="token-box">
              <h3 class="block-title">Read the numbers</h3>
              <p class="block-text">
                GoatCounter's public counter can only say how many people visited the whole site —
                which also carries rajatmalik.dev. Its API can say who came from where, on which
                browser, in which country, on which screen size — and for that it needs an API
                token.
              </p>
              <div class="token-row">
                <input
                  #tokenInput
                  class="token-input"
                  [type]="revealToken() ? 'text' : 'password'"
                  placeholder="Paste your GoatCounter API token"
                  autocomplete="off"
                  spellcheck="false"
                  aria-label="GoatCounter API token"
                  (keydown.enter)="saveToken(tokenInput.value)"
                />
                <button
                  type="button"
                  class="btn-ghost small"
                  (click)="revealToken.set(!revealToken())"
                >
                  {{ revealToken() ? 'Hide' : 'Show' }}
                </button>
                <button
                  type="button"
                  class="btn-primary small"
                  [disabled]="stats.verifying()"
                  (click)="saveToken(tokenInput.value)"
                >
                  {{ stats.verifying() ? 'Checking…' : 'Save token' }}
                </button>
              </div>
              @if (stats.tokenError(); as failure) {
                <p class="is-error" role="status" aria-live="polite">{{ failure }}</p>
              } @else {
                <p class="block-hint">
                  Make one at
                  <a appExternalLink [href]="tokensUrl" target="_blank" rel="noopener">
                    {{ tokensUrl }}
                  </a>
                  and tick only <strong>Read statistics</strong> — it can then read numbers and
                  change nothing. The token stays in this browser: not in DeepWork's database, and
                  not in the JSON it exports.
                </p>
              }
            </section>
          } @else {
            <section class="controls">
              <div class="chip-row" role="group" aria-label="Date range">
                @for (option of ranges; track option.key) {
                  <button
                    type="button"
                    class="chip"
                    [class.active]="stats.range() === option.key"
                    (click)="stats.setRange(option.key)"
                  >
                    {{ option.label }}
                  </button>
                }
              </div>
              <div class="chip-row" role="group" aria-label="Which pages">
                @for (option of scopes; track option.key) {
                  <button
                    type="button"
                    class="chip"
                    [class.active]="stats.scope() === option.key"
                    (click)="stats.setScope(option.key)"
                  >
                    {{ option.label }}
                  </button>
                }
                <button
                  type="button"
                  class="chip refresh"
                  [disabled]="stats.loading()"
                  (click)="stats.refresh()"
                >
                  {{ stats.loading() ? 'Reading…' : 'Refresh' }}
                </button>
              </div>
            </section>

            @if (stats.error(); as failure) {
              <p class="is-error" role="status" aria-live="polite">{{ failure }}</p>
            }

            @if (stats.tokenCannotReadStats()) {
              <p class="is-warning">
                This token cannot read statistics. Make another with
                <strong>Read statistics</strong>
                ticked, or the lists below will stay empty.
              </p>
            }

            <!-- Nothing below this line appears or disappears with the filter.
                 Every range and every scope draws the same four tiles, the same
                 chart frame and the same eight cards; what changes is the numbers
                 in them, and a card with nothing to report says 0 rather than
                 going away. A dashboard that rearranges itself when you narrow the
                 dates is one you have to re-read every time. -->
            @if (stats.noData()) {
              <p class="is-note">
                Nothing has been filed under <code>{{ pathPrefix }}</code> yet — the counter is in
                place, but nobody has been counted on the web app so far. Looking at it yourself in
                the browser is a visit, so this page is likely to be the first.
              </p>
            }

            <!-- Four figures, four questions: everything ever, this range,
                 today, and this month. Each one says in its own footnote what it
                 counts, because "total" and "unique" are the same noun to
                 GoatCounter and the period is the part a reader needs. -->
            <div class="kpi-grid">
              @for (kpi of kpis; track kpi.key) {
                <article class="kpi">
                  <span class="kpi-label">{{ kpi.label }}</span>
                  <span class="kpi-value">
                    @if (kpiValue(kpi.key); as value) {
                      {{ value }}
                    } @else {
                      <span class="kpi-empty" [title]="stats.loading() ? 'Reading…' : 'No answer'">
                        {{ stats.loading() ? '…' : '0' }}
                      </span>
                    }
                  </span>
                  <span class="kpi-note">{{ kpiNote(kpi.key, kpi.note) }}</span>
                </article>
              }
            </div>

            <section class="totals">
              <p class="total-caption">
                A visitor is one browser session, counted once for each page it opens — not a
                pageview, and not a person being followed. Crawlers GoatCounter recognises are left
                out, and an ad blocker hides a visit from it entirely.
                @if (stats.bundle().totals?.partial) {
                  <em>The page list was truncated, so this figure is a floor.</em>
                }
              </p>

              <!-- The chart frame is always here, even with nothing to plot: an
                   empty range is a flat line, not a missing chart. -->
              <div class="sparkline" role="img" [attr.aria-label]="'Visitors per day'">
                @for (bar of sparkBars(); track bar.day) {
                  <span
                    class="spark-bar"
                    [style.height.%]="bar.height"
                    [title]="bar.label + ': ' + bar.visits"
                  ></span>
                } @empty {
                  <span class="spark-none">{{ rangeLabel() }} — no visits yet</span>
                }
              </div>
              <div class="spark-ends">
                <span>{{ sparkStart() }}</span>
                <span>{{ sparkEnd() }}</span>
              </div>

              <div class="total-extras">
                <span>{{ countOrDash(stats.bundle().totals?.events) }} events</span>
                <span>{{ countOrDash(stats.bundle().totals?.visitorsUtc) }} by UTC days</span>
                <span class="site-share">{{ scopeNote() }}</span>
              </div>
            </section>

            @if (!stats.scopeFiltered()) {
              <p class="is-warning">
                GoatCounter ignored the path filter, so the lists below cover the whole site — both
                apps together. The headline number and the pages come from the app's own paths
                either way.
              </p>
            }

            @if (stats.failures()['totals'] || stats.failures()['pages']; as failure) {
              <p class="is-error">{{ failure }}</p>
            }

            <!-- Every card GoatCounter has an answer for, always in the same
                 order and always present: eight of them, whether or not a range
                 had any visitors in it. -->
            <div class="blocks">
              <section class="stat-block">
                <h3 class="block-title">Pages<span>visitors each</span></h3>
                <ul class="stat-list">
                  @for (row of rowsOrZero(stats.bundle().pages, stats.loading()); track row.name) {
                    <li>
                      <span class="stat-name" [title]="row.name">{{ row.name }}</span>
                      <span class="stat-bar" aria-hidden="true">
                        <span class="stat-bar-fill" [style.width.%]="row.share * 100"></span>
                      </span>
                      <span class="stat-count">{{ row.count }}</span>
                    </li>
                  }
                </ul>
                @if (stats.pagesTruncated()) {
                  <p class="block-hint">The busiest pages only.</p>
                }
                <p class="block-note">
                  Each page of this app, with the number of visitors that opened it. The busiest
                  first.
                </p>
              </section>

              @for (section of statSections; track section.key) {
                <section class="stat-block">
                  <h3 class="block-title">{{ section.label }}</h3>
                  @if (stats.failures()[section.key]; as failure) {
                    <p class="is-error">{{ failure }}</p>
                  } @else {
                    <ul class="stat-list">
                      @for (
                        row of rowsOrZero(rowsFor(section.key), stats.loading());
                        track row.name
                      ) {
                        <li>
                          <span class="stat-name" [title]="row.name">
                            {{ row.name }}
                            @if (row.note) {
                              <small>{{ row.note }}</small>
                            }
                          </span>
                          <span class="stat-bar" aria-hidden="true">
                            <span class="stat-bar-fill" [style.width.%]="row.share * 100"></span>
                          </span>
                          <span class="stat-count">{{ row.count }}</span>
                        </li>
                      }
                    </ul>
                  }
                  <p class="block-note">{{ section.note }}</p>
                </section>
              }
            </div>

            <section class="token-state">
              <span>
                @if (counter.tokenFromBuild()) {
                  Using the token built into this app
                } @else {
                  Token <strong>{{ tokenName() }}</strong>
                }
                @if (stats.tokenPermissions().length) {
                  · {{ stats.tokenPermissions().join(', ') }}
                }
              </span>
              @if (!counter.tokenFromBuild()) {
                <button type="button" class="btn-ghost small" (click)="stats.forgetToken()">
                  Forget token
                </button>
              }
            </section>
          }

          <!-- Nothing here is fetched or sent: it is this page describing itself. -->
          <div class="blocks">
            @for (group of stats.factGroups(); track group.title) {
              <section class="stat-block facts">
                <h3 class="block-title">{{ group.title }}</h3>
                <dl class="fact-list">
                  @for (fact of group.facts; track fact.label) {
                    <div class="fact">
                      <dt>{{ fact.label }}</dt>
                      <dd>
                        {{ fact.value }}
                        @if (fact.note) {
                          <small>{{ fact.note }}</small>
                        }
                      </dd>
                    </div>
                  }
                </dl>
              </section>
            }
          </div>

          <!-- The one control here that is about the app rather than about the
               report: whether this browser is counted at all. It lives in the
               popup because the settings row above it is one number and one
               button, and a counter that cannot be turned off has no business
               being in this app. -->
          <section class="count-row">
            <span>
              Count my visits
              <small>
                Anonymous: a derived session, no IP address and no cookie of GoatCounter's own. Off
                means the script is never loaded at all.
              </small>
            </span>
            <button
              type="button"
              class="switch"
              role="switch"
              [attr.aria-checked]="counter.countingEnabled()"
              [class.on]="counter.countingEnabled()"
              (click)="toggleCounting()"
            >
              <span class="knob"></span>
            </button>
          </section>

          <div class="dialog-actions">
            <a
              appExternalLink
              class="btn-ghost"
              [href]="dashboardUrl"
              target="_blank"
              rel="noopener"
            >
              Open the dashboard
            </a>
            <button type="button" class="btn-primary" (click)="close()">Close</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .dialog-backdrop {
        /* Fixed, and measured against the window rather than against whatever
           card it happens to be rendered in — which is why the shell renders it
           and not the settings row the button lives in: an ancestor with a
           backdrop-filter becomes the containing block for a fixed element, and
           the panel came out the width of that card. */
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        z-index: 220;
        display: flex;
        /* The panel is the page: this used to centre a small card, which left a
           dashboard of five columns' worth of numbers in a 620px column. */
        align-items: stretch;
        justify-content: center;
        padding: 0;
        background: rgba(6, 5, 12, 0.74);
        backdrop-filter: blur(6px);
        animation: dialog-fade 0.2s ease-out;
      }
      .dialog-card {
        width: 100%;
        max-width: none;
        height: 100%;
        max-height: none;
        overflow-y: auto;
        padding: 22px 30px 20px;
        border-radius: 0;
        /* Opaque, not glassy. --glass-bg is 4.5% white — a surface *inside* a
           card that is already there, which is exactly right for a settings group
           and exactly wrong for the one panel that has to be read on its own. On
           that background this popup was a see-through sheet with the app's own
           text showing through it. --surface-float is the token for something
           that floats above the app: 0.9 in the dark theme, 0.92 in the light
           one, so the same rule reads in both. */
        background: var(--surface-float, rgba(15, 11, 31, 0.94));
        backdrop-filter: blur(22px);
        border: none;
        box-shadow: none;
        animation: dialog-rise 0.24s ease-out;
      }
      .dialog-head {
        position: sticky;
        top: -22px;
        z-index: 3;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        /* Its own background, because the page scrolls under it. */
        background: var(--surface-float, rgba(15, 11, 31, 0.94));
        padding: 22px 0 10px;
        margin-bottom: 6px;
      }
      .dialog-title {
        font-size: 26px;
        font-weight: 800;
        letter-spacing: -0.6px;
        margin: 0;
      }
      .dialog-subtitle {
        margin: 6px 0 0;
        /* A cap, even on a full-width page: a line of prose 1800px long is not
           read, it is scanned. */
        max-width: 860px;
        font-size: 13px;
        line-height: 1.5;
        color: var(--color-text-muted, #a1a1aa);
      }
      .close-btn {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: 8px;
        cursor: pointer;
        background: transparent;
        border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.12));
        color: var(--color-text-muted, #a1a1aa);
      }
      .close-btn:hover {
        color: var(--color-text-primary, #f4f4f5);
        background: rgba(255, 255, 255, 0.06);
      }

      .block-title {
        margin: 0 0 8px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--color-text-muted, #a1a1aa);
      }
      .block-text {
        margin: 0 0 8px;
        font-size: 13px;
        line-height: 1.55;
        color: var(--color-text-secondary, #d4d4d8);
      }
      .block-hint {
        margin: 8px 0 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--color-text-muted, #a1a1aa);
      }
      /* The footnote at the foot of every card: what this list is counting. */
      .block-note {
        margin: 10px 0 0;
        padding-top: 8px;
        border-top: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
        font-size: 11px;
        line-height: 1.5;
        color: var(--color-text-muted, #a1a1aa);
      }
      .block-hint a {
        color: var(--color-accent-primary, #a78bfa);
        overflow-wrap: anywhere;
      }

      .token-box,
      .stat-block,
      .totals {
        margin-top: 16px;
        padding: 14px;
        border-radius: 14px;
        background: rgba(139, 92, 246, 0.05);
        border: 1px solid rgba(139, 92, 246, 0.16);
      }
      .token-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 10px 0 4px;
      }
      .token-input {
        flex: 1 1 auto;
        min-width: 0;
        padding: 7px 10px;
        border-radius: 8px;
        font-size: 13px;
        font-family: 'JetBrains Mono', monospace;
        border: 1px solid rgba(139, 92, 246, 0.25);
        background: var(--control-bg, rgba(255, 255, 255, 0.04));
        color: var(--color-text-primary, #f4f4f5);
      }
      .token-input:focus {
        outline: none;
        border-color: rgba(139, 92, 246, 0.55);
      }

      .controls {
        margin-top: 16px;
      }

      /* The four figures across the top. auto-fit keeps them side by side on a
         wide window and stacks them on a narrow one, which is the whole
         responsive story the panel needs. */
      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 12px;
        margin-top: 16px;
      }
      .kpi {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 14px 16px;
        border-radius: 14px;
        background: rgba(139, 92, 246, 0.05);
        border: 1px solid rgba(139, 92, 246, 0.16);
        /* The accent stripe the reference dashboard has down the left edge. */
        border-left: 3px solid var(--color-accent-primary, #a78bfa);
      }
      .kpi-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--color-text-muted, #a1a1aa);
      }
      .kpi-value {
        font-size: 34px;
        font-weight: 800;
        line-height: 1.1;
        letter-spacing: -1px;
        color: var(--color-text-primary, #f4f4f5);
      }
      .kpi-empty {
        opacity: 0.5;
      }
      .kpi-note {
        font-size: 11px;
        line-height: 1.4;
        color: var(--color-text-muted, #a1a1aa);
      }
      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
      }
      .chip {
        padding: 4px 11px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        border: 1px solid rgba(139, 92, 246, 0.2);
        background: transparent;
        color: var(--color-text-secondary, #d4d4d8);
        transition: all 0.2s;
      }
      .chip:hover:not(:disabled) {
        background: rgba(139, 92, 246, 0.12);
      }
      .chip.active {
        background: rgba(139, 92, 246, 0.24);
        border-color: rgba(139, 92, 246, 0.55);
        color: var(--color-text-primary, #f4f4f5);
      }
      .chip:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .chip.refresh {
        margin-left: auto;
      }

      .totals {
        margin-top: 14px;
      }
      .total-caption {
        margin: 8px 0 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--color-text-muted, #a1a1aa);
      }
      .total-caption em {
        font-style: italic;
        color: #fcd34d;
      }
      .total-extras {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 6px;
        font-size: 12px;
        color: var(--color-text-muted, #a1a1aa);
      }
      /* The denominator: which of the two numbers on this screen is this app's. */
      .site-share {
        color: var(--color-accent-primary, #a78bfa);
      }

      /* Two columns for everything GoatCounter breaks down, so the popup is a
         report to read rather than a list to scroll. auto-fit means one column on
         a narrow window and three or four — on a wide one, without a media query
         to keep in step. */
      .blocks {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 12px;
        margin-top: 16px;
      }
      .blocks .stat-block {
        margin-top: 0;
      }
      /* In a column this narrow a label and its value do not fit side by side, so
         the value goes underneath the label instead of being squeezed. */
      .blocks .fact {
        grid-template-columns: minmax(0, 1fr);
        gap: 1px;
      }
      .block-title span {
        margin-left: 6px;
        font-weight: 500;
        text-transform: none;
        letter-spacing: 0;
        opacity: 0.75;
      }
      .sparkline {
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 56px;
        margin-top: 12px;
        padding-top: 6px;
        border-top: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
      }
      /* An empty range still gets the frame: a flat line where the visits would
         be, not a chart that vanishes and takes the layout with it. */
      .spark-none {
        align-self: center;
        width: 100%;
        text-align: center;
        font-size: 11px;
        color: var(--color-text-muted, #a1a1aa);
      }
      .spark-bar {
        flex: 1 1 0;
        min-height: 3px;
        border-radius: 3px 3px 0 0;
        background: linear-gradient(
          to top,
          rgba(139, 92, 246, 0.35),
          var(--color-accent-primary, #a78bfa)
        );
      }
      .spark-ends {
        display: flex;
        justify-content: space-between;
        margin-top: 4px;
        font-size: 11px;
        color: var(--color-text-muted, #a1a1aa);
      }

      .stat-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .stat-list li {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(40px, 1.6fr) auto;
        /* First baseline, so the bar and the count line up with the *name* when a
           row carries a second line under it rather than with the middle of both. */
        align-items: baseline;
        gap: 8px;
        font-size: 12px;
      }
      .stat-name {
        min-width: 0;
        color: var(--color-text-secondary, #d4d4d8);
        overflow-wrap: anywhere;
      }
      /* The second line: what kind of referral this is, or which system a browser
         is running on. Quieter, and on its own line so a long hostname does not
         push the count off the card. */
      .stat-name small {
        display: block;
        margin-top: 1px;
        font-size: 11px;
        line-height: 1.35;
        color: var(--color-text-muted, #a1a1aa);
      }
      .stat-bar {
        align-self: center;
        height: 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.05);
        overflow: hidden;
      }
      .stat-bar-fill {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(139, 92, 246, 0.85), rgba(6, 182, 212, 0.75));
      }
      .stat-count {
        min-width: 34px;
        text-align: right;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--color-text-primary, #f4f4f5);
      }

      .fact-list {
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .fact {
        display: grid;
        grid-template-columns: 118px minmax(0, 1fr);
        gap: 10px;
        font-size: 12px;
      }
      .fact dt {
        color: var(--color-text-muted, #a1a1aa);
      }
      .fact dd {
        margin: 0;
        color: var(--color-text-primary, #f4f4f5);
        overflow-wrap: anywhere;
      }
      .fact dd small {
        display: block;
        margin-top: 2px;
        font-size: 11px;
        line-height: 1.45;
        color: var(--color-text-muted, #a1a1aa);
      }

      .token-state {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 14px;
        font-size: 12px;
        color: var(--color-text-muted, #a1a1aa);
      }

      .count-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        margin-top: 16px;
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(139, 92, 246, 0.05);
        border: 1px solid rgba(139, 92, 246, 0.16);
        font-size: 13px;
        color: var(--color-text-secondary, #d4d4d8);
      }
      .count-row small {
        display: block;
        margin-top: 3px;
        font-size: 11px;
        line-height: 1.45;
        color: var(--color-text-muted, #a1a1aa);
      }
      .switch {
        flex: 0 0 auto;
        width: 42px;
        height: 22px;
        border-radius: 999px;
        cursor: pointer;
        padding: 0;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.09));
        position: relative;
        transition:
          background 0.2s,
          border-color 0.2s;
      }
      .switch .knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--color-text-muted, #a1a1aa);
        transition:
          transform 0.2s,
          background 0.2s;
      }
      .switch.on {
        background: rgba(139, 92, 246, 0.35);
        border-color: rgba(139, 92, 246, 0.6);
      }
      .switch.on .knob {
        transform: translateX(20px);
        background: #ede9fe;
      }

      .is-error,
      .is-warning,
      .is-note {
        margin: 10px 0 0;
        font-size: 12px;
        line-height: 1.5;
        border-radius: 10px;
        padding: 8px 10px;
      }
      .is-note {
        color: var(--color-text-secondary, #d4d4d8);
        background: rgba(139, 92, 246, 0.08);
        border: 1px solid rgba(139, 92, 246, 0.2);
      }
      .is-error {
        color: #fca5a5;
        background: rgba(248, 113, 113, 0.08);
        border: 1px solid rgba(248, 113, 113, 0.2);
      }
      .is-warning {
        color: #fcd34d;
        background: rgba(251, 191, 36, 0.07);
        border: 1px solid rgba(251, 191, 36, 0.2);
      }

      .dialog-actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 8px;
        margin-top: 20px;
      }
      .btn-ghost,
      .btn-primary {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none;
        transition:
          background 0.2s,
          border-color 0.2s;
      }
      .btn-ghost {
        background: transparent;
        color: var(--color-text-secondary, #d4d4d8);
        border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.12));
      }
      .btn-ghost:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .btn-primary {
        background: rgba(139, 92, 246, 0.24);
        border: 1px solid rgba(139, 92, 246, 0.55);
        color: var(--color-text-primary, #f4f4f5);
      }
      .btn-primary:hover:not(:disabled) {
        background: rgba(139, 92, 246, 0.36);
      }
      .btn-primary:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .small {
        padding: 6px 11px;
        font-size: 12px;
      }

      @keyframes dialog-fade {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes dialog-rise {
        from {
          opacity: 0;
          transform: translateY(10px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
    `,
  ],
})
export class VisitorStatsDialogComponent {
  protected readonly stats = inject(VisitorStatsService);
  protected readonly counter = inject(VisitorCounterService);

  protected readonly ranges = VISITOR_RANGES;
  protected readonly scopes = VISITOR_SCOPES;
  protected readonly statSections = VISITOR_STAT_SECTIONS;
  protected readonly kpis = VISITOR_KPIS;
  protected readonly dashboardUrl = GOATCOUNTER_DASHBOARD_URL;
  protected readonly tokensUrl = GOATCOUNTER_TOKENS_URL;
  protected readonly pathPrefix = GOATCOUNTER_PATH_PREFIX;
  /** Which GoatCounter site these numbers came from, without the scheme. */
  protected readonly siteLabel = GOATCOUNTER_ORIGIN.replace('https://', '');

  /** Whether the pasted token is on screen or hidden. */
  protected readonly revealToken = signal(false);

  /**
   * Where the panel starts, in pixels from the left of the window.
   *
   * The panel covers the whole window *minus the sidebar*, and the sidebar owns
   * its own width — 240px open, 68px collapsed, and absent altogether in focus
   * mode — so the width is measured rather than guessed. A full-page report that
   * hides the way to every other page is a worse trade than a slightly smaller
   * one, and `100vw` cannot express "everything to the right of that element".
   */
  protected readonly panelLeft = signal(0);

  constructor() {
    // Measured when it opens rather than once at startup: there is no layout to
    // measure before the shell has rendered, and the sidebar can be collapsed in
    // between two openings.
    effect(() => {
      if (this.stats.dialogOpen()) this.measureSidebar();
    });
  }

  /** Put the panel's left edge wherever the sidebar's right edge is. */
  protected measureSidebar(): void {
    const sidebar = globalThis.document?.querySelector('.sidebar');
    this.panelLeft.set(sidebar ? Math.round(sidebar.getBoundingClientRect().right) : 0);
  }

  close(): void {
    this.stats.closeDialog();
  }

  /** Turn visit counting on or off — the switch is the app's, not the report's. */
  toggleCounting(): void {
    this.counter.setCounting(!this.counter.countingEnabled());
  }

  /** Save the pasted token, and let the service tell GoatCounter to check it. */
  async saveToken(value: string): Promise<void> {
    await this.stats.saveToken(value);
  }

  /** The rows for one breakdown, or `null` while it is still on its way. */
  protected rowsFor(key: VisitorSectionKey): VisitorStatRow[] | null {
    return this.stats.bundle().sections[key] ?? null;
  }

  /** The token's name, as GoatCounter knows it. */
  protected tokenName(): string {
    const info = this.stats.tokenInfo();
    if (!info?.token) return 'saved (not checked yet)';
    return info.token.name || 'unnamed';
  }

  /** The range in words, for the headline's caption. */
  protected rangeLabel(): string {
    return VISITOR_RANGES.find((entry) => entry.key === this.stats.range())?.label ?? 'This range';
  }

  /** Which slice of the site the headline covers. */
  protected scopeLabel(): string {
    return this.stats.scope() === 'deepwork' ? 'DeepWork only' : 'The whole GoatCounter site';
  }

  /**
   * One tile's figure, or `null` while it is still on the way.
   *
   * A string rather than a number so that a real `0` shows as `0`: a tile reading
   * "—" for a day nobody visited would be telling the reader it has no answer
   * when the answer is none.
   */
  protected kpiValue(key: VisitorKpiKey): string | null {
    const value = this.stats.kpis()[key];
    return value === null ? null : formatCount(value);
  }

  /**
   * A tile's footnote — and for the range tile, which range and which scope, so
   * the four figures on screen cannot be mistaken for each other.
   */
  protected kpiNote(key: VisitorKpiKey, fallback: string): string {
    return key === 'range' ? `${this.rangeLabel()} · ${this.scopeLabel()}` : fallback;
  }

  /**
   * A card's rows, or one row saying there are none.
   *
   * Every list draws through this, so a range nobody visited in produces the same
   * card as any other one — with a `0` in it — instead of a shorter report. The
   * name says "Reading…" while the answer is still on its way, so the row never
   * claims to know something it does not.
   */
  protected rowsOrZero(rows: VisitorStatRow[] | null, loading = false): VisitorStatRow[] {
    if (rows?.length) return rows;
    return [{ name: loading ? 'Reading…' : 'No visitors yet', count: 0, share: 0 }];
  }

  /** A count for the line under the chart, or a dash where there is no answer. */
  protected countOrDash(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : formatCount(value);
  }

  /** The left end of the chart: its first day, or the name of the range. */
  protected sparkStart(): string {
    return this.sparkBars()[0]?.label ?? this.rangeLabel();
  }

  /** The right end: its last day, or the fact that it runs to now. */
  protected sparkEnd(): string {
    const bars = this.sparkBars();
    return bars.length ? bars[bars.length - 1].label : 'now';
  }

  /**
   * What the four figures cover, in one line, in every state.
   *
   * One GoatCounter site carries two apps, so this line is the report's own
   * answer to "which numbers am I looking at" — and it is never absent, because
   * a scope line that disappears with the filter is exactly the kind of thing
   * that makes a dashboard have to be re-read.
   */
  protected scopeNote(): string {
    if (this.stats.scope() === 'site') {
      return 'the whole GoatCounter site — this app and rajatmalik.dev together';
    }

    const site = this.stats.siteVisitors();
    return site === null
      ? 'DeepWork’s own pages; “Whole site” has the other app in it'
      : this.siteShare(site);
  }

  /**
   * The app's visitors as a share of the whole site's, in words.
   *
   * This is the line that stops the number above being misread: one GoatCounter
   * site carries two apps, and "12 visitors" means something different depending
   * on whether it is the site's number or DeepWork's share of it.
   */
  protected siteShare(site: number): string {
    const mine = this.stats.bundle().totals?.visitors ?? 0;
    if (site <= 0) return '';
    return `${mine} of this site's ${site} visitors in this range were on DeepWork's pages`;
  }

  /** The sparkline, scaled so the tallest day fills the box. */
  protected sparkBars(): SparkBar[] {
    const totals = this.stats.bundle().totals;
    if (!totals?.series.length) return [];

    const peak = totals.peak || 1;
    return totals.series.map((point) => ({
      day: point.day,
      label: shortDay(point.day),
      visits: point.visits,
      height: Math.max(3, Math.round((point.visits / peak) * 100)),
    }));
  }
}
