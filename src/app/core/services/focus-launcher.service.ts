import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Task } from '../models/task.model';
import { saveFocusedTaskId } from '../utils/focus-task.util';
import { TaskService } from './task.service';
import { TimerService } from './timer.service';

/**
 * The one start-focus action every task listing uses.
 *
 * A task read on Today, the Tasks board, the Matrix or the Calendar is a task
 * the user may want to begin immediately. Those pages do not own a timer, and
 * they should not each invent the hand-over: this service selects the task,
 * starts the clock on it and walks to the dashboard, where the task appears in
 * the picker under the clock with the session already running.
 *
 * The button is only offered for the quadrant the day is working through — see
 * `TaskService.focusQuadrant` — so starting work from any surface follows the
 * same Do First → Schedule → Delegate → Eliminate order.
 *
 * Starting is not silent when a session is already running: the running block
 * would be interrupted, so the user is asked first. Cancelling leaves the clock,
 * the task selection and the page exactly as they were.
 */
@Injectable({ providedIn: 'root' })
export class FocusLauncherService {
  private readonly router = inject(Router);
  private readonly timer = inject(TimerService);
  private readonly tasks = inject(TaskService);

  /** Whether this task is the kind of work the start control belongs on. */
  canStart(task: Task): boolean {
    return task.status !== 'done' && task.quadrant === this.tasks.focusQuadrant();
  }

  /**
   * Selects `task`, starts a fresh focus block on it and opens the dashboard.
   *
   * Returns whether the session was started — false when the task is outside the
   * active quadrant, or when the user cancelled the interruption prompt.
   */
  async start(task: Task): Promise<boolean> {
    if (!this.canStart(task)) return false;

    // The timer only learns about a session from the dashboard today, so make
    // sure it has read its saved state before asking whether a block is running.
    // It is idempotent, and the dashboard's own `init()` becomes a no-op.
    await this.timer.init();

    if (this.timer.isRunning()) {
      const runningTaskId = this.timer.currentTaskId();
      const runningTask = runningTaskId
        ? this.tasks.tasks().find((candidate) => candidate.id === runningTaskId)
        : null;
      const runningLabel = runningTask ? `"${runningTask.title}"` : 'another session';
      const type = this.timer.timerType() === 'work' ? 'focus session' : 'break';
      const message =
        `A ${type} is already running (${runningLabel}). ` +
        `Stop it and start a new focus session on "${task.title}"?`;
      if (typeof window !== 'undefined' && !window.confirm(message)) return false;
    }

    saveFocusedTaskId(task.id);
    this.timer.startFocusOnTask(task.id, task.title);
    await this.router.navigate(['/dashboard']);
    return true;
  }
}
