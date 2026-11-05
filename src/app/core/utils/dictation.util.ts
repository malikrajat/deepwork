/**
 * Turning words a browser heard into text a field can hold.
 *
 * The Web Speech API hands back phrases without any idea of where they should
 * go: a final result is just "buy milk". The field, however, has a caret, a
 * selection, a length limit and whatever the user already typed. This file is
 * the small, testable piece between the two — it decides the spacing, respects
 * the cap, and returns the new value and the caret so the caller does not have
 * to rebuild either.
 *
 * It is deliberately pure. The DOM wrapper below it is the only part that
 * touches an input, and the tests can pin the interesting half down without a
 * browser.
 */

/** What a field should look like after one phrase has been inserted. */
export interface DictationInsertion {
  /** The complete field value after the insert. */
  value: string;
  /** Where the caret belongs, as an index into `value`. */
  caret: number;
  /** The exact text that was inserted — spaces included. */
  inserted: string;
}

/** Collapse the whitespace a recognizer may put inside or around a phrase. */
export function normalizeDictation(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Characters that should not be pushed away from the word before them. */
const ATTACHED_PUNCTUATION = /^[,.;:!?…)}\]%]/;
const ENDS_WITH_PUNCTUATION = /[\s,.;:!?…%]$/;

/**
 * Inserts one spoken phrase at the caret, replacing a selection.
 *
 * Spacing is the part that makes dictation feel written rather than pasted:
 * a phrase joining a word gets a space before it, a phrase followed by more
 * typing gets one after it, and punctuation stays attached to the word it
 * belongs to. At the end of a field the trailing space is kept too, so the next
 * phrase does not run into this one.
 *
 * `maxLength` is the same cap the input advertises. A phrase that would cross it
 * is cut at the boundary rather than refused, because losing the last syllable
 * is friendlier than losing the sentence the user just spoke.
 */
export function insertDictation(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  spokenText: string,
  maxLength = Number.MAX_SAFE_INTEGER,
): DictationInsertion {
  const text = normalizeDictation(spokenText);
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));

  if (!text) return { value, caret: start, inserted: '' };

  const before = value.slice(0, start);
  const after = value.slice(end);

  const leadingSpace = before.length > 0 && !/\s$/.test(before) && !ATTACHED_PUNCTUATION.test(text);
  const trailingSpace =
    !ENDS_WITH_PUNCTUATION.test(text) && (after.length === 0 || !/^\s/.test(after));

  const spoken = `${leadingSpace ? ' ' : ''}${text}${trailingSpace ? ' ' : ''}`;
  const available = Math.max(0, maxLength - before.length - after.length);
  const inserted = spoken.slice(0, available);

  if (!inserted) return { value, caret: start, inserted: '' };

  return {
    value: `${before}${inserted}${after}`,
    caret: before.length + inserted.length,
    inserted,
  };
}

/**
 * Puts one spoken phrase into a text input or textarea.
 *
 * The value is written directly and an `input` event is raised rather than only
 * assigning `element.value`: Angular's signal forms listen for that event, so
 * the model, the character counter and the required-title rule all see what was
 * dictated exactly as they would see typing.
 *
 * Returns true when the field changed, so a caller can ignore an empty result.
 */
export function insertDictationIntoField(
  field: HTMLInputElement | HTMLTextAreaElement,
  spokenText: string,
  maxLength = Number.MAX_SAFE_INTEGER,
): boolean {
  const insertion = insertDictation(
    field.value,
    field.selectionStart ?? field.value.length,
    field.selectionEnd ?? field.value.length,
    spokenText,
    maxLength,
  );

  if (!insertion.inserted || insertion.value === field.value) return false;

  field.value = insertion.value;
  // `setSelectionRange` is available on text inputs and textareas, which are the
  // only two elements this helper is used with.
  field.setSelectionRange(insertion.caret, insertion.caret);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}
