import { Injectable, computed, signal } from '@angular/core';
import { Task, TaskQuadrant } from '../models/task.model';

/**
 * What a page already knows about the task it is about to create.
 *
 * Every caller overrides only the one thing its own control promised: a date
 * section's "+" sets the day, a Matrix quadrant's "+" sets the quadrant, and the
 * Today page's "Add task" also asks for the new task to land on today's list.
 */
export interface TaskAddPrefill {
  /** Deadline to write into the form, as `YYYY-MM-DD`. */
  deadline?: string | null;
  /** Quadrant the new task should join. */
  quadrant?: TaskQuadrant | null;
  /** Put the new task on today's list as well. */
  addToToday?: boolean;
}

/** One request to the app's task form. */
export interface TaskEditorRequest {
  /**
   * The task to edit, or null when the form is adding one.
   *
   * The task is the copy that was on screen when the control was clicked. The
   * form re-reads nothing: it opens on the values the user was looking at, and
   * saving writes them back over whatever is in the database.
   */
  task: Task | null;
  /** Deadline an added task starts on, or '' to keep the form's own default. */
  deadline: string;
  /** Quadrant an added task joins, or null to keep it unassigned. */
  quadrant: TaskQuadrant | null;
  /** Whether an added task also belongs on today's list. */
  addToToday: boolean;
  /**
   * What makes this request different from the last one.
   *
   * A request is not a boolean: opening the same task twice — Cancel, then the
   * pencil again — has to refill the form both times, and a request that only
   * set "open" would look like the state it was already in. Pages also use it to
   * tell an answer they have already read from a new one.
   */
  id: number;
}

/** A task the panel has just written, for the page that opened it. */
export interface TaskSave {
  task: Task;
  /** True when the form created the task, false when it changed one. */
  created: boolean;
  /** The request the save answered — see {@link TaskEditorRequest.id}. */
  requestId: number;
}

/**
 * The app's one task form, and how every page asks for it.
 *
 * DeepWork edits a task in exactly one place: a slide-in panel over the page the
 * user is already on. This service is that panel's state — whether it is open,
 * which task it holds, and what a new task already knows about itself — so any
 * page can open it with one call and the page underneath is never replaced.
 *
 * The alternative, and what this replaces, was a route: every Edit control
 * navigated to `/tasks?edit=<id>` and the Tasks page answered the parameter. The
 * task was editable from anywhere and the user was moved everywhere, losing the
 * scroll position, the filter and the page they were reading to correct one
 * title. A panel that lives in the shell has none of that cost.
 *
 * The form itself is `TaskEditorPanelComponent`, mounted once in `app.html`.
 * Keeping the state here rather than in the component is what lets the panel
 * outlive navigation — it is in the shell anyway — and what lets a page say
 * "open the editor on this task" without holding a reference to the component.
 */
@Injectable({ providedIn: 'root' })
export class TaskEditorService {
  private sequence = 0;

  private readonly current = signal<TaskEditorRequest | null>(null);

  /** The request the panel is answering, or null while it is closed. */
  readonly request = this.current.asReadonly();

  /** True while the panel is on screen. */
  readonly isOpen = computed(() => this.current() !== null);

  /** The task being edited, or null when the form is adding one. */
  readonly editingTask = computed(() => this.current()?.task ?? null);

  /**
   * The task the panel last wrote.
   *
   * The panel closes on save, so a page that has to react — the Tasks page opens
   * the date section the new task landed in — reads it here. It is a report and
   * not a command: pages that have nothing to do about a save ignore it.
   */
  readonly lastSave = signal<TaskSave | null>(null);

  /** Opens the form on an empty task, pre-filled with what `prefill` decided. */
  openAdd(prefill: TaskAddPrefill = {}): void {
    this.current.set({
      task: null,
      deadline: prefill.deadline ?? '',
      quadrant: prefill.quadrant ?? null,
      addToToday: Boolean(prefill.addToToday),
      id: ++this.sequence,
    });
  }

  /** Opens the form on `task`, with its values already in the fields. */
  openEdit(task: Task): void {
    this.current.set({
      task,
      deadline: '',
      quadrant: null,
      addToToday: false,
      id: ++this.sequence,
    });
  }

  /** Closes the panel. The page underneath was never told it had moved. */
  close(): void {
    this.current.set(null);
  }

  /** Told by the panel once a save has been written. */
  reportSave(task: Task, created: boolean, requestId: number): void {
    this.lastSave.set({ task, created, requestId });
  }
}
