import {
  Component,
  ElementRef,
  inject,
  signal,
  computed,
  effect,
  untracked,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { form, FormField, validate, maxLength } from '@angular/forms/signals';
import { DbService } from '../../core/services/db.service';
import { DictationService } from '../../core/services/dictation.service';
import { FormFieldWrapperComponent } from '../../shared/components/form-field/form-field-wrapper.component';
import { JournalFormModel, createJournalFormDefaults } from '../../shared/models/form.models';
import { noXss } from '../../shared/validators/form-validators';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { VirtualWindowDirective } from '../../shared/directives/virtual-window.directive';
import { buildJournalStats } from '../../core/utils/insights.util';

interface JournalEntry {
  id: string;
  date: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const PROMPTS = [
  'What went well today?\nWhat could be improved?\nWhat are you grateful for?',
  'What was the most focused moment of your day?\nWhat pulled your attention away?',
  'What did you learn today that you didn\'t know yesterday?',
  'What is one small win worth celebrating?\nWhat would make tomorrow even better?',
  'How did you feel during your deep work sessions today?',
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'app-journal',
  imports: [FormField, FormFieldWrapperComponent, TooltipDirective, VirtualWindowDirective, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
            @if (hasContent()) {
              <button class="delete-btn" type="button" (click)="confirmDelete()" appTooltip="Delete this entry">Delete</button>
            }
          </div>
        </div>
        <app-form-field [fieldState]="journalForm.content()">
          <textarea
            #journalText
            class="journal-textarea"
            [formField]="journalForm.content"
            [placeholder]="placeholder()"
            (input)="onContentChange()"
            (keydown.control.s)="onManualSave($event)"
          ></textarea>
        </app-form-field>

        <!-- Dictation -->
        <div class="dictation-bar">
          <button
            type="button"
            class="mic-btn"
            [class.listening]="dictation.listening()"
            [disabled]="!dictation.supported()"
            [attr.aria-pressed]="dictation.listening()"
            [appTooltip]="dictation.supported()
              ? (dictation.listening() ? 'Stop dictating' : 'Dictate your entry with the microphone')
              : 'Speech recognition is not available in this runtime'"
            (click)="toggleDictation()"
          >
            @if (dictation.listening()) {
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              Stop
            } @else {
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
              Dictate
            }
          </button>

          <select
            class="dictation-lang"
            [value]="dictation.language()"
            (change)="onLanguageChange($event)"
            [disabled]="dictation.listening()"
            aria-label="Dictation language"
            appTooltip="Pick the English variant (or language) you speak — this is the single biggest accuracy lever"
          >
            @for (lang of dictation.languages; track lang.code) {
              <option [value]="lang.code">{{ lang.label }}</option>
            }
          </select>

          <button
            type="button"
            class="dictation-more"
            [class.on]="vocabularyOpen()"
            [attr.aria-expanded]="vocabularyOpen()"
            (click)="vocabularyOpen.set(!vocabularyOpen())"
            appTooltip="Teach dictation the words it keeps mis-hearing"
          >
            Vocabulary
          </button>

          @if (dictation.listening()) {
            <span class="listening-pill"><span class="live-dot"></span>Listening</span>
          }
        </div>

        @if (dictation.listening() || dictation.interim()) {
          <p class="dictation-live" aria-live="polite">{{ dictation.interim() || 'Speak now…' }}</p>
        }

        @if (dictation.error(); as dictationError) {
          <p class="dictation-error">{{ dictationError }}</p>
        }

        @if (!dictation.supported()) {
          <p class="dictation-hint">
            This build's runtime has no speech engine, so the microphone button is off.
            You can still dictate offline with your operating system:
            <strong>Win + H</strong> on Windows, <strong>Fn Fn</strong> on macOS, or your desktop's
            dictation shortcut — it types straight into this box. See <em>SETUP.md</em> to add a
            built-in offline engine.
          </p>
        }

        @if (vocabularyOpen()) {
          <div class="vocab-panel">
            <p class="vocab-hint">
              Everyone pronounces words differently. Add the phrases your microphone mis-hears and the
              correction to write instead — they are applied to every dictated phrase.
            </p>
            @for (correction of dictation.corrections(); track $index) {
              <div class="vocab-row">
                <input
                  class="vocab-input"
                  type="text"
                  [value]="correction.from"
                  placeholder="heard as"
                  (change)="updateCorrection($index, 'from', $event)"
                  aria-label="Spoken phrase"
                >
                <span class="vocab-arrow">→</span>
                <input
                  class="vocab-input"
                  type="text"
                  [value]="correction.to"
                  placeholder="written as"
                  (change)="updateCorrection($index, 'to', $event)"
                  aria-label="Replacement text"
                >
                <button type="button" class="vocab-remove" (click)="removeCorrection($index)" aria-label="Remove this correction">✕</button>
              </div>
            }
            <button type="button" class="vocab-add" (click)="addCorrection()">+ Add a word or phrase</button>
            <p class="vocab-tip">
              Tip: say “comma”, “period”, “question mark” or “new line” while dictating and it is written as punctuation.
            </p>
          </div>
        }
        <div class="editor-footer">
          <span class="word-count">{{ wordCount() }} words · {{ readingTime() }} min read</span>
          <span class="shortcut-hint">Ctrl+S to save now</span>
        </div>
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
                <span class="entry-preview">{{ row.item.content.slice(0, 60) }}{{ row.item.content.length > 60 ? '...' : '' }}</span>
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
    .page-title { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
    .page-subtitle { color: var(--color-text-muted); margin-top: 4px; font-size: 0.85rem; }

    .header-stats { display: flex; gap: 10px; }
    .journal-stats {
      display: flex; align-items: flex-end; gap: 18px; flex-wrap: wrap;
      padding: 12px 16px; margin-bottom: 10px; border-radius: 14px;
      background: var(--glass-bg); border: 1px solid rgba(236,72,153,0.12);
    }
    .journal-stats .stat { display: flex; flex-direction: column; align-items: center; }
    .journal-stats .stat-value { font-size: 1.05rem; font-weight: 800; color: var(--color-text-primary); }
    .journal-stats .stat-label { font-size: 0.55rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    /* 12-week writing rhythm: one bar per week, oldest → newest. */
    .rhythm { display: flex; align-items: flex-end; gap: 3px; height: 46px; margin-left: auto; }
    .rhythm-bar {
      width: 9px; min-height: 2px; border-radius: 3px 3px 0 0;
      background: linear-gradient(to top, rgba(236,72,153,0.35), rgba(236,72,153,0.75));
    }
    .journal-reading {
      font-size: 0.72rem; line-height: 1.55; color: var(--color-text-secondary);
      margin-bottom: 12px;
    }
    .stat-pill {
      display: flex; flex-direction: column; align-items: center; padding: 6px 14px; border-radius: 12px;
      background: var(--glass-bg); border: 1px solid rgba(236,72,153,0.1); min-width: 72px;
    }
    .stat-value { font-size: 1.1rem; font-weight: 800; color: var(--color-text-primary); }
    .stat-label { font-size: 0.65rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }

    .journal-layout { display: grid; grid-template-columns: 1fr 260px; gap: 16px; }
    @media (max-width: 700px) { .journal-layout { grid-template-columns: 1fr; } }

    .editor-card {
      padding: 20px; border-radius: 16px;
      background: var(--glass-bg); backdrop-filter: blur(12px);
      border: 1px solid rgba(236,72,153,0.1); display: flex; flex-direction: column;
    }
    .editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 12px; flex-wrap: wrap; }
    .date-nav { display: flex; align-items: center; gap: 8px; }
    .date-info { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .editor-date { font-size: 0.9rem; font-weight: 600; white-space: nowrap; }
    .today-link { background: none; border: none; color: rgb(236,72,153); font-size: 0.65rem; cursor: pointer; padding: 0; }
    .today-link:hover { text-decoration: underline; }
    .nav-btn {
      width: 26px; height: 26px; border-radius: 8px; border: 1px solid rgba(236,72,153,0.15);
      background: var(--control-bg); color: var(--color-text-primary); cursor: pointer; font-size: 0.95rem;
      display: flex; align-items: center; justify-content: center; line-height: 1;
    }
    .nav-btn:hover:not(:disabled) { background: rgba(236,72,153,0.08); }
    .nav-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .editor-status { display: flex; align-items: center; gap: 10px; }
    .save-indicator { font-size: 0.7rem; color: var(--color-text-muted); }
    .save-indicator.saved { color: rgb(52,211,153); }
    .delete-btn {
      background: none; border: 1px solid rgba(239,68,68,0.25); color: rgb(239,68,68);
      font-size: 0.7rem; padding: 3px 8px; border-radius: 8px; cursor: pointer;
    }
    .delete-btn:hover { background: rgba(239,68,68,0.08); }

    .journal-textarea {
      flex: 1; min-height: 300px; resize: vertical; padding: 14px; border-radius: 12px;
      border: 1px solid rgba(236,72,153,0.1); background: var(--control-bg);
      color: var(--color-text-primary); font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem; line-height: 1.7;
    }
    .journal-textarea:focus { outline: none; border-color: rgba(236,72,153,0.3); }
    .journal-textarea::placeholder { color: var(--color-text-muted); opacity: 0.6; }

    .editor-footer { display: flex; justify-content: space-between; margin-top: 8px; font-size: 0.7rem; color: var(--color-text-muted); }

    .entries-sidebar {
      padding: 16px; border-radius: 16px;
      background: var(--glass-bg); backdrop-filter: blur(12px);
      border: 1px solid rgba(236,72,153,0.06); display: flex; flex-direction: column;
    }
    .sidebar-title { font-size: 0.8rem; font-weight: 600; margin-bottom: 12px; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }

    .search-box { position: relative; margin-bottom: 12px; }
    .search-input {
      width: 100%; padding: 8px 28px 8px 10px; border-radius: 10px; font-size: 0.75rem;
      border: 1px solid rgba(236,72,153,0.1); background: var(--control-bg); color: var(--color-text-primary);
    }
    .search-input:focus { outline: none; border-color: rgba(236,72,153,0.3); }
    .clear-search {
      position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
      background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 1rem; line-height: 1;
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
      font-size: 0.62rem; padding: 1px 7px; border-radius: 999px;
      background: rgba(255,255,255,0.06); color: var(--color-text-muted);
    }
    .entry-item:hover { background: rgba(236,72,153,0.04); border-color: rgba(236,72,153,0.1); }
    .entry-item.active { background: rgba(236,72,153,0.08); border-color: rgba(236,72,153,0.2); }
    .entry-date { font-size: 0.75rem; font-weight: 600; display: flex; align-items: center; gap: 6px; }
    .today-badge { font-size: 0.6rem; font-weight: 700; color: rgb(236,72,153); background: rgba(236,72,153,0.1); padding: 1px 6px; border-radius: 6px; }
    .entry-preview { font-size: 0.7rem; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    .no-entries { text-align: center; color: var(--color-text-muted); font-size: 0.8rem; padding: 16px 0; }

    /* ── Dictation ────────────────────────────────────────────────────── */
    .dictation-bar {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--glass-border);
    }
    .mic-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 14px; border-radius: 10px; cursor: pointer;
      font-size: 0.75rem; font-weight: 700; transition: all 0.2s;
      background: rgba(139, 92, 246, 0.14); border: 1px solid rgba(139, 92, 246, 0.35);
      color: var(--color-text-primary);
    }
    .mic-btn:hover:not(:disabled) { background: rgba(139, 92, 246, 0.24); }
    .mic-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .mic-btn.listening {
      background: rgba(248, 113, 113, 0.18); border-color: rgba(248, 113, 113, 0.5);
      animation: mic-pulse 1.6s ease-in-out infinite;
    }
    @keyframes mic-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.35); }
      50% { box-shadow: 0 0 0 7px rgba(248, 113, 113, 0); }
    }
    .dictation-lang {
      max-width: 210px; padding: 6px 8px; border-radius: 9px; font-size: 0.68rem; cursor: pointer;
      background: var(--control-bg); border: 1px solid var(--glass-border); color: var(--color-text-secondary);
    }
    .dictation-more {
      padding: 6px 10px; border-radius: 9px; cursor: pointer; font-size: 0.68rem;
      background: transparent; border: 1px solid var(--glass-border); color: var(--color-text-secondary);
    }
    .dictation-more:hover, .dictation-more.on { color: var(--color-text-primary); border-color: rgba(139, 92, 246, 0.4); }
    .listening-pill {
      display: inline-flex; align-items: center; gap: 6px; margin-left: auto;
      font-size: 0.62rem; font-weight: 700; color: #fca5a5; text-transform: uppercase; letter-spacing: 0.06em;
    }
    .live-dot {
      width: 7px; height: 7px; border-radius: 50%; background: #f87171;
      box-shadow: 0 0 8px rgba(248, 113, 113, 0.9); animation: live-blink 1s steps(2, start) infinite;
    }
    @keyframes live-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
    .dictation-live {
      margin: 8px 0 0; padding: 8px 10px; border-radius: 9px; font-size: 0.76rem; line-height: 1.5;
      color: var(--color-text-secondary); background: rgba(139, 92, 246, 0.07);
      border: 1px dashed rgba(139, 92, 246, 0.3); font-style: italic;
    }
    .dictation-error {
      margin: 8px 0 0; padding: 8px 10px; border-radius: 9px; font-size: 0.7rem;
      color: #fca5a5; background: rgba(248, 113, 113, 0.08); border: 1px solid rgba(248, 113, 113, 0.25);
    }
    .dictation-hint {
      margin: 8px 0 0; font-size: 0.68rem; line-height: 1.55; color: var(--color-text-muted);
    }
    .dictation-hint strong { color: var(--color-text-secondary); }
    .vocab-panel {
      margin-top: 10px; padding: 10px; border-radius: 10px;
      background: var(--glass-bg); border: 1px solid var(--glass-border);
    }
    .vocab-hint, .vocab-tip { font-size: 0.66rem; line-height: 1.5; color: var(--color-text-muted); margin-bottom: 8px; }
    .vocab-tip { margin: 8px 0 0; }
    .vocab-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .vocab-input {
      flex: 1; min-width: 0; padding: 5px 8px; border-radius: 8px; font-size: 0.7rem;
      background: var(--control-bg); border: 1px solid var(--glass-border); color: var(--color-text-primary);
    }
    .vocab-arrow { color: var(--color-text-muted); font-size: 0.75rem; }
    .vocab-remove {
      background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 0.7rem; padding: 2px 4px;
    }
    .vocab-remove:hover { color: #fca5a5; }
    .vocab-add {
      margin-top: 2px; padding: 5px 10px; border-radius: 8px; cursor: pointer; font-size: 0.66rem;
      background: rgba(139, 92, 246, 0.12); border: 1px solid rgba(139, 92, 246, 0.3); color: var(--color-text-primary);
    }
  `]
})
export class JournalComponent implements OnInit, OnDestroy {
  private db = inject(DbService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private saveTimeout: any = null;

  protected readonly dictation = inject(DictationService);
  protected readonly vocabularyOpen = signal(false);
  /** Fixed row height for the virtualised entry list. */
  protected readonly entryRowHeight = 56;
  private readonly textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('journalText');

  constructor() {
    // Each finished phrase is appended where the caret is. `untracked` keeps the
    // journal model out of this effect's dependencies so writing cannot re-trigger it.
    effect(() => {
      const chunk = this.dictation.finalChunk();
      if (chunk) untracked(() => this.insertDictated(chunk.text));
    });
  }

  readonly todayDate = todayIso();

  entries = signal<JournalEntry[]>([]);
  selectedDate = signal<string>(this.route.snapshot.paramMap.get('date') ?? this.todayDate);
  searchQuery = signal('');
  saving = signal(false);
  lastSaved = signal(false);

  readonly journalModel = signal<JournalFormModel>(createJournalFormDefaults());
  readonly journalForm = form(this.journalModel, (s) => {
    validate(s.content, noXss);
    maxLength(s.content, 50000, { message: 'Journal entry must be 50,000 characters or fewer' });
  });

  placeholder = computed(() => PROMPTS[this.hashDate(this.selectedDate()) % PROMPTS.length]);

  isToday = computed(() => this.selectedDate() === this.todayDate);

  selectedDateFormatted = computed(() => {
    const d = new Date(this.selectedDate() + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  });

  hasContent = computed(() => this.journalModel().content.trim().length > 0);

  wordCount = computed(() => {
    const text = this.journalModel().content.trim();
    return text.length === 0 ? 0 : text.split(/\s+/).length;
  });

  readingTime = computed(() => Math.max(1, Math.round(this.wordCount() / 200)));

  pastEntries = computed(() => {
    return this.entries().filter(e => e.content.trim().length > 0);
  });

  /** Same engine the Analytics page uses, so the numbers always agree. */
  readonly stats = computed(() =>
    buildJournalStats(
      this.pastEntries().map(entry => ({ date: entry.date, content: entry.content })),
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

  protected weekPercent(words: number): number {
    return (words / this.rhythmMax()) * 100;
  }

  filteredEntries = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.pastEntries();
    return this.pastEntries().filter(e => e.content.toLowerCase().includes(q));
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
    await this.dictation.load();
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
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.dictation.stop();
  }

  // ── Dictation ─────────────────────────────────────────────────────────────

  protected toggleDictation(): void {
    this.dictation.toggle();
  }

  protected onLanguageChange(event: Event): void {
    const code = (event.target as HTMLSelectElement).value;
    if (code) this.dictation.setLanguage(code);
  }

  protected addCorrection(): void {
    this.dictation.setCorrections([...this.dictation.corrections(), { from: '', to: '' }]);
    this.vocabularyOpen.set(true);
  }

  protected updateCorrection(index: number, key: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const next = this.dictation.corrections().map((correction, position) =>
      position === index ? { ...correction, [key]: value } : correction
    );
    this.dictation.setCorrections(next);
  }

  protected removeCorrection(index: number): void {
    this.dictation.setCorrections(
      this.dictation.corrections().filter((_, position) => position !== index)
    );
  }

  /** Drop dictated text in at the caret, keeping the sentence flowing. */
  private insertDictated(text: string): void {
    if (!text) return;
    const element = this.textareaRef()?.nativeElement;
    const current = this.journalModel().content ?? '';
    const start = element?.selectionStart ?? current.length;
    const end = element?.selectionEnd ?? current.length;

    const before = current.slice(0, start);
    const after = current.slice(end);
    const needsSpace = before.length > 0 && !/[\s\n]$/.test(before);
    const prefix = needsSpace ? ' ' : '';
    const inserted = prefix + text;

    this.journalModel.set({ ...this.journalModel(), content: before + inserted + after });
    this.onContentChange();

    const caret = before.length + inserted.length;
    queueMicrotask(() => {
      const target = this.textareaRef()?.nativeElement;
      if (!target) return;
      // Keep the DOM value in step with the model so the caret lands after the
      // dictated text even if the form binding has not flushed yet.
      const expected = before + inserted + after;
      if (target.value !== expected) target.value = expected;
      target.focus();
      target.setSelectionRange(caret, caret);
    });
  }

  private loadEntryForSelectedDate(): void {
    const entry = this.entries().find(e => e.date === this.selectedDate());
    this.journalModel.set({ content: entry?.content ?? '' });
    this.lastSaved.set(false);
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
    const content = this.journalModel().content;
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

