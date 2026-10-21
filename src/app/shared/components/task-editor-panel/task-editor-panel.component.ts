import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { form, FormField, required, validate, maxLength, submit } from '@angular/forms/signals';
import { TaskService } from '../../../core/services/task.service';
import { TaskEditorRequest, TaskEditorService } from '../../../core/services/task-editor.service';
import {
  RecurrenceConfig,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
  Task,
  TaskQuadrant,
} from '../../../core/models/task.model';
import { QUADRANT_CONFIG } from '../../../core/constants/theme.constants';
import { TaskFormModel, createTaskFormDefaults } from '../../models/form.models';
import { futureDate, noXss, trimmedRequired } from '../../validators/form-validators';
import { FormFieldWrapperComponent } from '../form-field/form-field-wrapper.component';

/** Readable names for the priority options, used in the defaults summary. */
const PRIORITY_LABELS: Record<string, string> = {
  '1': 'P1 Critical',
  '2': 'P2 High',
  '3': 'P3 Medium',
  '4': 'P4 Low',
};

/**
 * The app's one task form: the slide-in panel that opens over the page you are
 * already on.
 *
 * It is mounted once, in the app shell, rather than in the Tasks page. That is
 * the whole difference from the way this used to work: every Edit control in the
 * app links here through {@link TaskEditorService}, the panel opens over whatever
 * page the user was reading, and the page — its route, its scroll position, its
 * filter — is never touched. Saving closes the panel and leaves the user exactly
 * where they started, one correction richer.
 *
 * The form is deliberately the same one the Tasks page always had: a title is
 * the only required field, everything else lives behind "Advanced options", and
 * what those folded-away fields will be is stated plainly above them.
 */
@Component({
  selector: 'app-task-editor-panel',
  imports: [FormField, FormFieldWrapperComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (editor.isOpen()) {
      <div class="panel-backdrop" (click)="close()"></div>
      <div
        class="slide-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-editor-heading"
      >
        <div class="panel-header">
          <h2 id="task-editor-heading">{{ editor.editingTask() ? 'Edit Task' : 'New Task' }}</h2>
          <button class="icon-btn" type="button" (click)="close()" aria-label="Close">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <form class="panel-form" (submit)="submitForm($event)">
          <app-form-field label="Title" [fieldState]="taskForm.title()" [hint]="titleHint()">
            <input
              #taskTitleInput
              type="text"
              [formField]="taskForm.title"
              placeholder="What needs to be done?"
            />
          </app-form-field>

          <!-- A title is enough: state plainly what the hidden fields will be -->
          <p class="defaults-note">
            Only a title is needed. It is saved with <strong>{{ advancedSummary() }}</strong
            >.
            <span
              >Title up to {{ titleMax }} characters · description up to
              {{ descriptionMax }} characters.</span
            >
          </p>

          <button
            class="advanced-toggle"
            type="button"
            [attr.aria-expanded]="advancedOpen()"
            (click)="advancedOpen.set(!advancedOpen())"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              [class.open]="advancedOpen()"
            >
              <polyline points="9,6 15,12 9,18" />
            </svg>
            {{ advancedOpen() ? 'Hide advanced options' : 'Advanced options' }}
          </button>

          @if (advancedOpen()) {
            <div class="advanced-fields">
              <app-form-field
                label="Description"
                [fieldState]="taskForm.description()"
                [hint]="descriptionHint()"
              >
                <textarea
                  [formField]="taskForm.description"
                  rows="3"
                  placeholder="Optional details..."
                ></textarea>
              </app-form-field>
              <div class="form-row">
                <app-form-field label="Priority" [fieldState]="taskForm.priority()">
                  <select [formField]="taskForm.priority">
                    <option value="1">P1 — Critical</option>
                    <option value="2">P2 — High</option>
                    <option value="3">P3 — Medium</option>
                    <option value="4">P4 — Low</option>
                  </select>
                </app-form-field>
                <app-form-field label="Quadrant" [fieldState]="taskForm.quadrant()">
                  <select [formField]="taskForm.quadrant">
                    <option value="">Unassigned</option>
                    <option value="urgent-important">Urgent + Important</option>
                    <option value="important">Important</option>
                    <option value="urgent">Urgent</option>
                    <option value="neither">Neither</option>
                  </select>
                </app-form-field>
              </div>
              <app-form-field
                label="Deadline"
                [fieldState]="taskForm.deadline()"
                hint="Starts on today — move it to any later day, or clear it for no deadline"
              >
                <input type="date" [formField]="taskForm.deadline" />
              </app-form-field>
              <!-- Recurrence config -->
              <app-form-field label="Repeat" [fieldState]="taskForm.recurFrequency()">
                <select [formField]="taskForm.recurFrequency">
                  <option value="">No repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </app-form-field>
              @if (taskFormModel().recurFrequency) {
                <div class="recurrence-options">
                  @if (taskFormModel().recurFrequency === 'weekly') {
                    <div class="form-group">
                      <label>Days</label>
                      <div class="day-picker">
                        @for (d of weekDays; track d.value) {
                          <button
                            type="button"
                            class="day-btn"
                            [class.active]="formRecurDays.includes(d.value)"
                            (click)="toggleDay(d.value)"
                          >
                            {{ d.label }}
                          </button>
                        }
                      </div>
                    </div>
                  }
                  <app-form-field
                    label="End date (optional)"
                    [fieldState]="taskForm.recurEndDate()"
                  >
                    <input type="date" [formField]="taskForm.recurEndDate" />
                  </app-form-field>
                </div>
              }
            </div>
          }
          <div class="form-actions">
            <button type="button" class="btn btn-ghost" (click)="close()">Cancel</button>
            <button type="submit" class="btn btn-primary" [disabled]="taskForm().invalid()">
              {{ editor.editingTask() ? 'Save Changes' : 'Create Task' }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
  styles: [
    `
      /* Slide Panel. Fixed to the window and drawn above the page the user is
         on: opening the form must not move, replace or unmount that page.

         The pair sits above the install banner (120) — a dialog whose close
         button is behind an offer is a dialog with no way out — and below the
         app's own dialogs (190 and up), so the quiet panel, the first-run
         questions and Quick Add still open over this one. */
      .panel-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 130;
        backdrop-filter: blur(2px);
      }
      .slide-panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 420px;
        max-width: 90vw;
        background: var(--color-bg-secondary);
        border-left: 1px solid rgba(139, 92, 246, 0.15);
        z-index: 131;
        display: flex;
        flex-direction: column;
        padding: 24px;
        animation: slide-in 0.2s ease-out;
        /* Editing opens every field, and the full form is taller than a short
           window. The panel is exactly one window tall, so nothing may spill out
           of it: the fields scroll inside instead (see .panel-form). */
        overflow: hidden;
      }
      @keyframes slide-in {
        from {
          transform: translateX(100%);
        }
        to {
          transform: translateX(0);
        }
      }
      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 24px;
      }
      .panel-header h2 {
        font-size: 18px;
        font-weight: 700;
      }
      .panel-form {
        display: flex;
        flex-direction: column;
        gap: 18px;
        flex: 1;
        /* A flex child refuses to shrink below its content unless this is set, and
           without it the form grew past the bottom of the window and took the
           Cancel / Create Task buttons with it — out of reach at 720px tall,
           which is exactly the height the edit panel is tallest at. */
        min-height: 0;
        overflow-y: auto;
        scrollbar-width: thin;
      }
      .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .form-group label {
        font-size: 12px;
        font-weight: 600;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .form-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        margin-top: auto;
        padding-top: 16px;
        /* Pinned to the bottom of the scrolling form: the two buttons that finish
           it stay on screen while the fields above them scroll. */
        position: sticky;
        bottom: 0;
        background: var(--color-bg-secondary);
        border-top: 1px solid rgba(139, 92, 246, 0.12);
      }

      .btn {
        padding: 8px 18px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
      }
      .btn-primary {
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        color: white;
      }
      .btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(139, 92, 246, 0.3);
      }
      .btn-primary:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
      }
      .btn-ghost {
        background: transparent;
        color: var(--color-text-muted);
      }
      .btn-ghost:hover {
        color: var(--color-text-primary);
      }
      .icon-btn {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        border: none;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-muted);
        cursor: pointer;
        transition: all 0.2s;
      }
      .icon-btn:hover {
        background: rgba(139, 92, 246, 0.1);
        color: var(--timer-work-color);
      }
      .recurrence-options {
        padding: 8px 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .defaults-note {
        margin: -6px 0 0;
        padding: 9px 12px;
        border-radius: 10px;
        font-size: 12px;
        line-height: 1.5;
        color: var(--color-text-muted);
        background: rgba(139, 92, 246, 0.07);
        border: 1px solid rgba(139, 92, 246, 0.16);
      }
      .defaults-note strong {
        color: var(--color-text-secondary);
      }
      .defaults-note span {
        display: block;
        margin-top: 3px;
        opacity: 0.85;
      }
      .advanced-toggle {
        display: flex;
        align-items: center;
        gap: 7px;
        align-self: flex-start;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--color-text-secondary);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .advanced-toggle:hover {
        color: var(--color-text-primary);
      }
      .advanced-toggle svg {
        transition: transform 0.2s ease;
        color: var(--color-text-muted);
      }
      .advanced-toggle svg.open {
        transform: rotate(90deg);
      }
      .advanced-fields {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .day-picker {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }
      .day-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 1px solid rgba(139, 92, 246, 0.3);
        background: transparent;
        color: var(--color-text-muted);
        cursor: pointer;
        font-size: 11px;
        transition: all 0.2s;
      }
      .day-btn.active {
        background: rgba(139, 92, 246, 0.3);
        border-color: rgba(139, 92, 246, 0.7);
        color: var(--color-text-primary);
      }
      .day-btn:hover {
        border-color: rgba(139, 92, 246, 0.6);
      }
      /* The panel is the app's widest single surface — 420px of form beside a
         window — and on a phone it is a 90vw sheet with 24px of its own
         padding, which at 320px leaves the fields a little over 200px. The
         priority/quadrant row is the one pair that assumes the desktop width:
         side by side, two selects and their gap want more than that. */
      @media (max-width: 640px) {
        .form-row {
          grid-template-columns: minmax(0, 1fr);
        }
        /* A select is as wide as its longest option unless it is told it may be
           narrower, and a grid or flex track will not shrink past it — so the
           fields are given permission to be the width of the panel instead of
           the width of their own text. */
        .panel-form input,
        .panel-form select,
        .panel-form textarea {
          min-width: 0;
          max-width: 100%;
        }
        .icon-btn {
          width: 44px;
          height: 44px;
        }
        .day-btn {
          width: 44px;
          height: 44px;
        }
        /* "Advanced options" is a bare text button — its own height is about
           one line of 12px type — so it is padded out to a thumb here. */
        .advanced-toggle {
          min-height: 44px;
        }
      }

      /* The ladder in styles.css takes body type up a step past 2560px, and the
         panel's heading is a heading: it climbs with the rest of them. */
      @media (min-width: 2560px) {
        .panel-header h2 {
          font-size: var(--text-2xl);
        }
        /* Editing opens priority and quadrant side by side, and the ladder takes
           both selects to 18px. 'Urgent + Important' is then wider than half of
           the drawer's 372px of form, and a grid track never shrinks below its
           own content — so the drawer widens to hold the pair, and the two
           tracks are allowed to be narrower than the words inside them. */
        .slide-panel {
          width: 560px;
        }
        .form-row {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class TaskEditorPanelComponent {
  private readonly tasks = inject(TaskService);
  readonly editor = inject(TaskEditorService);

  readonly titleMax = TASK_TITLE_MAX_LENGTH;
  readonly descriptionMax = TASK_DESCRIPTION_MAX_LENGTH;

  /** The rest of the form, folded away behind "Advanced options". */
  readonly advancedOpen = signal(false);

  // Task add/edit form with validation schema
  readonly taskFormModel = signal<TaskFormModel>(createTaskFormDefaults());
  readonly taskForm = form(this.taskFormModel, (s) => {
    // Title is required and must be safe
    required(s.title, { message: 'Task title is required' });
    validate(s.title, trimmedRequired);
    validate(s.title, noXss);
    maxLength(s.title, TASK_TITLE_MAX_LENGTH, {
      message: `Title must be ${TASK_TITLE_MAX_LENGTH} characters or fewer`,
    });

    // Description security
    validate(s.description, noXss);
    maxLength(s.description, TASK_DESCRIPTION_MAX_LENGTH, {
      message: `Description must be ${TASK_DESCRIPTION_MAX_LENGTH} characters or fewer`,
    });

    // Priority is required
    required(s.priority, { message: 'Priority is required' });

    // Deadline must be future if set
    validate(s.deadline, futureDate);
  });
  formRecurDays: number[] = [];

  /**
   * Shared task limits. `maxLength()` on the form schema also writes the native
   * `maxlength` attribute, so the input stops at the cap while typing; these
   * hints just make the cap visible.
   */
  readonly titleHint = computed(
    () => `${this.taskFormModel().title.trim().length}/${TASK_TITLE_MAX_LENGTH} characters`,
  );
  readonly descriptionHint = computed(
    () =>
      `${this.taskFormModel().description.trim().length}/${TASK_DESCRIPTION_MAX_LENGTH} characters`,
  );

  /**
   * What the folded-away fields will be, in plain words — so the Add form can be
   * a single title field without anyone having to guess what gets saved.
   */
  readonly advancedSummary = computed(() => {
    const model = this.taskFormModel();
    const priority = PRIORITY_LABELS[model.priority] ?? 'P3 Medium';
    const today = createTaskFormDefaults().deadline;
    const due = !model.deadline
      ? 'no deadline'
      : model.deadline === today
        ? 'due today'
        : `due ${new Date(`${model.deadline}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
    const quadrant = model.quadrant
      ? QUADRANT_CONFIG[model.quadrant as TaskQuadrant].label
      : 'no quadrant';
    const repeat = model.recurFrequency ? `repeats ${model.recurFrequency}` : 'no repeat';
    return `${priority} · ${due} · ${quadrant} · ${repeat}`;
  });

  readonly weekDays = [
    { label: 'Sun', value: 0 },
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
  ];

  /** The panel's title field — focused as soon as the panel opens. */
  private readonly taskTitleInput = viewChild<ElementRef<HTMLInputElement>>('taskTitleInput');

  constructor() {
    // Every request fills the form, so one panel can answer all of them: `Cancel`
    // and the pencil again reopens the same task, and the add form is back to
    // its defaults after a task was saved. `reset` also clears touched/dirty on
    // the whole field tree, so a previously submitted form cannot reopen with
    // its validation messages already shown.
    effect(() => {
      const request = this.editor.request();
      if (!request) return;
      untracked(() => this.fillForm(request));
    });

    // `autofocus` does nothing for markup the browser first sees when the panel
    // is opened, so the title is focused here — the same way the quick-add
    // dialog does it. Adding a task asks for a title, so that is where the
    // cursor belongs; editing starts there too.
    effect(() => {
      if (!this.editor.isOpen()) return;
      this.taskTitleInput()?.nativeElement.focus();
    });
  }

  /** Puts a request's values on screen — the task's own, or a new task's pre-fill. */
  private fillForm(request: TaskEditorRequest): void {
    const task = request.task;

    if (task) {
      this.taskForm().reset({
        title: task.title,
        description: task.description,
        priority: String(task.priority),
        quadrant: task.quadrant ?? '',
        deadline: task.deadline ?? '',
        recurFrequency: task.recurrence?.frequency ?? '',
        recurEndDate: task.recurrence?.endDate ?? '',
      });
      this.formRecurDays = task.recurrence?.days ? [...task.recurrence.days] : [];
      // Editing shows the whole form: the values are the point of the edit.
      this.advancedOpen.set(true);
      return;
    }

    const defaults = createTaskFormDefaults();
    // An empty pre-fill is not a choice — it is a control that had no date to
    // promise — so the deadline falls back to today rather than to "no
    // deadline".
    this.taskForm().reset({
      ...defaults,
      deadline: request.deadline || defaults.deadline,
      quadrant: request.quadrant ?? '',
    });
    this.formRecurDays = [];
    // Adding a task asks for a title; a pre-filled day or quadrant is one of the
    // values the user came here to set, so the fields holding it are shown.
    const decided = Boolean(request.deadline) || Boolean(request.quadrant) || request.addToToday;
    this.advancedOpen.set(decided);
  }

  close(): void {
    this.editor.close();
  }

  submitForm(event: Event): void {
    event.preventDefault();
    // The request is read before the save so the form that is being written is
    // the one that was asked for, even if the panel is closed mid-save.
    const request = this.editor.request();
    if (!request) return;

    submit(this.taskForm, async () => {
      const formData = this.taskFormModel();
      const recurrence: RecurrenceConfig | null = formData.recurFrequency
        ? {
            frequency: formData.recurFrequency as 'daily' | 'weekly' | 'monthly',
            interval: 1,
            days: this.formRecurDays.length > 0 ? this.formRecurDays : undefined,
            endDate: formData.recurEndDate || undefined,
          }
        : null;
      const existing = request.task;

      if (existing) {
        const updated: Task = {
          ...existing,
          title: formData.title.trim(),
          description: formData.description.trim(),
          priority: Number(formData.priority) as 1 | 2 | 3 | 4,
          quadrant: (formData.quadrant || null) as TaskQuadrant | null,
          deadline: formData.deadline || null,
          recurrence,
        };
        await this.tasks.updateTask(updated);
        this.editor.reportSave(updated, false, request.id);
      } else {
        const created = await this.tasks.createTask({
          title: formData.title.trim(),
          description: formData.description.trim(),
          priority: Number(formData.priority) as 1 | 2 | 3 | 4,
          quadrant: (formData.quadrant || null) as TaskQuadrant | null,
          deadline: formData.deadline || null,
          recurrence,
        });
        // A form opened by the Today page's button promised today's list, not
        // only today's date: a task dated today is on the list anyway, but one
        // whose date the user moved is not — and the button that opened the form
        // said it would be.
        if (request.addToToday) await this.tasks.addToToday(created.id);
        this.editor.reportSave(created, true, request.id);
      }

      // Saving is the end of the request. The page underneath was never left, so
      // closing the panel is all that is needed to be back where the user was.
      this.editor.close();
    });
  }

  toggleDay(day: number): void {
    const idx = this.formRecurDays.indexOf(day);
    if (idx >= 0) {
      this.formRecurDays.splice(idx, 1);
    } else {
      this.formRecurDays.push(day);
    }
  }
}
