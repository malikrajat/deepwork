import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { FieldState } from '@angular/forms/signals';

/**
 * Reusable form field wrapper that handles:
 * - Label display
 * - Error messages (only shown when touched)
 * - Consistent styling across the app
 * - Accessibility (aria attributes)
 *
 * Usage:
 * <app-form-field label="Email" [fieldState]="myForm.email()">
 *   <input type="email" [formField]="myForm.email" />
 * </app-form-field>
 */
@Component({
  selector: 'app-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="form-field-wrapper" [class.has-error]="showError()" [class.is-hidden]="fieldState()?.hidden()">
      @if (label()) {
        <label class="field-label">{{ label() }}</label>
      }
      <div class="field-input">
        <ng-content />
      </div>
      @if (showError()) {
        <div class="field-errors" role="alert" aria-live="polite">
          @for (error of fieldState()!.errors(); track error.kind) {
            <span class="error-message">{{ error.message ?? error.kind }}</span>
          }
        </div>
      }
      @if (hint()) {
        <span class="field-hint">{{ hint() }}</span>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .form-field-wrapper { display: flex; flex-direction: column; gap: 4px; }
    .form-field-wrapper.is-hidden { display: none; }
    .field-label {
      font-size: 0.72rem; font-weight: 600; color: var(--color-text-muted);
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .field-input { display: flex; flex-direction: column; }
    .field-errors { display: flex; flex-direction: column; gap: 2px; }
    .error-message {
      font-size: 0.7rem; color: #f87171; font-weight: 500;
      animation: shake 0.3s ease-in-out;
    }
    .field-hint { font-size: 0.65rem; color: var(--color-text-muted); }
    .has-error :ng-deep input,
    .has-error :ng-deep textarea,
    .has-error :ng-deep select {
      border-color: rgba(248, 113, 113, 0.5) !important;
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-2px); }
      75% { transform: translateX(2px); }
    }
  `]
})
export class FormFieldWrapperComponent {
  readonly label = input<string>('');
  readonly hint = input<string>('');
  readonly fieldState = input<FieldState<unknown> | null>(null);

  showError(): boolean {
    const state = this.fieldState();
    if (!state) return false;
    return state.touched() && state.errors().length > 0;
  }
}
