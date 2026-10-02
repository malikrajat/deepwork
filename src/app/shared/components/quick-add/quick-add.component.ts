import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TaskService } from '../../../core/services/task.service';
import { NotificationService } from '../../../core/services/notification.service';
import { UiService } from '../../../core/services/ui.service';
import {
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
  TaskQuadrant,
} from '../../../core/models/task.model';
import { createTaskFormDefaults } from '../../models/form.models';
import { TooltipDirective } from '../../directives/tooltip.directive';

/**
 * The floating "add a task for today" button, on every page.
 *
 * One button, one way to add a task: type a title. Everything else — deadline
 * (today), priority, quadrant, repeat — is filled in with defaults and stated
 * plainly in the dialog, so nobody has to guess what gets saved.
 */
@Component({
  selector: 'app-quick-add',
  imports: [TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:keydown)': 'onKeydown($event)' },
  template: `
    @if (!ui.isMiniMode() && !ui.focusMode()) {
      <button
        class="qa-fab"
        type="button"
        (click)="openDialog()"
        appTooltip="Add a task for today"
        aria-label="Add a task for today"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    }

    @if (open()) {
      <div class="qa-backdrop" (click)="close()"></div>
      <div class="qa-dialog" role="dialog" aria-modal="true" aria-labelledby="qa-heading">
        <header class="qa-header">
          <div>
            <h2 id="qa-heading">Add a task for today</h2>
            <p class="qa-sub">Type it. Everything else is filled in for you.</p>
          </div>
          <button class="qa-close" type="button" (click)="close()" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <div class="qa-body">
          <!-- What this dialog is, what it asks for, and what it saves -->
          <section class="qa-info">
            <div class="qa-info-line">
              <span class="qa-tag">You give</span>
              <span>A <strong>title</strong> — plus a description if you want one. Nothing else is needed.</span>
            </div>
            <div class="qa-info-line">
              <span class="qa-tag">Limits</span>
              <span>Title {{ titleMax }} characters · Description {{ descriptionMax }} characters.</span>
            </div>
            <div class="qa-info-line">
              <span class="qa-tag">Saved as</span>
              <span>Priority <strong>P3 Medium</strong> · Deadline <strong>today</strong> · no quadrant · no repeat · on your <strong>Today</strong> list.</span>
            </div>
          </section>

          <!-- The preview: exactly what will be saved, and editable right here -->
          <section class="qa-preview">
            <div class="qa-preview-head">
              <h3>New task</h3>
            </div>

            <label class="qa-field">
              <span>Title <em>(required)</em>
                <span class="qa-count">{{ title().length }}/{{ titleMax }}</span>
              </span>
              <input
                #titleInput
                type="text"
                [value]="title()"
                [attr.maxlength]="titleMax"
                placeholder="What needs to be done?"
                (input)="onTitleInput($event)"
              />
            </label>

            <button class="qa-advanced-toggle" type="button" [attr.aria-expanded]="advancedOpen()" (click)="advancedOpen.set(!advancedOpen())">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" [class.open]="advancedOpen()">
                <polyline points="9,6 15,12 9,18" />
              </svg>
              Advanced options
              @if (!advancedOpen()) {
                <span class="qa-advanced-summary">{{ advancedSummary() }}</span>
              }
            </button>

            @if (advancedOpen()) {
              <div class="qa-advanced">
                <label class="qa-field">
                  <span>Description <em>(optional)</em>
                    <span class="qa-count">{{ description().length }}/{{ descriptionMax }}</span>
                  </span>
                  <textarea
                    rows="2"
                    [value]="description()"
                    [attr.maxlength]="descriptionMax"
                    placeholder="Anything worth remembering"
                    (input)="onDescriptionInput($event)"
                  ></textarea>
                </label>
                <label class="qa-field">
                  <span>Priority <em>(default P3 Medium)</em></span>
                  <select [value]="priority()" (change)="priority.set(inputValue($event))">
                    <option value="1">P1 — Critical</option>
                    <option value="2">P2 — High</option>
                    <option value="3">P3 — Medium</option>
                    <option value="4">P4 — Low</option>
                  </select>
                </label>
                <label class="qa-field">
                  <span>Deadline <em>(default today)</em></span>
                  <input type="date" [value]="deadline()" (change)="deadline.set(inputValue($event))" />
                </label>
                <label class="qa-field">
                  <span>Quadrant <em>(default none)</em></span>
                  <select [value]="quadrant()" (change)="quadrant.set(inputValue($event))">
                    <option value="">Unassigned</option>
                    <option value="urgent-important">Urgent + Important</option>
                    <option value="important">Important</option>
                    <option value="urgent">Urgent</option>
                    <option value="neither">Neither</option>
                  </select>
                </label>
                <p class="qa-note">Repeat and everything else live in <strong>Tasks → Add Task → Advanced options</strong>. A deadline on another day keeps the task off today's list.</p>
              </div>
            }
          </section>
        </div>

        <footer class="qa-footer">
          <button class="qa-btn ghost" type="button" (click)="close()">Cancel</button>
          <button class="qa-btn primary" type="button" [disabled]="!title().trim()" (click)="addTask()">
            {{ addLabel() }}
          </button>
        </footer>
      </div>
    }
  `,
  styles: [`
    /* Sits above the toast area, so a confirmation never covers the button. */
    .qa-fab {
      /* Above page content, below every panel and dialog (they start at 100),
         so an open form or modal always covers the button. */
      position: fixed; right: 24px; bottom: 104px; z-index: 80;
      display: inline-flex; align-items: center; justify-content: center;
      width: 50px; height: 50px; padding: 0;
      border-radius: 50%; border: 1px solid rgba(139,92,246,0.45);
      background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: #fff;
      cursor: pointer;
      box-shadow: 0 10px 30px rgba(124,58,237,0.35);
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    }
    .qa-fab:hover { transform: translateY(-2px); box-shadow: 0 14px 34px rgba(124,58,237,0.45); }
    .qa-fab:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
    .qa-backdrop {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(4,2,12,0.62); backdrop-filter: blur(3px);
    }
    .qa-dialog {
      position: fixed; z-index: 1001; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: min(620px, 94vw); max-height: 88vh;
      display: flex; flex-direction: column;
      background: var(--surface-float); border: 1px solid rgba(139,92,246,0.32);
      border-radius: 18px; box-shadow: 0 30px 80px rgba(0,0,0,0.55);
      overflow: hidden;
    }
    .qa-header {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
      padding: 18px 20px 14px; border-bottom: 1px solid rgba(139,92,246,0.16);
    }
    .qa-header h2 { font-size: 16px; font-weight: 700; }
    .qa-sub { font-size: 12px; color: var(--color-text-muted); margin-top: 3px; }
    .qa-close {
      width: 30px; height: 30px; border-radius: 8px; border: none; background: transparent;
      color: var(--color-text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .qa-close:hover { background: rgba(139,92,246,0.12); color: var(--color-text-primary); }

    .qa-body { padding: 16px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
    .qa-body::-webkit-scrollbar { width: 4px; }
    .qa-body::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.25); border-radius: 4px; }

    .qa-info {
      display: flex; flex-direction: column; gap: 7px;
      padding: 12px 14px; border-radius: 12px;
      background: rgba(139,92,246,0.08); border: 1px solid rgba(139,92,246,0.18);
    }
    .qa-info-line { display: flex; gap: 10px; font-size: 12px; line-height: 1.45; color: var(--color-text-secondary); }
    .qa-info-line strong { color: var(--color-text-primary); }
    .qa-tag {
      flex-shrink: 0; width: 68px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
      text-transform: uppercase; color: var(--timer-work-color); padding-top: 2px;
    }

    .qa-preview { display: flex; flex-direction: column; gap: 10px; }
    .qa-preview-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .qa-preview-head h3 { font-size: 13px; font-weight: 700; }

    .qa-field { display: flex; flex-direction: column; gap: 5px; }
    .qa-field > span {
      display: flex; align-items: center; gap: 6px;
      font-size: 11px; font-weight: 600; color: var(--color-text-muted);
    }
    .qa-field em { font-style: normal; font-weight: 400; opacity: 0.8; }
    .qa-count { margin-left: auto; font-size: 10px; font-variant-numeric: tabular-nums; }
    .qa-field input, .qa-field textarea, .qa-field select {
      background: var(--control-bg); border: 1px solid rgba(139,92,246,0.16);
      border-radius: 10px; padding: 9px 12px; color: var(--color-text-primary);
      font: inherit; font-size: 13px; outline: none; resize: vertical;
    }
    .qa-field input:focus, .qa-field textarea:focus, .qa-field select:focus { border-color: rgba(139,92,246,0.5); }
    .qa-field select option { background: var(--color-bg-secondary); }

    .qa-advanced-toggle {
      display: flex; align-items: center; gap: 7px; align-self: flex-start;
      border: none; background: transparent; color: var(--color-text-secondary);
      font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; padding: 2px 0;
    }
    .qa-advanced-toggle:hover { color: var(--color-text-primary); }
    .qa-advanced-toggle svg { transition: transform 0.2s ease; }
    .qa-advanced-toggle svg.open { transform: rotate(90deg); }
    .qa-advanced-summary { font-weight: 400; color: var(--color-text-muted); }
    .qa-advanced { display: flex; flex-direction: column; gap: 12px; width: 100%; }
    .qa-note { font-size: 11px; color: var(--color-text-muted); }
    .qa-note strong { color: var(--color-text-secondary); }

    .qa-footer {
      display: flex; justify-content: flex-end; gap: 10px;
      padding: 14px 20px; border-top: 1px solid rgba(139,92,246,0.16);
    }
    .qa-btn { padding: 9px 18px; border-radius: 10px; border: none; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .qa-btn.ghost { background: transparent; color: var(--color-text-muted); }
    .qa-btn.ghost:hover { color: var(--color-text-primary); }
    .qa-btn.primary { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: #fff; }
    .qa-btn.primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(139,92,246,0.34); }
    .qa-btn.primary:disabled { opacity: 0.45; cursor: not-allowed; }
  `],
})
export class QuickAddComponent {
  private readonly tasks = inject(TaskService);
  private readonly notifications = inject(NotificationService);
  readonly ui = inject(UiService);

  readonly titleMax = TASK_TITLE_MAX_LENGTH;
  readonly descriptionMax = TASK_DESCRIPTION_MAX_LENGTH;

  readonly open = signal(false);
  readonly advancedOpen = signal(false);

  // The task being added — the two fields the user can correct before saving.
  readonly title = signal('');
  readonly description = signal('');
  readonly priority = signal('3');
  readonly deadline = signal(createTaskFormDefaults().deadline);
  readonly quadrant = signal('');

  /** The button promises today's list — unless the user moved the deadline. */
  readonly addLabel = computed(() =>
    !this.deadline() || this.deadline() === createTaskFormDefaults().deadline ? 'Add to Today' : 'Add task'
  );

  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  constructor() {
    // The title is the only thing that is always asked for, so it takes focus.
    effect(() => {
      if (!this.open()) return;
      this.titleInput()?.nativeElement.focus();
    });
  }

  // ── Dialog ────────────────────────────────────────────────────────────────

  /**
   * `Ctrl+N` opens the quick add from any page. In a browser the browser takes
   * that key for a new window, but the desktop app does not.
   */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      this.close();
      return;
    }
    if (!event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.key.toLowerCase() !== 'n') return;
    event.preventDefault();
    // Pressing it again should not wipe a half-typed task.
    if (this.open()) this.titleInput()?.nativeElement.focus();
    else this.openDialog();
  }

  openDialog(): void {
    this.reset();
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
  }

  private reset(): void {
    this.advancedOpen.set(false);
    this.title.set('');
    this.description.set('');
    this.priority.set('3');
    this.deadline.set(createTaskFormDefaults().deadline);
    this.quadrant.set('');
  }

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  onTitleInput(event: Event): void {
    this.title.set(this.inputValue(event));
  }

  onDescriptionInput(event: Event): void {
    this.description.set((event.target as HTMLTextAreaElement).value);
  }

  /** One line telling the user what the hidden defaults will be. */
  advancedSummary(): string {
    const priorityLabel = { '1': 'P1 Critical', '2': 'P2 High', '3': 'P3 Medium', '4': 'P4 Low' }[this.priority()] ?? 'P3 Medium';
    const due = this.deadline() ? this.deadlineLabel(this.deadline()) : 'no deadline';
    const quadrant = this.quadrant() ? 'in a quadrant' : 'no quadrant';
    return `${priorityLabel} · ${due} · ${quadrant} · no repeat`;
  }

  private deadlineLabel(iso: string): string {
    const today = createTaskFormDefaults().deadline;
    if (iso === today) return 'due today';
    return `due ${new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  }

  // ── Saving ────────────────────────────────────────────────────────────────

  async addTask(): Promise<void> {
    const title = this.title().trim();
    if (!title) return;

    const deadline = this.deadline();
    const created = await this.tasks.createTask({
      title,
      description: this.description().trim(),
      priority: Number(this.priority()) as 1 | 2 | 3 | 4,
      quadrant: (this.quadrant() || null) as TaskQuadrant | null,
      deadline: deadline || null,
      recurrence: null,
      todayOrder: null,
    });

    // “For today” is the point of this dialog, so the task lands on the Today
    // list — including when the user cleared the deadline in the advanced
    // fields. A deadline the user moved to another day is left alone.
    const today = createTaskFormDefaults().deadline;
    if (!deadline || deadline === today) await this.tasks.addToToday(created.id);

    this.notifications.showToastMessage('Task added to Today', created.title, 'work');
    this.close();
  }
}
