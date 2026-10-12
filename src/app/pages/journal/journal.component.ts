import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { form, FormField, validate, maxLength } from '@angular/forms/signals';
import { DbService } from '../../core/services/db.service';
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

        <div class="editor-footer">
          <span class="word-count">{{ wordCount() }} words · {{ readingTime() }} min read</span>
          <span>Ctrl+S to save now</span>
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

    .journal-layout { display: grid; grid-template-columns: 1fr 260px; gap: 16px; }
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
      .editor-card, .entries-sidebar { min-width: 0; }
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
    .editor-status { display: flex; align-items: center; gap: 10px; }
    .save-indicator { font-size: 11px; color: var(--color-text-muted); }
    .save-indicator.saved { color: rgb(52,211,153); }
    .delete-btn {
      background: none; border: 1px solid rgba(239,68,68,0.25); color: rgb(239,68,68);
      font-size: 11px; padding: 3px 8px; border-radius: 8px; cursor: pointer;
    }
    .delete-btn:hover { background: rgba(239,68,68,0.08); }

    .journal-textarea {
      flex: 1; min-height: 300px; resize: vertical; padding: 14px; border-radius: 12px;
      border: 1px solid rgba(236,72,153,0.1); background: var(--control-bg);
      color: var(--color-text-primary); font-family: 'JetBrains Mono', monospace;
      font-size: 14px; line-height: 1.7;
    }
    .journal-textarea:focus { outline: none; border-color: rgba(236,72,153,0.3); }
    .journal-textarea::placeholder { color: var(--color-text-muted); opacity: 0.6; }

    .editor-footer { display: flex; justify-content: space-between; margin-top: 8px; font-size: 11px; color: var(--color-text-muted); }

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
      .journal-textarea { min-height: max(300px, 46vh); }

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
      .entries-sidebar {
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
      .journal-textarea {
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
      .entries-sidebar {
        padding: var(--space-lg);
      }
      .journal-textarea {
        font-size: 18px;
        min-height: 380px;
      }
      .editor-date {
        font-size: 18px;
      }
    }

  `]
})
export class JournalComponent implements OnInit, OnDestroy {
  private db = inject(DbService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private saveTimeout: any = null;

  /** Fixed row height for the virtualised entry list. */
  protected readonly entryRowHeight = 56;

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

