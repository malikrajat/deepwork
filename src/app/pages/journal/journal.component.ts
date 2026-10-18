import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { form, maxLength } from '@angular/forms/signals';
import { EditorConfig, RmNgEditor } from '@codewithrajat/rm-ng-editor';
import { DbService } from '../../core/services/db.service';
import { ThemeService } from '../../core/services/theme.service';
import { FormFieldWrapperComponent } from '../../shared/components/form-field/form-field-wrapper.component';
import { JournalFormModel, createJournalFormDefaults } from '../../shared/models/form.models';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { VirtualWindowDirective } from '../../shared/directives/virtual-window.directive';
import { buildJournalStats } from '../../core/utils/insights.util';
import {
  countWords,
  journalHtml,
  journalText,
  sanitizeJournalHtml,
  snippet,
} from '../../core/utils/journal-content.util';

interface JournalEntry {
  id: string;
  date: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * An entry with its plain text already worked out.
 *
 * The stored string is HTML, so every count, search and list row needs the
 * words rather than the markup. Deriving it once per entry beats running it
 * again for each of those on every keystroke.
 */
interface JournalEntryView extends JournalEntry {
  text: string;
  snippet: string;
}

const PROMPTS = [
  'What went well today? What could be improved? What are you grateful for?',
  'What was the most focused moment of your day? What pulled your attention away?',
  "What did you learn today that you didn't know yesterday?",
  'What is one small win worth celebrating? What would make tomorrow even better?',
  'How did you feel during your deep work sessions today?',
];

/**
 * Highlighter colours.
 *
 * Deliberately translucent: an opaque pastel would put pale text on a pale
 * block in the dark theme. At this alpha the highlight reads as a tint behind
 * whichever text colour the theme is using.
 */
const HIGHLIGHTS = [
  { label: 'yellow', value: 'rgba(253, 230, 138, 0.45)' },
  { label: 'green', value: 'rgba(187, 247, 208, 0.45)' },
  { label: 'blue', value: 'rgba(191, 219, 254, 0.45)' },
  { label: 'rose', value: 'rgba(254, 205, 211, 0.45)' },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'app-journal',
  imports: [
    FormFieldWrapperComponent,
    TooltipDirective,
    VirtualWindowDirective,
    DecimalPipe,
    RmNgEditor,
  ],
  // Ctrl+S saves the entry from anywhere on the page. On the host rather than
  // on the card, because a keyboard shortcut belongs to the page and the card
  // is not a focusable element.
  host: {
    '(keydown.control.s)': 'onManualSave($event)',
    '(keydown.meta.s)': 'onManualSave($event)',
  },
  template: `
    <div class="page-header animate-fade-in">
      <div>
        <h1 class="gradient-text page-title">Journal</h1>
        <p class="page-subtitle">Reflect on your day</p>
      </div>
      <div class="header-stats">
        <div class="stat-pill" appTooltip="Consecutive days (including today) with a journal entry">
          <span class="stat-value">{{ streak() }}</span>
          <span class="stat-label">day streak</span>
        </div>
        <div class="stat-pill" appTooltip="Total journal entries you've written">
          <span class="stat-value">{{ pastEntries().length }}</span>
          <span class="stat-label">entries</span>
        </div>
      </div>
    </div>

    @if (stats().entries) {
      <section class="journal-stats animate-fade-in-delay-1" aria-label="Writing numbers">
        <div class="stat"><span class="stat-value">{{ stats().entries }}</span><span class="stat-label">days written</span></div>
        <div class="stat"><span class="stat-value">{{ stats().words | number }}</span><span class="stat-label">words all-time</span></div>
        <div class="stat"><span class="stat-value">{{ stats().averageWords }}</span><span class="stat-label">avg / entry</span></div>
        <div class="stat"><span class="stat-value">{{ stats().currentStreak }}</span><span class="stat-label">day streak</span></div>
        <div class="stat"><span class="stat-value">{{ stats().longestStreak }}</span><span class="stat-label">best streak</span></div>
        <div class="stat"><span class="stat-value">{{ stats().consistencyPercent }}%</span><span class="stat-label">30-day consistency</span></div>
        <div class="rhythm" aria-hidden="true">
          @for (week of stats().weeks; track week.label) {
            <span
              class="rhythm-bar"
              [style.height.%]="weekPercent(week.words)"
              [appTooltip]="week.label + ' · ' + week.entries + ' entries, ' + week.words + ' words'"
            ></span>
          }
        </div>
      </section>
      <p class="journal-reading animate-fade-in-delay-1">{{ reading() }}</p>
    }

    <div class="journal-layout animate-fade-in-delay-1">
      <div class="journal-main">
        <!-- Today's / selected entry -->
        <div class="editor-card">
          <div class="editor-header">
            <div class="date-nav">
              <button class="nav-btn" type="button" (click)="goToDay(-1)" appTooltip="Previous day">‹</button>
              <div class="date-info">
                <h3 class="editor-date">{{ selectedDateFormatted() }}</h3>
                @if (!isToday()) {
                  <button class="today-link" type="button" (click)="goToToday()">Jump to today</button>
                }
              </div>
              <button class="nav-btn" type="button" (click)="goToDay(1)" [disabled]="isToday()" appTooltip="Next day">›</button>
            </div>
            <div class="editor-status">
              @if (saving()) {
                <span class="save-indicator">Saving...</span>
              } @else if (lastSaved()) {
                <span class="save-indicator saved">✓ Saved</span>
              }
              <div class="mode-switch" role="group" aria-label="Writing or reading">
                <button
                  class="mode-btn"
                  type="button"
                  [class.active]="mode() === 'write'"
                  [attr.aria-pressed]="mode() === 'write'"
                  (click)="setMode('write')"
                >Write</button>
                <button
                  class="mode-btn"
                  type="button"
                  [class.active]="mode() === 'read'"
                  [attr.aria-pressed]="mode() === 'read'"
                  (click)="setMode('read')"
                >Preview</button>
              </div>
              @if (hasContent()) {
                <button class="delete-btn" type="button" (click)="confirmDelete()" appTooltip="Delete this entry">Delete</button>
              }
            </div>
          </div>

          @if (mode() === 'write') {
            <div class="journal-editor">
              <app-form-field [fieldState]="journalForm.content()">
                <app-rm-ng-editor
                  [value]="journalModel().content"
                  [config]="editorConfig()"
                  (valueChange)="onEditorChange($event)"
                  (blurEvent)="onEditorBlur()"
                />
              </app-form-field>
            </div>

            <div class="editor-footer">
              <div class="footer-left">
                <span class="word-count">{{ wordCount() }} words · {{ readingTime() }} min read</span>
                <span class="highlight-group" role="group" aria-label="Highlight the selection">
                  @for (colour of highlights; track colour.value) {
                    <button
                      class="highlight-swatch"
                      type="button"
                      [style.background]="colour.value"
                      [appTooltip]="'Highlight ' + colour.label"
                      [attr.aria-label]="'Highlight ' + colour.label"
                      (mousedown)="$event.preventDefault()"
                      (click)="highlight(colour.value)"
                    ></button>
                  }
                </span>
              </div>
              <span>Ctrl+S to save now</span>
            </div>
          } @else {
            <div class="read-surface">
              @if (hasContent()) {
                <article class="preview-surface" [innerHTML]="previewHtml()" aria-label="This entry, read-only"></article>
              } @else {
                <p class="read-empty">{{ placeholder() }}</p>
              }
            </div>
            <div class="editor-footer">
              <span class="word-count">{{ wordCount() }} words · {{ readingTime() }} min read</span>
              <button class="edit-link" type="button" (click)="setMode('write')">Back to writing</button>
            </div>
          }
        </div>

        <!-- Read-only render of the same entry, under the editor -->
        <section class="preview-card" aria-labelledby="journal-preview-title">
          <div class="preview-head">
            <h2 class="preview-title" id="journal-preview-title">Preview</h2>
            <span class="read-badge">Read mode</span>
            <span class="preview-date">{{ selectedDateFormatted() }}</span>
          </div>
          @if (hasContent()) {
            <article class="preview-surface" [innerHTML]="previewHtml()" aria-label="Preview of this entry"></article>
          } @else {
            <p class="read-empty">{{ placeholder() }}</p>
          }
        </section>
      </div>

      <!-- Past entries -->
      <div class="entries-sidebar">
        <div class="sidebar-head">
          <h3 class="sidebar-title">Past Entries</h3>
          <span class="sidebar-count">{{ filteredEntries().length }}</span>
        </div>
        <div class="search-box">
          <input
            class="search-input"
            type="text"
            placeholder="Search entries..."
            [value]="searchQuery()"
            (input)="onSearch($event)"
          />
          @if (searchQuery()) {
            <button class="clear-search" type="button" (click)="clearSearch()" aria-label="Clear search">×</button>
          }
        </div>

        <!-- Only the rows in view are rendered; the rest are created on scroll. -->
        <div
          class="entries-list"
          [appWindow]="filteredEntries().length"
          [rowHeight]="entryRowHeight"
          #entries="appWindow"
        >
          <div class="entries-canvas" [style.height.px]="entries.canvasHeight(filteredEntries().length)">
            @for (row of entries.visible(filteredEntries()); track row.item.id) {
              <button
                class="entry-item"
                [class.active]="selectedDate() === row.item.date"
                [style.top.px]="row.top"
                [style.height.px]="entryRowHeight"
                (click)="selectEntry(row.item)"
              >
                <span class="entry-date">
                  {{ formatEntryDate(row.item.date) }}
                  @if (row.item.date === todayDate) {
                    <span class="today-badge">Today</span>
                  }
                </span>
                <span class="entry-preview">{{ row.item.snippet }}</span>
              </button>
            }
          </div>
          @if (filteredEntries().length === 0 && searchQuery()) {
            <div class="no-entries">No entries match "{{ searchQuery() }}"</div>
          }
          @if (pastEntries().length === 0 && !searchQuery()) {
            <div class="no-entries">No past entries yet. Start writing above!</div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .page-header { margin-bottom: var(--space-xl); display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .page-title { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
    .page-subtitle { color: var(--color-text-muted); margin-top: 4px; font-size: 14px; }

    .header-stats { display: flex; gap: 10px; }
    .journal-stats {
      display: flex; align-items: flex-end; gap: 18px; flex-wrap: wrap;
      padding: 12px 16px; margin-bottom: 10px; border-radius: 14px;
      background: var(--glass-bg); border: 1px solid rgba(236,72,153,0.12);
    }
    .journal-stats .stat { display: flex; flex-direction: column; align-items: center; }
    .journal-stats .stat-value { font-size: 16px; font-weight: 800; color: var(--color-text-primary); }
    .journal-stats .stat-label { font-size: 10px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    /* 12-week writing rhythm: one bar per week, oldest → newest. */
    .rhythm { display: flex; align-items: flex-end; gap: 3px; height: 46px; margin-left: auto; }
    .rhythm-bar {
      width: 9px; min-height: 2px; border-radius: 2px 2px 0 0;
      background: linear-gradient(to top, rgba(236,72,153,0.35), rgba(236,72,153,0.75));
    }
    .journal-reading {
      font-size: 12px; line-height: 1.55; color: var(--color-text-secondary);
      margin-bottom: 12px;
    }
    .stat-pill {
      display: flex; flex-direction: column; align-items: center; padding: 6px 14px; border-radius: 12px;
      background: var(--glass-bg); border: 1px solid rgba(236,72,153,0.1); min-width: 72px;
    }
    .stat-value { font-size: 18px; font-weight: 800; color: var(--color-text-primary); }
    .stat-label { font-size: 10px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }

    .journal-layout { display: grid; grid-template-columns: 1fr 260px; gap: 16px; align-items: start; }
    /* The editor and its preview are one column: the entry being written, then
       the same entry as the reader sees it. */
    .journal-main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    /* Below 700px the two columns cannot sit beside each other, so the layout
       stacks and the editor keeps the top. It is the page's main action, its own
       arrows already step through days without the list, and the list's
       empty-state line reads "Start writing above" — a list on top would make
       that sentence point the wrong way. The zero floor in minmax(0, 1fr)
       replaces the automatic minimum a plain 1fr track carries: the editor's
       date is nowrap in the desktop rules and is wider than a phone, and without
       that floor the one line would push the whole column past the screen. */
    @media (max-width: 700px) {
      .journal-layout { grid-template-columns: minmax(0, 1fr); }
      .editor-card, .entries-sidebar, .journal-main { min-width: 0; }
      /* The list is a scroll window of its own rather than a full-length page:
         only the rows inside that window are ever created, so an auto-height
         list would build every entry in the journal and stretch the card to
         match it. */
      .entries-list {
        height: 44vh; min-height: 220px; max-height: 340px;
        overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
      }
    }

    .editor-card {
      padding: 20px; border-radius: 16px;
      background: var(--glass-bg); backdrop-filter: blur(12px);
      border: 1px solid rgba(236,72,153,0.1); display: flex; flex-direction: column;
    }
    .editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 12px; flex-wrap: wrap; }
    .date-nav { display: flex; align-items: center; gap: 8px; }
    .date-info { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .editor-date { font-size: 14px; font-weight: 600; white-space: nowrap; }
    .today-link { background: none; border: none; color: rgb(236,72,153); font-size: 10px; cursor: pointer; padding: 0; }
    .today-link:hover { text-decoration: underline; }
    .nav-btn {
      width: 26px; height: 26px; border-radius: 8px; border: 1px solid rgba(236,72,153,0.15);
      background: var(--control-bg); color: var(--color-text-primary); cursor: pointer; font-size: 15px;
      display: flex; align-items: center; justify-content: center; line-height: 1;
    }
    .nav-btn:hover:not(:disabled) { background: rgba(236,72,153,0.08); }
    .nav-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .editor-status { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .save-indicator { font-size: 11px; color: var(--color-text-muted); }
    .save-indicator.saved { color: rgb(52,211,153); }
    .delete-btn {
      background: none; border: 1px solid rgba(239,68,68,0.25); color: rgb(239,68,68);
      font-size: 11px; padding: 3px 8px; border-radius: 8px; cursor: pointer;
    }
    .delete-btn:hover { background: rgba(239,68,68,0.08); }

    /* Write / Preview. Two buttons rather than a checkbox: both states are
       named all the time, so the control says what it does even before it has
       been touched. */
    .mode-switch {
      display: flex; gap: 2px; padding: 2px; border-radius: 999px;
      background: var(--control-bg); border: 1px solid rgba(236,72,153,0.12);
    }
    .mode-btn {
      border: none; background: none; cursor: pointer; border-radius: 999px;
      padding: 3px 10px; font-size: 11px; font-weight: 600;
      color: var(--color-text-muted); transition: background 0.2s, color 0.2s;
    }
    .mode-btn:hover { color: var(--color-text-primary); }
    .mode-btn.active { background: rgba(236,72,153,0.16); color: rgb(236,72,153); }

    .journal-editor { flex: 1; min-width: 0; }
    /* The component host is an inline element by default, and an inline box
       around a block would not fill the card. */
    .journal-editor app-rm-ng-editor { display: block; }

    /* An empty journal reads as an invitation, not as a broken card. */
    .read-surface {
      flex: 1; min-height: max(300px, 46vh); padding: 4px 2px;
      overflow-y: auto; scrollbar-gutter: stable;
    }
    .read-empty {
      color: var(--color-text-muted); font-size: 13px; line-height: 1.7;
      padding: 8px 0; max-width: 60ch;
    }

    .editor-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 11px; color: var(--color-text-muted); gap: 10px; }
    .footer-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .edit-link {
      background: none; border: none; color: rgb(236,72,153); font-size: 11px;
      cursor: pointer; padding: 0;
    }
    .edit-link:hover { text-decoration: underline; }

    .highlight-group { display: flex; align-items: center; gap: 4px; }
    .highlight-swatch {
      width: 14px; height: 14px; padding: 0; border-radius: 4px; cursor: pointer;
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    }
    .highlight-swatch:hover { transform: scale(1.15); }
    .highlight-swatch:focus-visible { outline: 2px solid rgb(236,72,153); outline-offset: 2px; }

    .preview-card {
      padding: 18px 20px 20px; border-radius: 16px;
      background: var(--glass-bg); backdrop-filter: blur(12px);
      border: 1px solid rgba(236,72,153,0.08);
    }
    .preview-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .preview-title {
      font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--color-text-secondary);
    }
    .read-badge {
      font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
      padding: 1px 8px; border-radius: 999px;
      background: rgba(236,72,153,0.12); color: rgb(236,72,153);
    }
    .preview-date { margin-left: auto; font-size: 11px; color: var(--color-text-muted); white-space: nowrap; }

    .entries-sidebar {
      padding: 16px; border-radius: 16px;
      background: var(--glass-bg); backdrop-filter: blur(12px);
      border: 1px solid rgba(236,72,153,0.06); display: flex; flex-direction: column;
    }
    .sidebar-title { font-size: 13px; font-weight: 600; margin-bottom: 12px; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }

    .search-box { position: relative; margin-bottom: 12px; }
    .search-input {
      width: 100%; padding: 8px 28px 8px 10px; border-radius: 10px; font-size: 12px;
      border: 1px solid rgba(236,72,153,0.1); background: var(--control-bg); color: var(--color-text-primary);
    }
    .search-input:focus { outline: none; border-color: rgba(236,72,153,0.3); }
    .clear-search {
      position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
      background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 16px; line-height: 1;
    }
    .clear-search:hover { color: var(--color-text-primary); }

    .entries-list { flex: 1; min-height: 200px; overflow-y: auto; position: relative; }
    .entries-canvas { position: relative; width: 100%; }
    .entry-item {
      position: absolute; left: 0; right: 0; box-sizing: border-box;
      display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px;
      padding: 6px 12px; border-radius: 10px; cursor: pointer; border: 1px solid transparent;
      background: transparent; color: var(--color-text-primary); text-align: left; transition: background 0.2s;
    }
    .sidebar-head { display: flex; align-items: center; gap: 8px; }
    .sidebar-count {
      font-size: 10px; padding: 1px 7px; border-radius: 999px;
      background: rgba(255,255,255,0.06); color: var(--color-text-muted);
    }
    .entry-item:hover { background: rgba(236,72,153,0.04); border-color: rgba(236,72,153,0.1); }
    .entry-item.active { background: rgba(236,72,153,0.08); border-color: rgba(236,72,153,0.2); }
    .entry-date { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
    .today-badge { font-size: 10px; font-weight: 700; color: rgb(236,72,153); background: rgba(236,72,153,0.1); padding: 1px 6px; border-radius: 6px; }
    .entry-preview { font-size: 11px; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    .no-entries { text-align: center; color: var(--color-text-muted); font-size: 13px; padding: 16px 0; }

    /* Phone layout. The page is already one column by 640px; what is left is the
       date row, which does not fit the card at all (the editor date is nowrap, so
       a full weekday and month is a hard minimum wider than a 320px screen), and
       the controls that were sized for a mouse pointer. */
    @media (max-width: 640px) {
      /* The date stops being a single unbreakable line and the two arrows move
         to the card's edges with the date between them, so the date can wrap
         instead of setting the row's minimum width. */
      .date-nav { flex: 1 1 100%; min-width: 0; justify-content: space-between; }
      .date-info { min-width: 0; }
      .editor-date { white-space: normal; text-align: center; }
      /* The status line drops to its own row under the date and keeps the
         right-hand position it has when the header is one row. */
      .editor-status { margin-left: auto; }

      /* Touch targets. Every control below was between 19px and 36px in its
         tappable dimension, which is under the 44px a fingertip covers, so each
         is given that minimum. None of them shrink. */
      .today-link {
        display: flex; align-items: center; min-height: 44px; padding: 0 12px;
      }
      /* A fixed flex basis of 44px and not just a width: the date's text still
         wants 226px, and without a fixed basis the two arrows would be the
         things the row shrinks. */
      .nav-btn { flex: 0 0 44px; width: 44px; height: 44px; }
      .delete-btn { min-height: 44px; padding: 0 14px; }
      .mode-btn { min-height: 36px; padding: 0 14px; }
      .highlight-swatch { width: 24px; height: 24px; border-radius: 6px; }
      .search-input { min-height: 44px; padding-right: 48px; }
      /* 44px wide, so the field above reserves that much of its own padding for
         it — otherwise the clear button sits on the last word of the query. */
      .clear-search {
        display: flex; align-items: center; justify-content: center;
        width: 44px; height: 44px; right: 2px; font-size: 18px;
      }

      /* The desktop floor of 300px is kept and lifted on a tall phone: roughly
         half the screen is what makes the box a place to write rather than three
         visible lines above a keyboard. */
      .read-surface { min-height: max(300px, 46vh); }

      /* Two labels that fit one line on the desktop wrap as whole labels here
         instead of breaking a word in half. */
      .editor-footer { flex-wrap: wrap; gap: 2px 12px; }
      /* The empty-state line quotes whatever was typed into the search box. */
      .no-entries { overflow-wrap: anywhere; }
    }

    /* Large screens.

       The editor and the list are a 1fr / 260px pair, and 1fr has no ceiling:
       on a 3840px screen the editor takes 1800px and a journal line runs the
       width of a dining table while the list sits a metre and a half away from
       the sentence it belongs to.

       Two changes answer that, and they are deliberately different sizes. The
       pair as a whole is held to a band and centred, so the page reads as one
       object in the middle of the window. Inside that band the list's 260px
       becomes a floor rather than a fixed width — it takes the extra room the
       band has to give, up to 380px, because a list row holds a date and a
       preview and reads better at the wider of the two; the editor takes what
       is left, which is where the band's own ceiling does the line-length work.

       The header is held to the same band. It is a title and two stat pills on
       a space-between row, and in a 1960px column those two ends are far enough
       apart not to read as one row. */

    @media (min-width: 1920px) {
      .page-header,
      .journal-layout {
        max-width: 1700px;
        margin-inline: auto;
      }
      .journal-layout {
        grid-template-columns: 1fr minmax(260px, 380px);
      }
      /* A grid item is min-width: auto by default, and the search field and the
         entry rows inside these two are the things that would otherwise set
         the tracks' floor rather than the tracks setting theirs. */
      .editor-card,
      .entries-sidebar,
      .journal-main {
        min-width: 0;
      }
    }

    @media (min-width: 2560px) {
      /* The type ladder the shell raises at this breakpoint cannot reach a
         literal pixel size, so the sizes this page reads at are restated. */
      .page-title {
        font-size: 34px;
      }
      .page-subtitle {
        font-size: 16px;
      }
      .journal-stats .stat-value {
        font-size: 20px;
      }
      .journal-stats .stat-label,
      .journal-reading,
      .entry-preview {
        font-size: 13px;
      }
      .editor-date {
        font-size: 17px;
      }
      .sidebar-title {
        font-size: 15px;
      }
      .entry-date {
        font-size: 14px;
      }
      .search-input {
        font-size: 14px;
      }
      .editor-footer,
      .save-indicator,
      .delete-btn {
        font-size: 13px;
      }
      .today-link {
        font-size: 12px;
      }
      .word-count {
        font-size: 13px;
      }
    }

    @media (min-width: 3440px) {
      .page-title {
        font-size: 36px;
      }
      /* A wall-mounted screen is read standing up: the two boxes grow a little
         and the text inside them grows with the room. */
      .editor-card,
      .entries-sidebar,
      .preview-card {
        padding: var(--space-lg);
      }
      .editor-date {
        font-size: 18px;
      }
    }

    /* ===== The editor, wearing this app's colours =====

       The rm-ng-editor package ships a fixed light palette — white surfaces,
       #333 text, a blue active button — plus a dark set in #1e1e1e. Either
       would be a second theme next to this one, and neither can follow the
       app's switch, because the switch is a class on <html> and a component
       cannot see it. These rules map the editor onto DeepWork's own tokens,
       which flip with the theme by themselves.

       ::ng-deep is how a stylesheet reaches inside another component's view,
       and the rest of each selector is what beats the editor's own rules: a
       component's styles carry an encapsulation attribute, so .toolbar-btn
       from outside loses to .toolbar-btn from inside even when it is written
       later. !important would be the other answer, and it is the worse one.

       All of this lives in this component rather than in styles.css on
       purpose: the page is lazy-loaded, and a page's CSS should arrive with the
       page instead of being downloaded by the dashboard. */

    .journal-editor ::ng-deep .ng-rm-editor-wrapper {
      font-family: var(--font-sans);
      color: var(--color-text-primary);
      background: var(--control-bg);
      border: 1px solid rgba(236, 72, 153, 0.12);
      border-radius: 12px;
      overflow: hidden;
    }

    /* Full screen puts the editor over the whole window. The wrapper's own
       background is translucent glass here, which would let the page show
       through, and the library's full screen keeps no line-length ceiling — a
       journal line across a 4K window. */
    .journal-editor ::ng-deep .ng-rm-editor-wrapper.full-screen {
      background: var(--color-bg-primary);
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .toolbar {
      background: transparent;
      border-bottom: 1px solid rgba(236, 72, 153, 0.1);
      padding: 4px 6px;
      gap: 2px;
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .toolbar-group {
      gap: 2px;
      flex-wrap: wrap;
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .toolbar-group:not(:last-child):not(:empty):after {
      background: rgba(236, 72, 153, 0.14);
      height: 18px;
      margin: 0 3px;
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .toolbar-btn {
      width: 24px;
      height: 24px;
      border-radius: 7px;
      color: var(--color-text-secondary);
      font-size: 12px;
    }

    /* A fingertip is bigger than a toolbar button, and this row is the one
       place on the page where twenty-odd controls sit side by side. */
    @media (max-width: 640px) {
      .journal-editor ::ng-deep .ng-rm-editor-wrapper .toolbar-btn {
        width: 36px;
        height: 36px;
        font-size: 14px;
      }
      .journal-editor ::ng-deep .ng-rm-editor-wrapper .toolbar-select {
        height: 36px;
        font-size: 12px;
      }
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .toolbar-btn:hover {
      background: rgba(236, 72, 153, 0.1);
      color: var(--color-text-primary);
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .toolbar-btn.active {
      background: rgba(236, 72, 153, 0.85);
      color: #fff;
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .toolbar-btn:focus-visible {
      outline: 2px solid rgb(236, 72, 153);
      outline-offset: 1px;
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .toolbar-select {
      height: 26px;
      border-radius: 6px;
      border: 1px solid rgba(236, 72, 153, 0.14);
      background: var(--control-bg);
      color: var(--color-text-primary);
      font-size: 11px;
      font-family: var(--font-sans);
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .color-picker {
      width: 26px;
      height: 26px;
      border-radius: 7px;
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .color-picker::-webkit-color-swatch {
      border-radius: 5px;
      border-color: rgba(236, 72, 153, 0.2);
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .editor-content {
      padding: 16px;
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.75;
      color: var(--color-text-primary);
      caret-color: rgb(236, 72, 153);
    }

    /* On start the editor sets Arial as its "default font" through a deprecated
       command. A face attribute on a wrapper span outranks the content font, so
       the journal keeps its own type. */
    .journal-editor ::ng-deep .ng-rm-editor-wrapper .editor-content font {
      font-family: inherit;
    }

    /* The library lights the whole box up on focus, which reads as a text field
       rather than as the page. The caret marks where the writing goes. */
    .journal-editor ::ng-deep .ng-rm-editor-wrapper .editor-content:focus {
      background-color: transparent;
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .editor-content:empty::before {
      color: var(--color-text-muted);
      opacity: 0.75;
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .editor-content a {
      color: rgb(236, 72, 153);
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .editor-content blockquote {
      margin: 1em 0;
      padding: 0.2em 0 0.2em 1em;
      border-left: 3px solid rgba(236, 72, 153, 0.45);
      color: var(--color-text-secondary);
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .editor-content code,
    .journal-editor ::ng-deep .ng-rm-editor-wrapper .editor-content pre {
      font-family: var(--font-mono);
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .editor-content pre {
      background: var(--control-bg);
      border: 1px solid rgba(236, 72, 153, 0.12);
      border-radius: 10px;
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .editor-content img {
      max-width: 100%;
      height: auto;
      border-radius: 10px;
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .editor-content td,
    .journal-editor ::ng-deep .ng-rm-editor-wrapper .editor-content th {
      border-color: rgba(236, 72, 153, 0.2);
    }

    /* A reading-width column when the editor takes the whole window. */
    .journal-editor ::ng-deep .ng-rm-editor-wrapper.full-screen .editor-content {
      max-width: 900px;
      margin-inline: auto;
      padding: 32px 24px;
      font-size: 16px;
    }

    /* The keyboard-shortcut and source dialogs are drawn inside the editor, with
       the library's own white panels. Only the shortcuts one can be opened here. */
    .journal-editor ::ng-deep .ng-rm-editor-wrapper .modal-content {
      background: var(--color-bg-secondary);
      color: var(--color-text-primary);
      border: 1px solid rgba(236, 72, 153, 0.16);
      border-radius: 14px;
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .modal-header h3 {
      color: var(--color-text-primary);
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .modal-header,
    .journal-editor ::ng-deep .ng-rm-editor-wrapper .modal-footer {
      border-color: rgba(236, 72, 153, 0.14);
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .modal-header .close-btn {
      color: var(--color-text-muted);
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .modal-header .close-btn:hover {
      background: rgba(236, 72, 153, 0.12);
      color: var(--color-text-primary);
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .shortcuts-section h4 {
      color: var(--color-text-secondary);
      border-bottom-color: rgba(236, 72, 153, 0.45);
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .shortcuts-section li {
      border-bottom-color: color-mix(in srgb, currentColor 12%, transparent);
      color: var(--color-text-secondary);
    }

    .journal-editor ::ng-deep .ng-rm-editor-wrapper .shortcuts-section kbd {
      background: var(--control-bg);
      border-color: rgba(236, 72, 153, 0.2);
      color: var(--color-text-secondary);
      font-family: var(--font-mono);
    }

    /* The length error the form wrapper draws belongs on the field it is about,
       which here is the editor rather than a textarea. */
    .journal-editor ::ng-deep .has-error .ng-rm-editor-wrapper {
      border-color: rgba(248, 113, 113, 0.55);
    }

    /* ===== The read-only render =====

       The same markup the editor holds, painted as a page: the entry under the
       editor, and the entry inside the card when it is switched to read mode.
       These rules have to reach through ::ng-deep for a second reason as well
       as the first — the content arrives through innerHTML, so its elements
       carry none of this component's encapsulation attributes. */

    .preview-surface {
      color: var(--color-text-primary);
      font-size: 14px;
      line-height: 1.75;
      overflow-wrap: anywhere;
    }

    .preview-surface ::ng-deep p {
      margin: 0 0 0.85em;
    }

    .preview-surface ::ng-deep h1,
    .preview-surface ::ng-deep h2,
    .preview-surface ::ng-deep h3,
    .preview-surface ::ng-deep h4,
    .preview-surface ::ng-deep h5,
    .preview-surface ::ng-deep h6 {
      margin: 1.2em 0 0.45em;
      line-height: 1.3;
      font-weight: 700;
      color: var(--color-text-primary);
    }

    .preview-surface ::ng-deep h1 {
      font-size: 22px;
    }

    .preview-surface ::ng-deep h2 {
      font-size: 19px;
    }

    .preview-surface ::ng-deep h3 {
      font-size: 16px;
    }

    .preview-surface ::ng-deep h4,
    .preview-surface ::ng-deep h5,
    .preview-surface ::ng-deep h6 {
      font-size: 14px;
    }

    .preview-surface ::ng-deep ul,
    .preview-surface ::ng-deep ol {
      margin: 0 0 0.85em;
      padding-left: 1.4em;
    }

    .preview-surface ::ng-deep ul {
      list-style: disc;
    }

    .preview-surface ::ng-deep ol {
      list-style: decimal;
    }

    .preview-surface ::ng-deep li {
      margin: 0.2em 0;
    }

    .preview-surface ::ng-deep blockquote {
      margin: 1em 0;
      padding: 0.2em 0 0.2em 1em;
      border-left: 3px solid rgba(236, 72, 153, 0.45);
      color: var(--color-text-secondary);
    }

    .preview-surface ::ng-deep a {
      color: rgb(236, 72, 153);
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .preview-surface ::ng-deep code {
      font-family: var(--font-mono);
      font-size: 13px;
      background: var(--control-bg);
      padding: 0.1em 0.35em;
      border-radius: 4px;
    }

    .preview-surface ::ng-deep pre {
      background: var(--control-bg);
      padding: 12px 14px;
      border-radius: 10px;
      overflow-x: auto;
    }

    .preview-surface ::ng-deep pre code {
      background: none;
      padding: 0;
    }

    .preview-surface ::ng-deep img {
      max-width: 100%;
      height: auto;
      border-radius: 10px;
    }

    .preview-surface ::ng-deep table {
      width: 100%;
      margin: 0 0 1em;
      border-collapse: collapse;
      font-size: 13px;
    }

    .preview-surface ::ng-deep th,
    .preview-surface ::ng-deep td {
      border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
      padding: 6px 9px;
      text-align: left;
      vertical-align: top;
    }

    .preview-surface ::ng-deep th {
      background: var(--control-bg);
      font-weight: 600;
    }

    .preview-surface ::ng-deep hr {
      border: none;
      border-top: 1px solid color-mix(in srgb, currentColor 18%, transparent);
      margin: 1.4em 0;
    }

    @media (min-width: 2560px) {
      .preview-surface {
        font-size: 16px;
      }
    }

  `]
})
export class JournalComponent implements OnInit, OnDestroy {
  private db = inject(DbService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private theme = inject(ThemeService);
  private sanitizer = inject(DomSanitizer);
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Fixed row height for the virtualised entry list. */
  protected readonly entryRowHeight = 56;

  readonly todayDate = todayIso();

  readonly highlights = HIGHLIGHTS;

  entries = signal<JournalEntry[]>([]);
  selectedDate = signal<string>(this.route.snapshot.paramMap.get('date') ?? this.todayDate);
  searchQuery = signal('');
  saving = signal(false);
  lastSaved = signal(false);
  /** Which half of the card is showing: the editor, or the entry read-only. */
  mode = signal<'write' | 'read'>('write');

  readonly journalModel = signal<JournalFormModel>(createJournalFormDefaults());
  readonly journalForm = form(this.journalModel, (s) => {
    maxLength(s.content, 50000, { message: 'Journal entry must be 50,000 characters or fewer' });
  });

  private readonly editor = viewChild(RmNgEditor);

  placeholder = computed(() =>
    PROMPTS[this.hashDate(this.selectedDate()) % PROMPTS.length]
  );

  isToday = computed(() => this.selectedDate() === this.todayDate);

  selectedDateFormatted = computed(() => {
    const d = new Date(this.selectedDate() + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  });

  /** The entry as words: what counts, searches and the empty state look at. */
  readonly plainText = computed(() => journalText(this.journalModel().content));

  hasContent = computed(() => this.plainText().length > 0);

  /**
   * The entry as markup, for both read surfaces.
   *
   * Marked trusted rather than left to Angular's sanitiser, because that
   * sanitiser drops every `style` attribute — which is exactly how the editor
   * writes colour and highlighting, so an entry would lose the formatting it
   * was given. `sanitizeJournalHtml` is the boundary instead: it removes the
   * elements that can carry script, every inline handler, `javascript:` URLs
   * (entities and odd spacing included) and the CSS that fetches or executes.
   * What it keeps is the prose and the emphasis.
   */
  previewHtml = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(journalHtml(this.journalModel().content)),
  );

  wordCount = computed(() => countWords(this.plainText()));

  readingTime = computed(() => Math.max(1, Math.round(this.wordCount() / 200)));

  /**
   * Every entry with its text worked out, then the ones that say something.
   * The old filter asked whether the stored string was blank; with markup that
   * question is wrong, because "<p><br></p>" is not blank and never said a word.
   */
  private readonly views = computed<JournalEntryView[]>(() =>
    this.entries().map((entry) => {
      const text = journalText(entry.content);
      return { ...entry, text, snippet: snippet(text) };
    })
  );

  pastEntries = computed(() => this.views().filter((entry) => entry.text.length > 0));

  /** Same engine the Analytics page uses, so the numbers always agree. */
  readonly stats = computed(() =>
    buildJournalStats(
      this.pastEntries().map(entry => ({ date: entry.date, content: entry.text })),
      new Date()
    )
  );

  private readonly rhythmMax = computed(() =>
    Math.max(1, ...this.stats().weeks.map(week => week.words))
  );

  /** One line that says what the journaling pattern actually is. */
  readonly reading = computed(() => {
    const stats = this.stats();
    const parts: string[] = [];
    if (stats.consistencyPercent >= 60) {
      parts.push(`You have written on ${stats.consistencyPercent}% of the last 30 days — this is a solid routine.`);
    } else if (stats.consistencyPercent > 0) {
      parts.push(`You have written on ${stats.consistencyPercent}% of the last 30 days; a short entry still counts.`);
    }
    if (stats.bestWeekday) {
      parts.push(`${stats.bestWeekday.label} is your most reflective day (${stats.bestWeekday.averageWords} words on average).`);
    }
    if (stats.longestStreak > 1) {
      parts.push(`Longest run so far: ${stats.longestStreak} days.`);
    }
    return parts.join(' ');
  });

  /**
   * The editor's configuration.
   *
   * Recomputed when the day changes (the prompt is part of the placeholder) and
   * when the theme does: the editor keeps its own light and dark palettes and
   * cannot see the `theme-light` class this app puts on `<html>`.
   *
   * The journaling toolbar is deliberately short — emphasis, headings, lists,
   * alignment, colour, links, undo — because a journal is prose. Tables, media
   * embeds and the HTML source view are not offered, and neither is the
   * library's own word counter, which would sit under a footer that already
   * states the same numbers.
   */
  readonly editorConfig = computed<EditorConfig>(() => ({
    placeholder: this.placeholder(),
    height: 'clamp(300px, 46vh, 640px)',
    maxHeight: 'clamp(360px, 60vh, 760px)',
    showToolbar: true,
    theme: { mode: this.theme.effective() },
    validation: {
      showWordCount: false,
      showCharacterCount: false,
      showReadingTime: false,
    },
    fullScreen: {
      enabled: true,
      hideToolbarInFullScreen: false,
      exitOnEscape: true,
      distractionFree: false,
    },
    toolbarConfig: {
      showTextFormatting: true,
      showBold: true,
      showItalic: true,
      showUnderline: true,
      showStrikethrough: true,
      showScriptFormatting: false,
      showFontControls: false,
      showColorControls: true,
      showTextColor: true,
      showHeadings: true,
      showBlockFormatting: false,
      showAlignment: true,
      showLists: true,
      showIndent: true,
      showUndoRedo: true,
      showClearFormatting: true,
      showPageBreak: false,
      showSectionDivider: false,
      showLinkMedia: true,
      showInsertLink: true,
      showEditLink: false,
      showRemoveLink: false,
      showLinkTarget: false,
      showInsertImage: false,
      showInsertVideo: false,
      showInsertAudio: false,
      showMediaEmbed: false,
      showSpellCheck: false,
      showValidation: false,
      showViewMode: true,
      showThemeToggle: false,
      showFullScreen: true,
      showDistractionFree: true,
      showTable: false,
      showAccessibility: true,
      showHtmlEdit: false,
      showKeyboardShortcuts: true,
    },
  }));

  protected weekPercent(words: number): number {
    return (words / this.rhythmMax()) * 100;
  }

  filteredEntries = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.pastEntries();
    return this.pastEntries().filter(e => e.text.toLowerCase().includes(q));
  });

  streak = computed(() => {
    const dates = new Set(this.pastEntries().map(e => e.date));
    let count = 0;
    const cursor = new Date();
    for (;;) {
      const iso = cursor.toISOString().slice(0, 10);
      if (!dates.has(iso)) break;
      count++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  });

  async ngOnInit(): Promise<void> {
    await this.db.init();
    const all = await this.db.getJournalEntries();
    this.entries.set(all);
    this.loadEntryForSelectedDate();
    this.route.paramMap.subscribe(params => {
      const date = params.get('date') ?? this.todayDate;
      if (date !== this.selectedDate()) {
        if (this.saveTimeout) { clearTimeout(this.saveTimeout); this.save(); }
        this.selectedDate.set(date);
        this.loadEntryForSelectedDate();
      }
    });
  }

  ngOnDestroy(): void {
    // A save that is still waiting out its debounce is written rather than
    // dropped: the entry was typed, so it is an entry.
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.save();
    }
  }

  /** The editor reports every keystroke; the model is what everything reads. */
  onEditorChange(html: string): void {
    this.journalModel.set({ content: html });
    this.onContentChange();
  }

  /** Marks the field touched so the length error, if any, can be shown. */
  onEditorBlur(): void {
    this.journalForm.content().markAsTouched();
  }

  /**
   * Paints the selection.
   *
   * `hiliteColor` is the command that sets a background — `foreColor` is the
   * one the toolbar's colour picker already uses for the text itself. The
   * editor re-reads its own DOM after any command, so the model (and therefore
   * the preview and the next save) sees the highlight without anything else
   * being wired up. The swatches cancel `mousedown` so the selection the user
   * made is still there when the command runs.
   */
  highlight(colour: string): void {
    this.editor()?.execCommand('hiliteColor', colour);
  }

  private loadEntryForSelectedDate(): void {
    const entry = this.entries().find(e => e.date === this.selectedDate());
    // Stored entries are markup, except the ones written before the editor.
    this.journalModel.set({ content: entry ? journalHtml(entry.content) : '' });
    this.lastSaved.set(false);
  }

  setMode(mode: 'write' | 'read'): void {
    this.mode.set(mode);
  }

  onContentChange(): void {
    this.lastSaved.set(false);
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.save(), 1000);
  }

  onManualSave(event: Event): void {
    event.preventDefault();
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.save();
  }

  async save(): Promise<void> {
    this.saving.set(true);
    const date = this.selectedDate();
    const html = sanitizeJournalHtml(this.journalModel().content);
    // Nothing written is nothing stored: an emptied editor must not leave an
    // entry behind that counts a day and previews as a blank paragraph.
    const content = journalText(html).length > 0 ? html : '';
    const existing = this.entries().find(e => e.date === date);
    const entry: JournalEntry = {
      id: existing?.id ?? crypto.randomUUID(),
      date,
      content,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.db.saveJournalEntry(entry);
    // Update local state
    const all = this.entries().filter(e => e.date !== date);
    all.unshift(entry);
    all.sort((a, b) => b.date.localeCompare(a.date));
    this.entries.set(all);
    this.saving.set(false);
    this.lastSaved.set(true);
  }

  selectEntry(entry: JournalEntry): void {
    this.router.navigate(['/journal', entry.date]);
  }

  goToDay(offset: number): void {
    const d = new Date(this.selectedDate() + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    const iso = d.toISOString().slice(0, 10);
    if (iso > this.todayDate) return;
    this.router.navigate(['/journal', iso]);
  }

  goToToday(): void {
    this.router.navigate(['/journal']);
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  async confirmDelete(): Promise<void> {
    if (!this.hasContent()) return;
    const ok = window.confirm('Delete this journal entry? This cannot be undone.');
    if (!ok) return;
    const date = this.selectedDate();
    await this.db.deleteJournalEntry(date);
    this.entries.set(this.entries().filter(e => e.date !== date));
    this.journalModel.set({ content: '' });
    this.lastSaved.set(false);
  }

  formatEntryDate(date: string): string {
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  private hashDate(date: string): number {
    let hash = 0;
    for (let i = 0; i < date.length; i++) hash = (hash * 31 + date.charCodeAt(i)) >>> 0;
    return hash;
  }
}
