import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CONTACT_EMAIL } from '../../core/constants/about.constants';
import { LEGAL_DOCUMENTS, type LegalDocumentId } from '../../core/constants/legal.constants';

/**
 * One page for the two documents that answer "what does this app do with my
 * data" and "what am I agreeing to".
 *
 * Both are prose, read top to bottom, and share the same shape: a title, a
 * last-updated line, headed sections, and a way from one document to the other.
 * The text lives in `legal.constants.ts`; the route decides which one to show.
 */
@Component({
  selector: 'app-legal',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header animate-fade-in">
      <a class="back-link" routerLink="/about">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12,19 5,12 12,5" />
        </svg>
        Back to About
      </a>
      <h1 class="gradient-text page-title">{{ document.title }}</h1>
      <p class="page-subtitle">{{ document.subtitle }}</p>
      <p class="updated">Last updated {{ document.updated }}</p>
    </div>

    <article class="legal-card animate-fade-in-delay-1">
      @for (section of document.sections; track section.heading) {
        <section class="legal-section">
          <h2>{{ section.heading }}</h2>
          @for (paragraph of section.paragraphs; track paragraph) {
            <p>{{ paragraph }}</p>
          }
          @if (section.bullets?.length) {
            <ul>
              @for (bullet of section.bullets; track bullet) {
                <li>{{ bullet }}</li>
              }
            </ul>
          }
        </section>
      }

      <footer class="legal-footer">
        <p>
          Questions? Write to
          <a class="inline-link" [href]="mailto">{{ contactEmail }}</a
          >.
        </p>
        <nav class="legal-nav" aria-label="Policies and contact">
          <a routerLink="/privacy" [class.current]="document.id === 'privacy'">Privacy policy</a>
          <a routerLink="/terms" [class.current]="document.id === 'terms'"
            >Terms &amp; conditions</a
          >
          <a routerLink="/contact">Contact us</a>
        </nav>
      </footer>
    </article>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .page-header {
        max-width: 820px;
        margin-inline: auto;
        margin-bottom: var(--space-lg);
      }
      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-bottom: var(--space-md);
        font-size: 12px;
        font-weight: 600;
        color: var(--color-text-muted);
        text-decoration: none;
        transition: color 0.2s;
      }
      .back-link:hover {
        color: var(--color-text-primary);
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
        line-height: 1.6;
      }
      .updated {
        margin-top: 10px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-accent-secondary);
      }

      .legal-card {
        max-width: 820px;
        margin-inline: auto;
        padding: var(--space-lg);
        border-radius: 16px;
        background: var(--glass-bg);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(139, 92, 246, 0.08);
        padding-bottom: var(--space-xl);
      }

      .legal-section {
        padding: 16px 0;
        border-bottom: 1px solid var(--glass-border);
      }
      .legal-section:first-child {
        padding-top: 0;
      }
      .legal-section h2 {
        margin-bottom: 8px;
        font-size: 15px;
        font-weight: 700;
        color: var(--color-text-primary);
      }
      .legal-section p {
        margin-top: 8px;
        font-size: 13px;
        line-height: 1.75;
        color: var(--color-text-secondary);
      }
      .legal-section ul {
        margin-top: 10px;
        padding-left: 20px;
        display: flex;
        flex-direction: column;
        gap: 7px;
        color: var(--color-text-secondary);
        font-size: 13px;
        line-height: 1.65;
      }
      .legal-section li::marker {
        color: var(--color-accent-secondary);
      }

      .legal-footer {
        padding-top: var(--space-md);
      }
      .legal-footer p {
        font-size: 13px;
        line-height: 1.7;
        color: var(--color-text-secondary);
      }
      .inline-link {
        color: var(--color-accent-secondary);
        text-decoration: none;
      }
      .inline-link:hover {
        text-decoration: underline;
      }
      .legal-nav {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: var(--space-md);
      }
      .legal-nav a {
        display: inline-flex;
        align-items: center;
        min-height: 36px;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid rgba(139, 92, 246, 0.18);
        background: rgba(139, 92, 246, 0.06);
        color: var(--color-text-secondary);
        font-size: 12px;
        font-weight: 600;
        text-decoration: none;
        transition:
          background 0.2s,
          border-color 0.2s,
          color 0.2s;
      }
      .legal-nav a:hover {
        background: rgba(139, 92, 246, 0.14);
        border-color: rgba(139, 92, 246, 0.4);
        color: var(--color-text-primary);
      }
      .legal-nav a.current {
        background: rgba(139, 92, 246, 0.18);
        border-color: rgba(139, 92, 246, 0.4);
        color: var(--color-text-primary);
      }

      @media (max-width: 640px) {
        .legal-card {
          padding: var(--space-md);
          padding-bottom: var(--space-lg);
        }
        .page-header,
        .legal-card {
          max-width: none;
        }
        .legal-section p,
        .legal-section ul,
        .legal-footer p {
          font-size: 14px;
        }
        .legal-nav a {
          min-height: 44px;
          flex: 1 1 auto;
          justify-content: center;
        }
      }

      @media (min-width: 2560px) {
        .page-header,
        .legal-card {
          max-width: 980px;
          margin-inline: auto;
        }
        .page-header {
          margin-bottom: var(--space-xl);
        }
        .legal-section h2 {
          font-size: 18px;
        }
        .legal-section p,
        .legal-section ul,
        .legal-footer p {
          font-size: 16px;
        }
        .legal-nav a {
          font-size: 14px;
        }
      }
    `,
  ],
})
export class LegalComponent {
  private readonly route = inject(ActivatedRoute);

  readonly document =
    LEGAL_DOCUMENTS[this.route.snapshot.data['document'] as LegalDocumentId] ??
    LEGAL_DOCUMENTS.privacy;

  readonly contactEmail = CONTACT_EMAIL;
  readonly mailto = `mailto:${CONTACT_EMAIL}`;
}
