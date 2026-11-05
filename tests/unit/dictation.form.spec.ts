import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField, form } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';
import { insertDictationIntoField } from '../../src/app/core/utils/dictation.util';

/**
 * The contract that makes dictation work in the app's actual forms: a phrase
 * written into the element and an `input` event raised is exactly what Signal
 * Forms listens for, so the model and every validation rule see the words.
 */
@Component({
  imports: [FormField],
  template: `<input [formField]="taskForm.title" />`,
})
class DictationFormHost {
  readonly model = signal({ title: '' });
  readonly taskForm = form(this.model);
}

describe('dictation in a Signal Form', () => {
  it('updates the form model from the words written into the input', () => {
    const fixture = TestBed.createComponent(DictationFormHost);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.setSelectionRange(0, 0);

    insertDictationIntoField(input, 'buy milk');

    expect(host.model().title).toBe('buy milk ');
    expect(input.value).toBe('buy milk ');
  });
});
