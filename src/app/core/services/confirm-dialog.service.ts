import { Injectable, signal } from '@angular/core';

/** The way a confirmation's primary answer is drawn. */
export type ConfirmDialogTone = 'default' | 'danger';

/** The picture above the question. */
export type ConfirmDialogIcon = 'question' | 'focus' | 'warning';

/** What one question needs to be asked. */
export interface ConfirmDialogOptions {
  /** The question itself, kept to one line. */
  title: string;
  /** What answering **yes** will do, in the user's own terms. */
  message: string;
  /** The primary button's label. Defaults to **Confirm**. */
  confirmLabel?: string;
  /** The way out's label. Defaults to **Cancel**. */
  cancelLabel?: string;
  /** `danger` paints the primary answer red and shows the warning icon. */
  tone?: ConfirmDialogTone;
  /** Overrides the icon the tone would choose. */
  icon?: ConfirmDialogIcon;
}

/** One question that has been asked and is waiting for its answer. */
interface ConfirmDialogRequest extends Required<ConfirmDialogOptions> {
  resolve: (confirmed: boolean) => void;
}

/**
 * The app's own replacement for `window.confirm`.
 *
 * A native confirmation is drawn by the browser or the desktop shell, not by
 * DeepWork: its title is the host's ("tauri.localhost says"), its buttons are
 * the platform's **OK** and **Cancel**, and neither follows the app's theme.
 * Every question the app asks has to look like it came from the app, so it goes
 * through this service and is drawn by `ConfirmDialogComponent` in the shell.
 *
 * The API is a promise because a question is asynchronous by nature: the caller
 * awaits the answer, and the page behind the dialog is left exactly as it was
 * while the user decides.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly current = signal<ConfirmDialogRequest | null>(null);

  /** The open question, or null when nothing is being asked. */
  readonly request = this.current.asReadonly();

  /**
   * Asks a question and resolves with the user's answer.
   *
   * A second question replaces a first one that is still open. The replaced
   * promise resolves `false` rather than hanging forever: its caller's action
   * was not confirmed, so it must not run.
   */
  confirm(options: ConfirmDialogOptions): Promise<boolean> {
    this.current()?.resolve(false);

    return new Promise<boolean>((resolve) => {
      this.current.set({
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Confirm',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        tone: options.tone ?? 'default',
        icon: options.icon ?? (options.tone === 'danger' ? 'warning' : 'question'),
        resolve,
      });
    });
  }

  /**
   * Answers the open question and takes it down.
   *
   * Safe to call when nothing is open, which is what lets Escape, the backdrop
   * and both buttons share one path.
   */
  answer(confirmed: boolean): void {
    const request = this.current();
    if (!request) return;
    this.current.set(null);
    request.resolve(confirmed);
  }
}
