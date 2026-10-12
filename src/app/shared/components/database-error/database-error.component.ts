import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DbService } from '../../../core/services/db.service';

/**
 * The one thing DeepWork shows instead of the app: its database is still on disk
 * and could not be read.
 *
 * Everything else the app can lose is rebuilt from the code. The tasks someone
 * has finished, the sessions they sat through and the journal they wrote exist
 * nowhere else, and the stack's default answer to an unopenable database is to
 * create a new one — a working app with nothing in it, which is the failure that
 * looks like success. So the app stops here instead, and stops *loudly*: the file
 * is named, and so is the fact that nothing has been deleted.
 *
 * What the user is offered is the honest set of options rather than a button that
 * pretends to repair anything. The file is theirs; the app's job at this point is
 * to tell them where it is and get out of the way. The backups folder beside it
 * is named too, because the guard copies the database there before every launch
 * (`src-tauri/src/db_guard.rs`), and one of those copies is usually the way back.
 */
@Component({
  selector: 'app-database-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (db.failure(); as failure) {
      <div class="db-error-layer">
        <section class="db-error-card" role="alertdialog" aria-labelledby="db-error-title">
          <div class="db-error-icon" aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path
                d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              />
            </svg>
          </div>

          <h2 class="db-error-title" id="db-error-title">DeepWork did not open your data</h2>

          <p class="db-error-lead">
            Your database is still on disk, exactly where it was. DeepWork has not deleted, replaced
            or changed it — it stopped instead, because the only other thing it could do is start
            over with an empty database, and that would have thrown your tasks away.
          </p>

          <dl class="db-error-facts">
            <dt>File</dt>
            <dd>{{ failure.report.path }}</dd>
            <dt>What DeepWork found</dt>
            <dd>{{ failure.report.unreadable }}</dd>
          </dl>

          <p class="db-error-advice">
            A copy of the database as it was before this launch is in a
            <strong>backups</strong> folder beside that file, named with the date and time. If the
            file itself looks wrong, that copy is the place to start: move the damaged one out of
            the way and put a backup in its place, keeping the same name.
          </p>

          <p class="db-error-advice">
            Either way, keep the damaged file. It is the only copy of what is in it, and it can
            often still be read by hand.
          </p>
        </section>
      </div>
    }
  `,
  styles: [
    `
      /* The host must be *nothing* when there is no failure.
         "display: contents" is the whole fix for the worst bug this component has
         had: it used to be a block, fixed to all four edges with pointer events on,
         unconditionally — so an app with a perfectly good database still had an
         invisible, transparent, full-window element sitting at z-index 30000 over
         every pixel of it, swallowing every click in the app and leaving the one
         card drawn *above* it looking like a set of dead buttons. With "contents"
         the host generates no box at all, so when nothing is rendered nothing is
         there; the full-window surface below exists only inside the @if, which is
         only true when there is something to show. */
      :host {
        display: contents;
      }

      /* One opaque surface over the whole window: the app behind this is an app
         that failed to load, and a half-drawn shell behind an error is worse than
         no shell at all. */
      .db-error-layer {
        position: fixed;
        inset: 0;
        z-index: 30000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        padding-top: calc(24px + var(--safe-top));
        padding-bottom: calc(24px + var(--safe-bottom));
        background: var(--surface-float, rgba(15, 11, 31, 0.94));
        backdrop-filter: blur(10px);
      }

      .db-error-card {
        width: 100%;
        max-width: 560px;
        max-height: 100%;
        overflow-y: auto;
        overscroll-behavior-y: contain;
        padding: 26px;
        border-radius: 18px;
        background: var(--toast-bg);
        border: 1px solid rgba(239, 68, 68, 0.35);
        box-shadow: var(--glass-shadow);
      }

      .db-error-icon {
        width: 44px;
        height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        background: rgba(239, 68, 68, 0.14);
        color: #f87171;
      }

      .db-error-title {
        margin: 14px 0 0;
        font-size: 19px;
        font-weight: 800;
        letter-spacing: -0.3px;
        color: var(--color-text-primary, #f4f4f5);
      }

      .db-error-lead {
        margin: 8px 0 0;
        font-size: 13px;
        line-height: 1.6;
        color: var(--color-text-secondary, #d4d4d8);
      }

      .db-error-facts {
        margin: 16px 0 0;
        padding: 12px 14px;
        border-radius: 10px;
        background: rgba(239, 68, 68, 0.07);
        border: 1px solid rgba(239, 68, 68, 0.2);
        font-size: 12px;
        line-height: 1.5;
      }
      .db-error-facts dt {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--color-text-muted, #a1a1aa);
      }
      .db-error-facts dd {
        margin: 3px 0 12px;
        color: var(--color-text-primary, #f4f4f5);
        /* A path and SQLite's own words both need to wrap rather than scroll:
           the file name is the one thing the user has to be able to read. */
        overflow-wrap: anywhere;
        font-family: var(--font-mono, ui-monospace, monospace);
      }
      .db-error-facts dd:last-child {
        margin-bottom: 0;
      }

      .db-error-advice {
        margin: 12px 0 0;
        font-size: 13px;
        line-height: 1.6;
        color: var(--color-text-secondary, #d4d4d8);
      }
      .db-error-advice strong {
        color: var(--color-text-primary, #f4f4f5);
      }
    `,
  ],
})
export class DatabaseErrorComponent {
  readonly db = inject(DbService);
}
