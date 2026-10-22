import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ReminderService } from '../../core/services/reminder.service';
import { ReminderRhythm, StandingReminder } from '../../core/models/reminder.model';
import { RHYTHM_LABELS } from '../../core/constants/reminder.constants';
import {
  clockTime,
  countdownFromMs,
  countdownLabel,
  dueLabel,
  parseDueAt,
  reminderReading,
  rhythmHint,
  rhythmLabel,
} from '../../core/utils/reminder.util';

/** The three rhythms, as the form draws them. */
const RHYTHMS: readonly ReminderRhythm[] = ['gentle', 'steady', 'insistent'];

/**
 * Reminders that stand until they are answered.
 *
 * The page is deliberately two things in one place: a form for writing the
 * promise down, and a list that shows it being kept. The explanatory card is
 * not marketing copy inside the app — it is the part that makes the feature
 * trustworthy, because "it will keep reminding you" is a promise the user has
 * to understand before they leave the screen for a presentation.
 */
@Component({
  selector: 'app-reminders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.reminder-up]': 'isUp()' },
  template: `
    <div class="page-header animate-fade-in">
      <div>
        <h1 class="gradient-text page-title">Reminders</h1>
        <p class="page-subtitle">They stand until you answer them</p>
      </div>
      <div class="header-stats">
        <div class="stat-pill" title="Reminders whose moment has arrived">
          <span class="stat-value">{{ reminders.standing().length }}</span>
          <span class="stat-label">standing now</span>
        </div>
        <div
          class="stat-pill"
          title="The next reminder, or the next time a standing one asks again"
        >
          <span class="stat-value">{{ nextLabel() }}</span>
          <span class="stat-label">next</span>
        </div>
        <div class="stat-pill" title="Reminders you have finished">
          <span class="stat-value">{{ doneCount() }}</span>
          <span class="stat-label">kept</span>
        </div>
      </div>
    </div>

    <p class="reading animate-fade-in-delay-1">{{ reading() }}</p>

    <div class="top-grid animate-fade-in-delay-1">
      <!-- Write one down -->
      <section class="panel compose" aria-labelledby="compose-title">
        <div class="panel-head">
          <h2 class="panel-title" id="compose-title">Write one down</h2>
          <span class="panel-note">One sentence is enough</span>
        </div>

        <div class="field">
          <label class="field-label" for="reminder-title">What should not be missed?</label>
          <input
            id="reminder-title"
            class="field-input"
            type="text"
            maxlength="80"
            placeholder="Presentation in Room 4"
            [value]="title()"
            (input)="onTitle($event)"
            (keydown.enter)="create()"
            autocomplete="off"
          />
        </div>

        <div class="field">
          <label class="field-label" for="reminder-note">
            Context <span class="optional">optional</span>
          </label>
          <input
            id="reminder-note"
            class="field-input"
            type="text"
            maxlength="160"
            placeholder="Slides on the desktop · 15 minutes"
            [value]="note()"
            (input)="onNote($event)"
            (keydown.enter)="create()"
            autocomplete="off"
          />
        </div>

        <div class="when-row">
          <div class="field">
            <label class="field-label" for="reminder-date">Date</label>
            <input
              id="reminder-date"
              class="field-input mono"
              type="date"
              [min]="today"
              [value]="date()"
              (input)="onDate($event)"
            />
          </div>
          <div class="field">
            <label class="field-label" for="reminder-time">Time</label>
            <input
              id="reminder-time"
              class="field-input mono"
              type="time"
              [value]="time()"
              (input)="onTime($event)"
            />
          </div>
        </div>

        <fieldset class="rhythm-set">
          <legend class="field-label">How hard should it insist?</legend>
          <div class="rhythm-row">
            @for (rhythm of rhythms; track rhythm.id) {
              <button
                type="button"
                class="rhythm-btn"
                [class.selected]="selectedRhythm() === rhythm.id"
                [attr.aria-pressed]="selectedRhythm() === rhythm.id"
                (click)="selectedRhythm.set(rhythm.id)"
              >
                {{ rhythm.label }}
              </button>
            }
          </div>
          <p class="rhythm-hint">{{ rhythmHintText() }}</p>
        </fieldset>

        <p class="preview" [class.past]="previewPast()">{{ preview() }}</p>

        @if (error()) {
          <p class="form-error" role="alert">{{ error() }}</p>
        }

        <div class="compose-actions">
          <button type="button" class="btn btn-primary" (click)="create()">Start standing</button>
          <button type="button" class="btn" (click)="fillExample()">Use an example</button>
        </div>

        <div class="examples" aria-label="Example reminders">
          @for (example of examples; track example.title) {
            <button type="button" class="example-chip" (click)="applyExample(example)">
              {{ example.title }}
            </button>
          }
        </div>
      </section>

      <!-- Why it behaves this way -->
      <aside class="panel promise" aria-labelledby="promise-title">
        <div class="promise-mark" aria-hidden="true">
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
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </div>
        <h2 class="panel-title" id="promise-title">We keep it, so you can let go</h2>
        <p class="promise-lead">
          A presentation, a class, a dose, a train — the moments you cannot answer your phone are
          exactly the ones a reminder usually gives up on. This one does not.
        </p>
        <ul class="promise-list">
          <li>
            <span class="promise-dot"></span>
            <span>
              <strong>It repeats, then it escalates.</strong>
              A quick first nudge, then longer gaps — three, five, ten, twenty minutes — on the
              rhythm you chose.
            </span>
          </li>
          <li>
            <span class="promise-dot"></span>
            <span>
              <strong>It survives a closed laptop.</strong>
              The reminder is stored, not scheduled in a timer. Open the app after lunch and the
              morning's reminder is still waiting, with the time it was due.
            </span>
          </li>
          <li>
            <span class="promise-dot"></span>
            <span>
              <strong>It never steals the stage.</strong>
              No window jumps to the front. The question waits on the desktop notification and in
              the app, so a presentation is not interrupted by a reminder about it.
            </span>
          </li>
          <li>
            <span class="promise-dot"></span>
            <span>
              <strong>It is still yours to end.</strong>&nbsp;<em>Done</em> keeps the promise.
              <em>Stop</em> ends it honestly. Nothing decides on your behalf that you probably saw
              it.
            </span>
          </li>
        </ul>
        <p class="promise-foot">
          Your health and your promises share one day. We hold the worry so you can give the next
          few minutes to the thing in front of you.
        </p>
      </aside>
    </div>

    @if (reminders.reminders().length === 0) {
      <section class="empty animate-fade-in-delay-1">
        <span class="empty-icon" aria-hidden="true">◷</span>
        <h2>Nothing is standing</h2>
        <p>
          Write down the one thing you cannot afford to forget. When its moment arrives it will keep
          asking — on the desktop, in the app, and after a restart — until you answer it.
        </p>
      </section>
    } @else {
      @if (reminders.standing().length > 0) {
        <section class="list-block animate-fade-in-delay-1" aria-labelledby="standing-title">
          <div class="list-head">
            <h2 class="list-title" id="standing-title">
              Standing now
              <span class="count">{{ reminders.standing().length }}</span>
            </h2>
            <span class="list-note">Answering the first one brings the next forward</span>
          </div>
          <div class="rows">
            @for (reminder of reminders.standing(); track reminder.id; let first = $first) {
              <article class="row standing" [class.queued]="!first">
                <span class="row-dot" [class.live]="first" aria-hidden="true"></span>
                <div class="row-main">
                  <h3 class="row-title">{{ reminder.title }}</h3>
                  @if (reminder.note) {
                    <p class="row-note">{{ reminder.note }}</p>
                  }
                  <p class="row-meta">
                    {{ dueLabelOf(reminder) }} · {{ rhythmOf(reminder) }} · {{ askLine(reminder) }}
                  </p>
                </div>
                @if (first) {
                  <div class="row-actions">
                    <button type="button" class="mini-btn primary" (click)="answer('done')">
                      Done
                    </button>
                    <button type="button" class="mini-btn" (click)="answer('snooze')">
                      Snooze
                    </button>
                    <button type="button" class="mini-btn muted" (click)="answer('stop')">
                      Stop
                    </button>
                  </div>
                } @else {
                  <span class="waiting-pill">Waiting its turn</span>
                }
              </article>
            }
          </div>
        </section>
      }

      @if (reminders.scheduled().length > 0) {
        <section class="list-block animate-fade-in-delay-1" aria-labelledby="coming-title">
          <div class="list-head">
            <h2 class="list-title" id="coming-title">
              Coming up
              <span class="count">{{ reminders.scheduled().length }}</span>
            </h2>
          </div>
          <div class="rows">
            @for (reminder of reminders.scheduled(); track reminder.id) {
              <article class="row">
                <span class="row-clock" aria-hidden="true">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12,6 12,12 16,14" />
                  </svg>
                </span>
                <div class="row-main">
                  <h3 class="row-title">{{ reminder.title }}</h3>
                  @if (reminder.note) {
                    <p class="row-note">{{ reminder.note }}</p>
                  }
                  <p class="row-meta">
                    {{ dueLabelOf(reminder) }} · {{ countdownOf(reminder) }} ·
                    {{ rhythmOf(reminder) }}
                  </p>
                </div>
                <div class="row-actions">
                  <button type="button" class="mini-btn" (click)="complete(reminder)">Done</button>
                  <button
                    type="button"
                    class="mini-btn muted"
                    [attr.aria-label]="'Remove ' + reminder.title"
                    (click)="remove(reminder)"
                  >
                    Remove
                  </button>
                </div>
              </article>
            }
          </div>
        </section>
      }

      @if (reminders.finished().length > 0) {
        <section class="list-block animate-fade-in-delay-1" aria-labelledby="finished-title">
          <div class="list-head">
            <h2 class="list-title" id="finished-title">
              Finished
              <span class="count">{{ reminders.finished().length }}</span>
            </h2>
            <button type="button" class="link-btn" (click)="clearFinished()">Clear finished</button>
          </div>
          <div class="rows">
            @for (reminder of reminders.finished(); track reminder.id) {
              <article class="row finished" [class.stopped]="reminder.status === 'stopped'">
                <span class="row-check" aria-hidden="true">
                  {{ reminder.status === 'done' ? '✓' : '—' }}
                </span>
                <div class="row-main">
                  <h3 class="row-title">{{ reminder.title }}</h3>
                  <p class="row-meta">
                    {{ reminder.status === 'done' ? 'Kept' : 'Stopped' }} ·
                    {{ finishedLabel(reminder) }} · {{ askCount(reminder) }}
                  </p>
                </div>
                <button
                  type="button"
                  class="mini-btn muted"
                  [attr.aria-label]="'Remove ' + reminder.title"
                  (click)="remove(reminder)"
                >
                  Remove
                </button>
              </article>
            }
          </div>
        </section>
      }
    }
  `,
  styles: [
    `
      /* The standing card is fixed to the bottom of the window, so the page
         keeps room for it: without this the last rows of the list could never be
         scrolled out from under it. */
      :host {
        display: block;
      }

      :host(.reminder-up) {
        padding-bottom: 300px;
      }

      .page-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 20px;
        flex-wrap: wrap;
        margin-bottom: var(--space-lg);
      }

      .page-title {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.5px;
        margin: 0;
      }

      .page-subtitle {
        margin: 6px 0 0;
        font-size: 13px;
        color: var(--color-text-secondary);
      }

      .header-stats {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .stat-pill {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 92px;
        padding: 8px 14px;
        border-radius: 12px;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
      }

      .stat-value {
        font-size: 16px;
        font-weight: 700;
        color: var(--color-text-primary);
        font-variant-numeric: tabular-nums;
      }

      .stat-label {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }

      .reading {
        margin: 0 0 var(--space-lg);
        max-width: 78ch;
        font-size: 13px;
        line-height: 1.55;
        color: var(--color-text-secondary);
      }

      .top-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
        gap: var(--space-lg);
        align-items: start;
        margin-bottom: var(--space-lg);
      }

      .panel {
        padding: 20px;
        border-radius: var(--glass-radius, 14px);
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        backdrop-filter: blur(var(--glass-blur));
        box-shadow: var(--glass-shadow);
      }

      .panel-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 16px;
      }

      .panel-title {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        color: var(--color-text-primary);
      }

      .panel-note {
        font-size: 11px;
        color: var(--color-text-muted);
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 12px;
      }

      .field-label {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: var(--color-text-secondary);
      }

      .optional {
        font-weight: 500;
        color: var(--color-text-muted);
      }

      .field-input {
        width: 100%;
        min-height: 38px;
        padding: 9px 11px;
        border-radius: 9px;
        border: 1px solid var(--glass-border);
        background: rgba(255, 255, 255, 0.035);
        color: var(--color-text-primary);
        font: inherit;
        font-size: 13px;
        outline: none;
        transition:
          border-color 0.2s,
          box-shadow 0.2s;
      }

      .field-input::placeholder {
        color: var(--color-text-muted);
      }

      .field-input:focus {
        border-color: rgba(251, 191, 36, 0.55);
        box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.12);
      }

      .mono {
        font-family: var(--font-mono, monospace);
        font-size: 12px;
      }

      .when-row {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
        gap: 10px;
      }

      .rhythm-set {
        margin: 2px 0 0;
        padding: 0;
        border: none;
      }

      .rhythm-row {
        display: flex;
        gap: 7px;
        margin-top: 7px;
      }

      .rhythm-btn {
        flex: 1;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--glass-border);
        background: var(--glass-bg);
        color: var(--color-text-secondary);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition:
          background 0.2s,
          border-color 0.2s,
          color 0.2s;
      }

      .rhythm-btn:hover {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary);
      }

      .rhythm-btn.selected {
        border-color: rgba(251, 191, 36, 0.5);
        background: rgba(251, 191, 36, 0.13);
        color: var(--color-text-primary);
      }

      .rhythm-hint {
        margin: 7px 0 0;
        font-size: 11px;
        line-height: 1.45;
        color: var(--color-text-muted);
      }

      .preview {
        margin: 12px 0 0;
        padding: 8px 11px;
        border-radius: 8px;
        background: rgba(139, 92, 246, 0.08);
        border: 1px solid rgba(139, 92, 246, 0.18);
        font-size: 11px;
        line-height: 1.45;
        color: var(--color-text-secondary);
      }

      .preview.past {
        background: rgba(251, 191, 36, 0.08);
        border-color: rgba(251, 191, 36, 0.22);
      }

      .form-error {
        margin: 10px 0 0;
        font-size: 12px;
        font-weight: 600;
        color: #fca5a5;
      }

      .compose-actions {
        display: flex;
        gap: 8px;
        margin-top: 16px;
      }

      .btn {
        padding: 9px 15px;
        border-radius: 9px;
        border: 1px solid var(--glass-border);
        background: var(--glass-bg);
        color: var(--color-text-secondary);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition:
          background 0.2s,
          border-color 0.2s,
          color 0.2s;
      }

      .btn:hover {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary);
      }

      .btn-primary {
        flex: 1;
        border-color: rgba(251, 191, 36, 0.45);
        background: linear-gradient(135deg, rgba(251, 191, 36, 0.22), rgba(245, 158, 11, 0.16));
        color: var(--color-text-primary);
      }

      .btn-primary:hover {
        background: linear-gradient(135deg, rgba(251, 191, 36, 0.3), rgba(245, 158, 11, 0.22));
      }

      .examples {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 12px;
      }

      .example-chip {
        padding: 5px 9px;
        border-radius: 999px;
        border: 1px dashed var(--glass-border);
        background: transparent;
        color: var(--color-text-muted);
        font: inherit;
        font-size: 10px;
        cursor: pointer;
        transition:
          color 0.2s,
          border-color 0.2s;
      }

      .example-chip:hover {
        color: var(--color-text-primary);
        border-color: rgba(251, 191, 36, 0.4);
      }

      .promise {
        position: relative;
        overflow: hidden;
        background: linear-gradient(160deg, rgba(251, 191, 36, 0.08), var(--glass-bg) 55%);
      }

      .promise-mark {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        margin-bottom: 12px;
        border-radius: 12px;
        background: rgba(251, 191, 36, 0.13);
        color: #fbbf24;
      }

      .promise-lead {
        margin: 8px 0 14px;
        font-size: 12px;
        line-height: 1.55;
        color: var(--color-text-secondary);
      }

      .promise-list {
        display: flex;
        flex-direction: column;
        gap: 11px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .promise-list li {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        font-size: 12px;
        line-height: 1.5;
        color: var(--color-text-secondary);
      }

      .promise-list strong {
        color: var(--color-text-primary);
        font-weight: 650;
      }

      .promise-dot {
        width: 6px;
        height: 6px;
        margin-top: 6px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: #fbbf24;
      }

      .promise-foot {
        margin: 16px 0 0;
        padding-top: 12px;
        border-top: 1px solid var(--glass-border);
        font-size: 11px;
        font-style: italic;
        line-height: 1.55;
        color: var(--color-text-muted);
      }

      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 8px;
        padding: 44px 22px;
        border-radius: var(--glass-radius, 14px);
        border: 1px dashed var(--glass-border);
        background: var(--glass-bg);
      }

      .empty-icon {
        font-size: 30px;
        line-height: 1;
        color: #fbbf24;
      }

      .empty h2 {
        margin: 0;
        font-size: 16px;
        color: var(--color-text-primary);
      }

      .empty p {
        margin: 0;
        max-width: 54ch;
        font-size: 12px;
        line-height: 1.6;
        color: var(--color-text-secondary);
      }

      .list-block {
        margin-bottom: var(--space-lg);
      }

      .list-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 9px;
      }

      .list-title {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: var(--color-text-primary);
      }

      .count {
        padding: 1px 8px;
        border-radius: 999px;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        font-size: 10px;
        font-weight: 700;
        color: var(--color-text-muted);
      }

      .list-note {
        font-size: 11px;
        color: var(--color-text-muted);
      }

      .link-btn {
        border: none;
        background: none;
        padding: 0;
        font: inherit;
        font-size: 11px;
        color: var(--color-text-muted);
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 3px;
      }

      .link-btn:hover {
        color: var(--color-text-primary);
      }

      .rows {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 11px;
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
      }

      .row.standing {
        border-left: 3px solid #fbbf24;
      }

      .row.queued {
        opacity: 0.78;
      }

      .row.finished {
        opacity: 0.8;
      }

      .row-dot {
        width: 8px;
        height: 8px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: var(--color-text-muted);
      }

      .row-dot.live {
        background: #fbbf24;
        box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.14);
        animation: row-pulse 2s ease-in-out infinite;
      }

      .row-clock,
      .row-check {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        flex: 0 0 auto;
        border-radius: 7px;
        background: var(--glass-bg);
        color: var(--color-text-muted);
        font-size: 13px;
        font-weight: 700;
      }

      .row.finished .row-check {
        color: #6ee7b7;
      }

      .row.finished.stopped .row-check {
        color: var(--color-text-muted);
      }

      .row-main {
        min-width: 0;
        flex: 1;
      }

      .row-title {
        margin: 0;
        font-size: 13px;
        font-weight: 650;
        line-height: 1.35;
        color: var(--color-text-primary);
        overflow-wrap: anywhere;
      }

      .row-note {
        margin: 2px 0 0;
        font-size: 11px;
        line-height: 1.4;
        color: var(--color-text-secondary);
        overflow-wrap: anywhere;
      }

      .row-meta {
        margin: 3px 0 0;
        font-size: 10px;
        color: var(--color-text-muted);
      }

      .row-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }

      .mini-btn {
        padding: 5px 10px;
        border-radius: 7px;
        border: 1px solid var(--glass-border);
        background: var(--glass-bg);
        color: var(--color-text-secondary);
        font: inherit;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition:
          background 0.2s,
          color 0.2s;
      }

      .mini-btn:hover {
        background: var(--glass-bg-hover);
        color: var(--color-text-primary);
      }

      .mini-btn.primary {
        border-color: rgba(251, 191, 36, 0.4);
        background: rgba(251, 191, 36, 0.14);
        color: var(--color-text-primary);
      }

      .mini-btn.muted {
        color: var(--color-text-muted);
      }

      .waiting-pill {
        flex-shrink: 0;
        padding: 3px 9px;
        border-radius: 999px;
        border: 1px dashed var(--glass-border);
        font-size: 10px;
        color: var(--color-text-muted);
      }

      @keyframes row-pulse {
        0%,
        100% {
          box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.14);
        }
        50% {
          box-shadow: 0 0 0 7px rgba(251, 191, 36, 0.06);
        }
      }

      @media (max-width: 1000px) {
        .top-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 640px) {
        :host(.reminder-up) {
          padding-bottom: 340px;
        }
        .page-header {
          align-items: flex-start;
        }
        .header-stats {
          width: 100%;
        }
        .stat-pill {
          flex: 1;
          min-width: 0;
        }
        .page-title {
          font-size: 24px;
        }
        .panel {
          padding: 16px;
        }
        .row {
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .row-actions {
          width: 100%;
          justify-content: flex-end;
        }
        .mini-btn,
        .btn {
          min-height: 40px;
        }
        .when-row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class RemindersComponent {
  protected readonly reminders = inject(ReminderService);

  protected readonly rhythms = RHYTHMS.map((id) => ({ id, ...RHYTHM_LABELS[id] }));
  protected readonly examples = [
    { title: 'Presentation', note: 'Room 4 · slides on the desktop', rhythm: 'insistent' as const },
    { title: 'Take a walk', note: 'Ten minutes away from the screen', rhythm: 'gentle' as const },
    { title: 'Call home', note: '', rhythm: 'steady' as const },
    { title: 'Take medicine', note: 'With water', rhythm: 'insistent' as const },
  ];

  protected readonly title = signal('');
  protected readonly note = signal('');
  private readonly initialSlot = defaultSlot();
  protected readonly date = signal(this.initialSlot.date);
  protected readonly time = signal(this.initialSlot.time);
  protected readonly selectedRhythm = signal<ReminderRhythm>('steady');
  protected readonly error = signal('');

  protected readonly today = localDateKey();

  /** True while the fixed card is on screen, so the page can leave it room. */
  protected readonly isUp = computed(() => this.reminders.active() !== null);

  protected readonly reading = computed(() =>
    reminderReading(this.reminders.reminders(), this.reminders.now()),
  );

  protected readonly doneCount = computed(
    () => this.reminders.reminders().filter((reminder) => reminder.status === 'done').length,
  );

  protected readonly nextLabel = computed(() => {
    const next = this.reminders.nextAt();
    if (!next) return '—';
    return countdownFromMs(next.getTime() - this.reminders.now().getTime());
  });

  protected readonly rhythmHintText = computed(() => rhythmHint(this.selectedRhythm()));

  protected readonly previewPast = computed(() => {
    const due = parseDueAt(this.date(), this.time());
    return due !== null && due.getTime() <= this.reminders.now().getTime();
  });

  protected readonly preview = computed(() => {
    const due = parseDueAt(this.date(), this.time());
    if (!due) return 'Pick a date and a time, and this is when it starts asking.';
    const label = dueLabel(due.toISOString(), this.reminders.now());
    const gap = countdownLabel(due.toISOString(), this.reminders.now());
    return this.previewPast()
      ? `That moment has already passed (${label.toLowerCase()}) — it will start standing as soon as you add it.`
      : `Starts asking ${label.toLowerCase()} · ${gap}.`;
  });

  protected onTitle(event: Event): void {
    this.title.set(inputValue(event));
  }

  protected onNote(event: Event): void {
    this.note.set(inputValue(event));
  }

  protected onDate(event: Event): void {
    this.date.set(inputValue(event));
  }

  protected onTime(event: Event): void {
    this.time.set(inputValue(event));
  }

  protected create(): void {
    const due = parseDueAt(this.date(), this.time());
    if (this.title().trim() === '') {
      this.error.set('Give the reminder a name — one sentence is enough.');
      return;
    }
    if (!due) {
      this.error.set('Pick a real date and time for it to start asking.');
      return;
    }

    this.error.set('');
    this.reminders.create({
      title: this.title(),
      note: this.note(),
      dueAt: due,
      rhythm: this.selectedRhythm(),
    });

    // The next one starts from a fresh slot rather than from the moment just
    // written, so adding two reminders in a row does not produce two at 15:05.
    this.title.set('');
    this.note.set('');
    const slot = defaultSlot();
    this.date.set(slot.date);
    this.time.set(slot.time);
    this.selectedRhythm.set('steady');
  }

  protected fillExample(): void {
    const example = this.examples[Math.floor(Math.random() * this.examples.length)];
    if (example) this.applyExample(example);
  }

  protected applyExample(example: { title: string; note: string; rhythm: ReminderRhythm }): void {
    this.title.set(example.title);
    this.note.set(example.note);
    this.selectedRhythm.set(example.rhythm);
    this.error.set('');
  }

  protected answer(action: 'done' | 'snooze' | 'stop'): void {
    void this.reminders.answer(action);
  }

  protected complete(reminder: StandingReminder): void {
    this.reminders.complete(reminder.id);
  }

  protected remove(reminder: StandingReminder): void {
    this.reminders.remove(reminder.id);
  }

  protected clearFinished(): void {
    this.reminders.clearFinished();
  }

  protected dueLabelOf(reminder: StandingReminder): string {
    return dueLabel(reminder.dueAt, this.reminders.now());
  }

  protected countdownOf(reminder: StandingReminder): string {
    return countdownLabel(reminder.dueAt, this.reminders.now());
  }

  protected rhythmOf(reminder: StandingReminder): string {
    return rhythmLabel(reminder.rhythm);
  }

  protected askLine(reminder: StandingReminder): string {
    const rang = reminder.lastRangAt ? clockTime(new Date(reminder.lastRangAt)) : '';
    const count = Math.max(1, reminder.fireCount);
    return `asked ${count} ${count === 1 ? 'time' : 'times'}${rang ? ` · since ${rang}` : ''}`;
  }

  protected askCount(reminder: StandingReminder): string {
    const count = Math.max(1, reminder.fireCount);
    return `${count} ${count === 1 ? 'ask' : 'asks'}`;
  }

  protected finishedLabel(reminder: StandingReminder): string {
    const at = reminder.finishedAt ? new Date(reminder.finishedAt) : null;
    if (!at || !Number.isFinite(at.getTime())) return 'just now';
    return `${clockTime(at)} · due ${dueLabel(reminder.dueAt, this.reminders.now()).toLowerCase()}`;
  }
}

/** The value of a text-like input, without leaking the DOM type into the template. */
function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}

/** Today as a `date` input wants it: `YYYY-MM-DD`, in local time. */
function localDateKey(at: Date = new Date()): string {
  const year = at.getFullYear();
  const month = `${at.getMonth() + 1}`.padStart(2, '0');
  const day = `${at.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * A sensible first moment: the next five-minute slot, at least ten minutes out.
 *
 * "In ten minutes" is long enough to finish writing the note and short enough
 * that the reminder is still about what the user is doing. When that would fall
 * after midnight the date moves with it rather than offering a time that has
 * already passed today.
 */
function defaultSlot(now: Date = new Date()): { date: string; time: string } {
  const slot = new Date(now.getTime() + 10 * 60_000);
  slot.setSeconds(0, 0);
  slot.setMinutes(Math.ceil(slot.getMinutes() / 5) * 5);
  return { date: localDateKey(slot), time: clockTime(slot) };
}
