import { Component, inject, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { form, FormField, validate, maxLength } from '@angular/forms/signals';
import { DbService } from '../../core/services/db.service';
import { FormFieldWrapperComponent } from '../../shared/components/form-field/form-field-wrapper.component';
import { JournalFormModel, createJournalFormDefaults } from '../../shared/models/form.models';
import { noXss } from '../../shared/validators/form-validators';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';

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
  imports: [FormField, FormFieldWrapperComponent, TooltipDirective],
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
            class="journal-textarea"
            [formField]="journalForm.content"
            [placeholder]="placeholder()"
            (input)="onContentChange()"
            (keydown.control.s)="onManualSave($event)"
          ></textarea>
        </app-form-field>
        <div class="editor-footer">
          <span class="word-count">{{ wordCount() }} words · {{ readingTime() }} min read</span>
          <span class="shortcut-hint">Ctrl+S to save now</span>
        </div>
      </div>

      <!-- Past entries -->
      <div class="entries-sidebar">
        <h3 class="sidebar-title">Past Entries</h3>
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
        <div class="entries-list">
          @for (entry of filteredEntries(); track entry.id) {
            <button class="entry-item" [class.active]="selectedDate() === entry.date" (click)="selectEntry(entry)">
              <span class="entry-date">
                {{ formatEntryDate(entry.date) }}
                @if (entry.date === todayDate) {
                  <span class="today-badge">Today</span>
                }
              </span>
              <span class="entry-preview">{{ entry.content.slice(0, 60) }}{{ entry.content.length > 60 ? '...' : '' }}</span>
            </button>
          }
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

    .entries-list { display: flex; flex-direction: column; gap: 4px; max-height: 400px; overflow-y: auto; }
    .entry-item {
      display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
      padding: 10px 12px; border-radius: 10px; cursor: pointer; border: 1px solid transparent;
      background: transparent; color: var(--color-text-primary); text-align: left; transition: all 0.2s;
    }
    .entry-item:hover { background: rgba(236,72,153,0.04); border-color: rgba(236,72,153,0.1); }
    .entry-item.active { background: rgba(236,72,153,0.08); border-color: rgba(236,72,153,0.2); }
    .entry-date { font-size: 0.75rem; font-weight: 600; display: flex; align-items: center; gap: 6px; }
    .today-badge { font-size: 0.6rem; font-weight: 700; color: rgb(236,72,153); background: rgba(236,72,153,0.1); padding: 1px 6px; border-radius: 6px; }
    .entry-preview { font-size: 0.7rem; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    .no-entries { text-align: center; color: var(--color-text-muted); font-size: 0.8rem; padding: 16px 0; }
  `]
})
export class JournalComponent implements OnInit, OnDestroy {
  private db = inject(DbService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private saveTimeout: any = null;

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

