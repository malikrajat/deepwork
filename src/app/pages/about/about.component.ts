import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  APP_ISSUES_URL,
  APP_NAME,
  APP_RELEASES_URL,
  APP_TAGLINE,
  APP_WEB_APP_URL,
} from '../../core/constants/app-info.constants';
import {
  AVAILABILITY,
  CONTACT_LINKS,
  DEVELOPER,
  OFFLINE_AI,
} from '../../core/constants/about.constants';
import { DOWNLOAD_TARGETS } from '../../core/constants/downloads.constants';
import type { DownloadTarget } from '../../core/constants/downloads.constants';
import { UpdateService } from '../../core/services/update.service';
import { UpdatePromptService } from '../../core/services/update-prompt.service';
import { ExternalLinkDirective } from '../../shared/directives/external-link.directive';
import { formatBytes, formatReleaseDate } from '../../core/utils/release.util';

/** The two things the page answers: who made this, and is there a newer build. */
type Tab = 'developer' | 'app';

/** One download row, with its link already resolved against the newest release. */
interface DownloadRow extends DownloadTarget {
  /** What the button says: open the web app, take the file, or go to the releases. */
  action: string;
  url: string;
  /** True for the platform this copy of the app is running on. */
  current: boolean;
}

/**
 * About: the developer, and the app.
 *
 * A user who wants to know who wrote DeepWork and a user who wants to know
 * whether they are running the latest release are asking different questions, so
 * they get a tab each rather than one long scroll — but they live on the same
 * page, because both answers belong to "about this app".
 */
@Component({
  selector: 'app-about',
  imports: [ExternalLinkDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header animate-fade-in">
      <h1 class="gradient-text page-title">About</h1>
      <p class="page-subtitle">Who builds {{ appName }}, and what you are running</p>
    </div>

    <div class="tabs animate-fade-in-delay-1" role="tablist" aria-label="About sections">
      <button
        type="button"
        role="tab"
        id="tab-developer"
        aria-controls="panel-developer"
        [attr.aria-selected]="tab() === 'developer'"
        [class.active]="tab() === 'developer'"
        (click)="show('developer')"
      >
        About the developer
      </button>
      <button
        type="button"
        role="tab"
        id="tab-app"
        aria-controls="panel-app"
        [attr.aria-selected]="tab() === 'app'"
        [class.active]="tab() === 'app'"
        (click)="show('app')"
      >
        {{ appName }} &amp; updates
        @if (updates.hasUpdate()) {
          <span class="tab-dot" aria-label="An update is available"></span>
        }
      </button>
    </div>

    <!-- ── The developer ─────────────────────────────────────────────────── -->
    @if (tab() === 'developer') {
      <div
        id="panel-developer"
        class="content animate-fade-in-delay-1"
        role="tabpanel"
        aria-labelledby="tab-developer"
      >
        <section class="card hero">
          <div class="hero-head">
            <div class="avatar" aria-hidden="true">{{ developer.initials }}</div>
            <div class="hero-who">
              <h2>{{ developer.name }}</h2>
              <p class="hero-role">{{ developer.role }}</p>
              <p class="hero-location">{{ developer.location }}</p>
            </div>
            <span class="status-pill"><span class="status-dot"></span>{{ developer.status }}</span>
          </div>

          @for (paragraph of developer.summary; track paragraph) {
            <p class="prose">{{ paragraph }}</p>
          }

          <div class="cta-row">
            <a
              class="btn primary"
              appExternalLink
              [href]="emailLink.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              Email me
            </a>
            <a
              class="btn"
              appExternalLink
              [href]="websiteLink.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit rajatmalik.dev
            </a>
          </div>
        </section>

        <section class="card">
          <div class="card-header">
            <h2>How I can help</h2>
            <p class="card-subtitle">
              Tell me which of these fits, and I will tell you honestly whether I am the right
              person for it.
            </p>
          </div>
          <ul class="option-list">
            @for (option of availability; track option.title) {
              <li>
                <span class="option-title">{{ option.title }}</span>
                <span class="option-detail">{{ option.description }}</span>
              </li>
            }
          </ul>
        </section>

        <section class="card">
          <div class="card-header">
            <h2>Get in touch</h2>
            <p class="card-subtitle">{{ developer.replyNote }}</p>
          </div>
          <ul class="contact-list">
            @for (link of contacts; track link.url) {
              <li>
                <a appExternalLink [href]="link.url" target="_blank" rel="noopener noreferrer">
                  <span class="contact-icon" aria-hidden="true">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    >
                      @switch (link.kind) {
                        @case ('email') {
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <polyline points="3,7 12,13 21,7" />
                        }
                        @case ('linkedin') {
                          <path d="M8 11v5M8 8v.01M12 16v-3a2 2 0 014 0v3" />
                          <rect x="3" y="3" width="18" height="18" rx="3" />
                        }
                        @case ('github') {
                          <path
                            d="M9 19c-4 1.5-4-2.5-6-3m12 5v-3.5a3 3 0 00-.8-2.3c2.7-.3 4.8-1.6 4.8-5.6a4.4 4.4 0 00-1.2-3 4.1 4.1 0 00-.1-3s-1.4-.4-4.5 1.7a10.6 10.6 0 00-5.4 0C4.7 3.2 3.3 3.6 3.3 3.6a4.1 4.1 0 00-.1 3A4.4 4.4 0 002 9.6c0 4 2.1 5.3 4.8 5.6a3 3 0 00-.8 2.3V21"
                          />
                        }
                        @case ('chat') {
                          <path d="M21 12a8 8 0 01-8 8H8l-4 3v-5.4A8 8 0 1121 12z" />
                        }
                        @case ('writing') {
                          <path d="M4 20h4L20 8a2.8 2.8 0 00-4-4L4 16z" />
                          <line x1="14" y1="6" x2="18" y2="10" />
                        }
                        @default {
                          <circle cx="12" cy="12" r="9" />
                          <path d="M3.6 9h16.8M3.6 15h16.8" />
                          <path d="M12 3a15 15 0 010 18a15 15 0 010-18z" />
                        }
                      }
                    </svg>
                  </span>
                  <span class="contact-text">
                    <span class="contact-label">{{ link.label }}</span>
                    <span class="contact-value">{{ link.value }}</span>
                  </span>
                  <span class="contact-open" aria-hidden="true">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    >
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                      <polyline points="15,3 21,3 21,9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </span>
                </a>
              </li>
            }
          </ul>
        </section>
      </div>
    }

    <!-- ── The app and the update check ──────────────────────────────────── -->
    @if (tab() === 'app') {
      <div
        id="panel-app"
        class="content animate-fade-in-delay-1"
        role="tabpanel"
        aria-labelledby="tab-app"
      >
        <section class="card">
          <div class="card-header">
            <h2>{{ appName }}</h2>
            <p class="card-subtitle">{{ tagline }}</p>
          </div>
          <dl class="fact-list">
            <div class="fact">
              <dt>Installed version</dt>
              <dd>{{ currentVersionLabel }}</dd>
            </div>
            <div class="fact">
              <dt>Built with</dt>
              <dd>Tauri 2 · Angular 21 · SQLite, stored on this machine</dd>
            </div>
            <div class="fact">
              <dt>Runs on</dt>
              <dd>Windows, macOS and Linux — and in the browser</dd>
            </div>
            <div class="fact">
              <dt>Analysis</dt>
              <dd>AI-assisted, run offline against your own data — nothing leaves this machine</dd>
            </div>
          </dl>
        </section>

        <section class="card">
          <div class="card-header">
            <h2>{{ offlineAi.headline }}</h2>
            <p class="card-subtitle">{{ offlineAi.summary }}</p>
          </div>
          <ul class="option-list">
            @for (note of offlineAi.notes; track note.title) {
              <li>
                <span class="option-title">{{ note.title }}</span>
                <span class="option-detail">{{ note.detail }}</span>
              </li>
            }
          </ul>
        </section>

        <section class="card">
          <div class="card-header">
            <h2>Get it on another device</h2>
            <p class="card-subtitle">
              The same {{ appName }}, from the same source: open it in a browser, or install it on
              Windows, macOS or Linux. It stores everything on the machine you run it on, so nothing
              has to be moved over.
            </p>
          </div>

          <ul class="download-list">
            @for (row of downloads(); track row.kind) {
              <li [class.current]="row.current">
                <span class="download-icon" aria-hidden="true">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  >
                    @switch (row.kind) {
                      @case ('web') {
                        <circle cx="12" cy="12" r="9" />
                        <path d="M3.6 9h16.8M3.6 15h16.8" />
                        <path d="M12 3a15 15 0 010 18a15 15 0 010-18z" />
                      }
                      @case ('windows') {
                        <rect x="3" y="3" width="8" height="8" rx="1.2" />
                        <rect x="13" y="3" width="8" height="8" rx="1.2" />
                        <rect x="3" y="13" width="8" height="8" rx="1.2" />
                        <rect x="13" y="13" width="8" height="8" rx="1.2" />
                      }
                      @case ('macos') {
                        <rect x="3" y="4" width="18" height="12" rx="2" />
                        <line x1="2" y1="19" x2="22" y2="19" />
                      }
                      @default {
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <polyline points="7,9 10,12 7,15" />
                        <line x1="12" y1="16" x2="17" y2="16" />
                      }
                    }
                  </svg>
                </span>
                <span class="download-text">
                  <span class="download-name">
                    {{ row.name }}
                    @if (row.current) {
                      <span class="download-badge">This device</span>
                    }
                  </span>
                  <span class="download-detail">{{ row.detail }}</span>
                </span>
                <a
                  class="btn"
                  appExternalLink
                  [href]="row.url"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ row.action }}
                </a>
              </li>
            }
          </ul>

          <p class="card-subtitle download-note">
            Every installer is published with its release on
            <a
              class="inline-link"
              appExternalLink
              [href]="releasesUrl"
              target="_blank"
              rel="noopener noreferrer"
              >GitHub</a
            >. The web app is served from GitHub Pages.
          </p>
        </section>

        <section class="card update-card">
          <div class="card-header">
            <h2>Check for updates</h2>
            <p class="card-subtitle">
              New builds are published as GitHub releases. This checks the release list for anything
              newer than the copy you are running.
            </p>
          </div>

          <div [class]="'update-row state-' + updates.status()">
            <span class="update-icon" aria-hidden="true">
              @switch (updates.status()) {
                @case ('checking') {
                  <svg
                    class="spin"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  >
                    <path d="M21 12a9 9 0 11-3-6.7" />
                  </svg>
                }
                @case ('update-available') {
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  >
                    <path d="M12 3v12" />
                    <polyline points="7,10 12,15 17,10" />
                    <path d="M5 20h14" />
                  </svg>
                }
                @case ('up-to-date') {
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.4"
                    stroke-linecap="round"
                  >
                    <polyline points="20,6 9,17 4,12" />
                  </svg>
                }
                @case ('unavailable') {
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <line x1="12" y1="8" x2="12" y2="13" />
                    <line x1="12" y1="16.5" x2="12.01" y2="16.5" />
                  </svg>
                }
                @default {
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v8M8 12h8" />
                  </svg>
                }
              }
            </span>
            <div class="update-text">
              <span class="update-title">{{ statusTitle() }}</span>
              <span class="update-detail">{{ statusDetail() }}</span>
            </div>
          </div>

          <div class="update-actions">
            <button
              type="button"
              class="btn primary"
              [disabled]="updates.checking()"
              (click)="checkForUpdates()"
            >
              {{ updates.checking() ? 'Checking…' : 'Check for updates' }}
            </button>

            @if (updates.hasUpdate() && platformAsset(); as asset) {
              @if (prompt.isDesktopApp) {
                <button
                  type="button"
                  class="btn primary"
                  [disabled]="prompt.busy() || prompt.state() === 'started'"
                  (click)="prompt.install()"
                >
                  {{ installLabel() }}
                </button>
              }
              <a
                class="btn primary download"
                appExternalLink
                [href]="asset.downloadUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                Download {{ asset.name }} ({{ assetSize() }})
              </a>
            }

            <a
              class="btn"
              appExternalLink
              [href]="releasesUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              All releases
            </a>
          </div>

          @if (prompt.error(); as failure) {
            <p class="update-note error">{{ failure }}</p>
          }
          @if (installNote(); as note) {
            <p class="update-note">{{ note }}</p>
          }

          @if (updates.hasUpdate() && latest(); as release) {
            <div class="release">
              <div class="release-head">
                <span class="release-version">{{ release.tag }}</span>
                @if (release.publishedAt) {
                  <span class="release-date">published {{ releaseDate() }}</span>
                }
                @if (release.prerelease) {
                  <span class="release-flag">pre-release</span>
                }
              </div>
              @if (releaseNotes()) {
                <p class="release-notes">{{ releaseNotes() }}</p>
              }
              <a
                class="release-link"
                appExternalLink
                [href]="release.url"
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the full release notes
              </a>

              @if (otherAssets().length > 0) {
                <details class="other-assets">
                  <summary>Other files in this release</summary>
                  <ul>
                    @for (asset of otherAssets(); track asset.downloadUrl) {
                      <li>
                        <a
                          appExternalLink
                          [href]="asset.downloadUrl"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {{ asset.name }}
                        </a>
                        <span class="asset-size">{{ formatSize(asset.size) }}</span>
                      </li>
                    }
                  </ul>
                </details>
              }
            </div>
          }
        </section>

        <section class="card">
          <div class="card-header">
            <h2>This project</h2>
          </div>
          <ul class="link-list">
            <li>
              <a appExternalLink [href]="issuesUrl" target="_blank" rel="noopener noreferrer">
                Report a bug or request a feature
              </a>
            </li>
          </ul>
          <p class="card-subtitle">
            {{ appName }} is built and maintained by
            <a
              class="inline-link"
              appExternalLink
              [href]="websiteLink.url"
              target="_blank"
              rel="noopener noreferrer"
              >{{ developer.name }}</a
            >. It stores everything locally, has no accounts and no telemetry.
          </p>
        </section>

        <p class="signature">
          © {{ year }} {{ developer.name }} · {{ developer.role }} ·
          <a
            class="inline-link"
            appExternalLink
            [href]="emailLink.url"
            target="_blank"
            rel="noopener noreferrer"
            >{{ emailLink.value }}</a
          >
        </p>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .page-header {
        margin-bottom: var(--space-lg);
      }
      .page-title {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.5px;
      }
      .page-subtitle {
        color: var(--color-text-muted);
        margin-top: 4px;
        font-size: 14px;
      }

      /* ── Tabs ───────────────────────────────────────────────────────── */
      .tabs {
        display: inline-flex;
        gap: 4px;
        padding: 4px;
        margin-bottom: var(--space-md);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(139, 92, 246, 0.12);
      }
      .tabs button {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--color-text-secondary);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      .tabs button:hover {
        color: var(--color-text-primary);
        background: rgba(139, 92, 246, 0.1);
      }
      .tabs button.active {
        color: var(--color-text-primary);
        background: rgba(139, 92, 246, 0.18);
        box-shadow: 0 0 14px rgba(139, 92, 246, 0.18);
      }
      .tab-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--color-accent-secondary);
        box-shadow: 0 0 8px rgba(6, 182, 212, 0.7);
      }

      /* ── Cards ──────────────────────────────────────────────────────── */
      .content {
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
        max-width: 780px;
        padding-bottom: var(--space-xl);
      }
      .card {
        background: var(--glass-bg);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(139, 92, 246, 0.08);
        border-radius: 16px;
        padding: var(--space-lg);
        transition: border-color 0.3s;
      }
      .card:hover {
        border-color: rgba(139, 92, 246, 0.15);
      }
      .card-header h2 {
        font-size: 16px;
        font-weight: 700;
        color: var(--color-text-primary);
      }
      .card-header {
        margin-bottom: var(--space-md);
      }
      .card-subtitle {
        font-size: 12px;
        line-height: 1.6;
        color: var(--color-text-muted);
        margin-top: 6px;
      }
      .prose {
        font-size: 14px;
        line-height: 1.75;
        color: var(--color-text-secondary);
        margin-top: var(--space-sm);
      }

      /* ── Hero ───────────────────────────────────────────────────────── */
      .hero-head {
        display: flex;
        align-items: center;
        gap: var(--space-md);
        flex-wrap: wrap;
      }
      .avatar {
        width: 56px;
        height: 56px;
        flex-shrink: 0;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 16px;
        letter-spacing: 0.5px;
        color: #f5f3ff;
        background: var(--color-accent-gradient);
        box-shadow: 0 0 22px rgba(139, 92, 246, 0.35);
      }
      .hero-who {
        flex: 1;
        min-width: 200px;
      }
      .hero-who h2 {
        font-size: 18px;
        font-weight: 800;
        color: var(--color-text-primary);
      }
      .hero-role {
        font-size: 13px;
        color: var(--color-text-secondary);
        margin-top: 3px;
      }
      .hero-location {
        font-size: 12px;
        color: var(--color-text-muted);
        margin-top: 2px;
      }
      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        color: var(--color-success);
        background: rgba(52, 211, 153, 0.1);
        border: 1px solid rgba(52, 211, 153, 0.25);
      }
      .status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--color-success);
        box-shadow: 0 0 8px rgba(52, 211, 153, 0.8);
      }
      .cta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: var(--space-md);
      }

      /* ── Buttons and links ──────────────────────────────────────────── */
      .btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 8px;
        border: 1px solid rgba(139, 92, 246, 0.2);
        background: rgba(139, 92, 246, 0.06);
        color: var(--color-text-primary);
        font-size: 12px;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
        transition: all 0.2s;
      }
      .btn:hover {
        background: rgba(139, 92, 246, 0.14);
        border-color: rgba(139, 92, 246, 0.4);
      }
      .btn.primary {
        background: rgba(139, 92, 246, 0.16);
        border-color: rgba(139, 92, 246, 0.4);
      }
      .btn.primary:hover {
        background: rgba(139, 92, 246, 0.26);
        border-color: rgba(139, 92, 246, 0.6);
      }
      .btn:disabled {
        opacity: 0.6;
        cursor: default;
      }
      .btn.download {
        background: rgba(6, 182, 212, 0.14);
        border-color: rgba(6, 182, 212, 0.4);
      }
      .btn.download:hover {
        background: rgba(6, 182, 212, 0.24);
      }
      .inline-link,
      .release-link {
        color: var(--color-accent-secondary);
        text-decoration: none;
      }
      .inline-link:hover,
      .release-link:hover {
        text-decoration: underline;
      }

      /* ── Lists ──────────────────────────────────────────────────────── */
      .option-list,
      .work-list,
      .contact-list,
      .link-list {
        list-style: none;
        display: flex;
        flex-direction: column;
      }
      .option-list li {
        display: flex;
        gap: 10px;
        padding: 9px 0;
        border-bottom: 1px solid var(--glass-border);
        font-size: 13px;
      }
      .option-list li:last-child {
        border-bottom: none;
      }
      .option-title {
        flex: 0 0 170px;
        font-weight: 600;
        color: var(--color-text-primary);
      }
      .option-detail {
        color: var(--color-text-muted);
        line-height: 1.6;
      }
      .contact-list {
        gap: 6px;
      }
      .contact-list li a {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 12px;
        text-decoration: none;
        border: 1px solid transparent;
        transition: all 0.2s;
      }
      .contact-list li a:hover {
        background: rgba(139, 92, 246, 0.08);
        border-color: rgba(139, 92, 246, 0.2);
      }
      .contact-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        border-radius: 10px;
        color: var(--color-accent-primary);
        background: rgba(139, 92, 246, 0.1);
      }
      .contact-text {
        flex: 1;
        min-width: 0;
      }
      .contact-label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: var(--color-text-secondary);
      }
      .contact-value {
        display: block;
        font-size: 12px;
        color: var(--color-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .contact-open {
        color: var(--color-text-muted);
      }
      .download-list {
        list-style: none;
        display: flex;
        flex-direction: column;
      }
      .download-list li {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        padding: 10px 0;
        border-bottom: 1px solid var(--glass-border);
      }
      .download-list li:last-child {
        border-bottom: none;
      }
      .download-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        border-radius: 10px;
        color: var(--color-accent-secondary);
        background: rgba(6, 182, 212, 0.1);
      }
      .download-text {
        flex: 1;
        min-width: 160px;
      }
      .download-name {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text-primary);
      }
      .download-detail {
        display: block;
        font-size: 12px;
        line-height: 1.6;
        color: var(--color-text-muted);
        margin-top: 2px;
      }
      .download-badge {
        padding: 1px 7px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-accent-secondary);
        background: rgba(6, 182, 212, 0.12);
        border: 1px solid rgba(6, 182, 212, 0.28);
      }
      .download-note {
        margin-top: var(--space-md);
      }
      .link-list li {
        padding: 8px 0;
        border-bottom: 1px solid var(--glass-border);
      }
      .link-list li:last-child {
        border-bottom: none;
      }
      .link-list li a {
        font-size: 13px;
        color: var(--color-accent-secondary);
        text-decoration: none;
      }
      .link-list li a:hover {
        text-decoration: underline;
      }

      /* ── Update check ───────────────────────────────────────────────── */
      .update-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--glass-border);
      }
      .update-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        border-radius: 50%;
        color: var(--color-text-secondary);
        background: rgba(255, 255, 255, 0.05);
      }
      .update-row.state-update-available {
        background: rgba(6, 182, 212, 0.08);
        border-color: rgba(6, 182, 212, 0.28);
      }
      .update-row.state-update-available .update-icon {
        color: var(--color-accent-secondary);
        background: rgba(6, 182, 212, 0.14);
      }
      .update-row.state-up-to-date {
        background: rgba(52, 211, 153, 0.07);
        border-color: rgba(52, 211, 153, 0.24);
      }
      .update-row.state-up-to-date .update-icon {
        color: var(--color-success);
        background: rgba(52, 211, 153, 0.14);
      }
      .update-row.state-unavailable {
        background: rgba(251, 191, 36, 0.07);
        border-color: rgba(251, 191, 36, 0.24);
      }
      .update-row.state-unavailable .update-icon {
        color: var(--color-warning);
        background: rgba(251, 191, 36, 0.14);
      }
      .update-text {
        min-width: 0;
      }
      .update-title {
        display: block;
        font-size: 14px;
        font-weight: 700;
        color: var(--color-text-primary);
      }
      .update-detail {
        display: block;
        font-size: 12px;
        line-height: 1.6;
        color: var(--color-text-muted);
        margin-top: 2px;
      }
      .update-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: var(--space-md);
      }
      .update-note {
        font-size: 12px;
        line-height: 1.6;
        color: var(--color-text-secondary);
        margin-top: var(--space-sm);
      }
      .update-note.error {
        color: var(--color-danger);
      }
      .spin {
        animation: spin 0.9s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      .release {
        margin-top: var(--space-md);
        padding-top: var(--space-md);
        border-top: 1px solid var(--glass-border);
      }
      .release-head {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .release-version {
        font-family: 'JetBrains Mono', monospace;
        font-size: 14px;
        font-weight: 700;
        color: var(--color-text-primary);
      }
      .release-date,
      .asset-size {
        font-size: 11px;
        color: var(--color-text-muted);
      }
      .release-flag {
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-warning);
        background: rgba(251, 191, 36, 0.12);
        border: 1px solid rgba(251, 191, 36, 0.24);
      }
      .release-notes {
        font-size: 12px;
        line-height: 1.7;
        color: var(--color-text-secondary);
        white-space: pre-wrap;
        margin-top: 10px;
        padding: 12px;
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.18);
        border: 1px solid var(--glass-border);
        max-height: 260px;
        overflow-y: auto;
      }
      .release-link {
        display: inline-block;
        font-size: 12px;
        margin-top: 10px;
      }
      .other-assets {
        margin-top: 10px;
        font-size: 12px;
        color: var(--color-text-muted);
      }
      .other-assets summary {
        cursor: pointer;
      }
      .other-assets ul {
        list-style: none;
        margin-top: 6px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .other-assets li {
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }
      .other-assets a {
        color: var(--color-accent-secondary);
        text-decoration: none;
      }
      .other-assets a:hover {
        text-decoration: underline;
      }
      .fact-list {
        display: flex;
        flex-direction: column;
      }
      .fact {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 9px 0;
        border-bottom: 1px solid var(--glass-border);
        font-size: 13px;
      }
      .fact:last-child {
        border-bottom: none;
      }
      .fact dt {
        color: var(--color-text-muted);
      }
      .fact dd {
        color: var(--color-text-primary);
        font-weight: 600;
        text-align: right;
      }
      .signature {
        font-size: 11px;
        color: var(--color-text-muted);
        text-align: center;
        line-height: 1.7;
      }
    `,
  ],
})
export class AboutComponent implements OnInit {
  protected readonly updates = inject(UpdateService);
  protected readonly prompt = inject(UpdatePromptService);

  readonly tab = signal<Tab>('developer');

  // Content from the constants files, exposed for the template.
  readonly appName = APP_NAME;
  readonly tagline = APP_TAGLINE;
  readonly currentVersionLabel = this.updates.currentVersionLabel;
  readonly releasesUrl = APP_RELEASES_URL;
  readonly issuesUrl = APP_ISSUES_URL;

  readonly developer = DEVELOPER;
  readonly availability = AVAILABILITY;
  readonly contacts = CONTACT_LINKS;
  readonly offlineAi = OFFLINE_AI;

  readonly latest = this.updates.latest;
  readonly platformAsset = this.updates.platformAsset;
  readonly releaseNotes = this.updates.releaseNotes;

  /** The two links used in more than one place on the page. */
  readonly emailLink = CONTACT_LINKS.find((link) => link.kind === 'email')!;
  readonly websiteLink = CONTACT_LINKS.find((link) => link.kind === 'website')!;

  readonly year = new Date().getFullYear();

  /** Everything in the release except the installer for this machine. */
  readonly otherAssets = computed(() => {
    const release = this.latest();
    if (!release) return [];
    const primary = this.platformAsset();
    return release.assets.filter((asset) => asset.downloadUrl !== primary?.downloadUrl);
  });

  /** The size of the matched installer, as text. */
  readonly assetSize = computed(() => formatBytes(this.platformAsset()?.size ?? 0));

  /**
   * Everywhere else DeepWork runs, with each link resolved against the release
   * that has already been fetched.
   *
   * A platform whose installer is in the newest release links straight to the
   * file; a platform that release carries nothing for — or a release that has
   * not been read yet — links to the releases page rather than guessing an
   * address for a file that may not exist.
   */
  readonly downloads = computed<DownloadRow[]>(() =>
    DOWNLOAD_TARGETS.map((target): DownloadRow => {
      if (target.kind === 'web') {
        return { ...target, url: APP_WEB_APP_URL, action: 'Open in browser', current: false };
      }

      const asset = this.updates.assetFor(target.kind);
      return {
        ...target,
        url: asset?.downloadUrl ?? this.releasesUrl,
        action: asset ? `Download · ${formatBytes(asset.size)}` : 'Find it in releases',
        current: target.kind === this.updates.platform,
      };
    }),
  );

  /** The release date, ready to read. */
  readonly releaseDate = computed(() => formatReleaseDate(this.latest()?.publishedAt ?? null));

  ngOnInit(): void {
    // Opening the page counts as asking: a stored answer is shown immediately and
    // refreshed in the background when it is older than the check interval.
    void this.updates.start();
  }

  show(tab: Tab): void {
    this.tab.set(tab);
  }

  /** One line saying what the current state means for this build. */
  statusTitle(): string {
    switch (this.updates.status()) {
      case 'checking':
        return 'Checking GitHub…';
      case 'update-available':
        return `Version ${this.updates.latestVersion()} is available`;
      case 'up-to-date':
        return `You are on the latest release (${this.currentVersionLabel})`;
      case 'ahead':
        return `You are running ${this.currentVersionLabel}, newer than the latest release`;
      case 'unavailable':
        return 'Could not check for updates';
      default:
        return `You are running ${this.currentVersionLabel}`;
    }
  }

  /** The second line: version details, the failure reason, or what happens next. */
  statusDetail(): string {
    const status = this.updates.status();
    const latest = this.updates.latestVersion();

    if (status === 'checking') return 'Reading the release list from GitHub.';
    if (status === 'unavailable') {
      return this.updates.error() ?? 'Something went wrong. Try again in a moment.';
    }
    if (status === 'up-to-date') {
      return latest ? `The latest published release is ${latest}.` : 'Nothing newer is published.';
    }
    if (status === 'ahead') {
      return latest
        ? `The latest published release is ${latest}; this build is newer.`
        : 'This build is newer than anything published.';
    }
    if (status === 'update-available') {
      const asset = this.platformAsset();
      return asset
        ? `Installed: ${this.currentVersionLabel}. Download ${asset.name} below, or read the release notes first.`
        : `Installed: ${this.currentVersionLabel}. Open the release page to pick your installer.`;
    }
    return 'Press "Check for updates" to ask GitHub for the latest release.';
  }

  /** The button: always a real check, even when the cached answer is fresh. */
  async checkForUpdates(): Promise<void> {
    await this.updates.check();
  }

  /** What the install button says while it is working. */
  readonly installLabel = computed(() => {
    switch (this.prompt.state()) {
      case 'downloading':
        return `Downloading… ${this.prompt.percent()}%`;
      case 'installing':
        return 'Starting the installer…';
      case 'started':
        return 'Installer started';
      default:
        return 'Update now';
    }
  });

  /** What the OS did with the installer, once it has been handed over. */
  readonly installNote = computed(() =>
    this.prompt.state() === 'started' ? this.prompt.note() : null,
  );

  formatSize(bytes: number): string {
    return formatBytes(bytes);
  }
}
