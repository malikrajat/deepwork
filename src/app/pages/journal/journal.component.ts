import { Component, inject, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { form, FormField, validate, maxLength } from '@angular/forms/signals';
import { DbService } from '../../core/services/db.service';
import { FormFieldWrapperComponent } from '../../shared/components/form-field/form-field-wrapper.component';
import { JournalFormModel, createJournalFormDefaults } from '../../shared/models/form.models';
import { noXss } from '../../shared/validators/form-validators';

interface JournalEntry {
  id: string;
  date: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

@Component({
  selector: 'app-journal',
  imports: [FormField, FormFieldWrapperComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header animate-fade-in">
      <h1 class="gradient-text page-title">Journal</h1>
      <p class="page-subtitle">Reflect on your day</p>
    </div>

    <div class="journal-layout animate-fade-in-delay-1">
      <!-- Today's entry -->
      <div class="editor-card">
        <div class="editor-header">
          <h3 class="editor-date">{{ todayFormatted() }}</h3>
          @if (saving()) {
            <span class="save-indicator">Saving...</span>
          } @else if (lastSaved()) {
            <span class="save-indicator saved">Saved</span>
          }
        </div>
        <app-form-field [fieldState]="journalForm.content()">
          <textarea
            class="journal-textarea"
            [formField]="journalForm.content"
            [placeholder]="placeholder"
            (input)="onContentChange()"
          ></textarea>
        </app-form-field>
      </div>

      <!-- Past entries -->
      <div class="entries-sidebar">
        <h3 class="sidebar-title">Past Entries</h3>
        <div class="entries-list">
          @for (entry of pastEntries(); track entry.id) {
            <button class="entry-item" [class.active]="selectedDate() === entry.date" (click)="selectEntry(entry)">
              <span class="entry-date">{{ formatEntryDate(entry.date) }}</span>
              <span class="entry-preview">{{ entry.content.slice(0, 60) }}{{ entry.content.length > 60 ? '...' : '' }}</span>
            </button>
          }
          @if (pastEntries().length === 0) {
            <div class="no-entries">No past entries yet</div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .page-header { margin-bottom: var(--space-xl); }
    .page-title { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
    .page-subtitle { color: var(--color-text-muted); margin-top: 4px; font-size: 0.85rem; }

    .journal-layout { display: grid; grid-template-columns: 1fr 260px; gap: 16px; }
    @media (max-width: 700px) { .journal-layout { grid-template-columns: 1fr; } }

    .editor-card {
      padding: 20px; border-radius: 16px;
      background: var(--glass-bg); backdrop-filter: blur(12px);
      border: 1px solid rgba(236,72,153,0.1); display: flex; flex-direction: column;
    }
    .editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .editor-date { font-size: 0.9rem; font-weight: 600; }
    .save-indicator { font-size: 0.7rem; color: var(--color-text-muted); }
    .save-indicator.saved { color: rgb(52,211,153); }

    .journal-textarea {
      flex: 1; min-height: 300px; resize: vertical; padding: 14px; border-radius: 12px;
      border: 1px solid rgba(236,72,153,0.1); background: var(--control-bg);
      color: var(--color-text-primary); font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem; line-height: 1.7;
    }
    .journal-textarea:focus { outline: none; border-color: rgba(236,72,153,0.3); }
    .journal-textarea::placeholder { color: var(--color-text-muted); opacity: 0.6; }

    .entries-sidebar {
      padding: 16px; border-radius: 16px;
      background: var(--glass-bg); backdrop-filter: blur(12px);
      border: 1px solid rgba(236,72,153,0.06);
    }
    .sidebar-title { font-size: 0.8rem; font-weight: 600; margin-bottom: 12px; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
    .entries-list { display: flex; flex-direction: column; gap: 4px; max-height: 400px; overflow-y: auto; }
    .entry-item {
      display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
      padding: 10px 12px; border-radius: 10px; cursor: pointer; border: 1px solid transparent;
      background: transparent; color: var(--color-text-primary); text-align: left; transition: all 0.2s;
    }
    .entry-item:hover { background: rgba(236,72,153,0.04); border-color: rgba(236,72,153,0.1); }
    .entry-item.active { background: rgba(236,72,153,0.08); border-color: rgba(236,72,153,0.2); }
    .entry-date { font-size: 0.75rem; font-weight: 600; }
    .entry-preview { font-size: 0.7rem; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    .no-entries { text-align: center; color: var(--color-text-muted); font-size: 0.8rem; padding: 16px 0; }
  `]
})
export class JournalComponent implements OnInit, OnDestroy {
  private db = inject(DbService);
  private saveTimeout: any = null;

  entries = signal<JournalEntry[]>([]);
  selectedDate = signal<string>(new Date().toISOString().slice(0, 10));
  saving = signal(false);
  lastSaved = signal(false);

  readonly journalModel = signal<JournalFormModel>(createJournalFormDefaults());
  readonly journalForm = form(this.journalModel, (s) => {
    validate(s.content, noXss);
    maxLength(s.content, 50000, { message: 'Journal entry must be 50,000 characters or fewer' });
  });

  placeholder = 'What went well today?\nWhat could be improved?\nWhat are you grateful for?';

  todayFormatted = computed(() => {
    const d = new Date(this.selectedDate());
    return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  });

  pastEntries = computed(() => {
    return this.entries().filter(e => e.content.trim().length > 0);
  });

  async ngOnInit(): Promise<void> {
    await this.db.init();
    const all = await this.db.getJournalEntries();
    this.entries.set(all);
    // Load today's entry
    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = all.find(e => e.date === today);
    if (todayEntry) this.journalModel.set({ content: todayEntry.content });
  }

  ngOnDestroy(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
  }

  onContentChange(): void {
    this.lastSaved.set(false);
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.save(), 1000);
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
    // Save current before switching
    if (this.saveTimeout) { clearTimeout(this.saveTimeout); this.save(); }
    this.selectedDate.set(entry.date);
    this.journalModel.set({ content: entry.content });
    this.lastSaved.set(false);
  }

  formatEntryDate(date: string): string {
    const d = new Date(date);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}
