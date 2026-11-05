import { describe, expect, it, vi } from 'vitest';
import {
  insertDictation,
  insertDictationIntoField,
  normalizeDictation,
} from '../../src/app/core/utils/dictation.util';

describe('dictation insertion', () => {
  it('collapses the whitespace a recognizer leaves in a phrase', () => {
    expect(normalizeDictation('  buy   milk \n')).toBe('buy milk');
  });

  it('adds a trailing space at the end so the next phrase is separated', () => {
    const result = insertDictation('', 0, 0, 'buy milk');

    expect(result.value).toBe('buy milk ');
    expect(result.caret).toBe(9);
  });

  it('separates a phrase from the word before it', () => {
    const result = insertDictation('Call the', 8, 8, 'plumber');

    expect(result.value).toBe('Call the plumber ');
    expect(result.caret).toBe(17);
  });

  it('does not push punctuation away from the word it belongs to', () => {
    const result = insertDictation('Hello world', 5, 5, ', again');

    expect(result.value).toBe('Hello, again world');
    expect(result.caret).toBe(12);
  });

  it('replaces the selected text rather than writing around it', () => {
    const result = insertDictation('Buy milk', 4, 8, 'oat milk');

    expect(result.value).toBe('Buy oat milk ');
    expect(result.caret).toBe(13);
  });

  it('never takes a field past its advertised limit', () => {
    const result = insertDictation('12345', 5, 5, '67890', 8);

    expect(result.value).toBe('12345 67');
    expect(result.value.length).toBe(8);
  });

  it('returns the field untouched for an empty phrase', () => {
    const result = insertDictation('Buy milk', 3, 3, '   ');

    expect(result.value).toBe('Buy milk');
    expect(result.caret).toBe(3);
    expect(result.inserted).toBe('');
  });

  it('writes the field and raises input so signal forms see the words', () => {
    const input = document.createElement('input');
    input.value = 'Buy';
    input.setSelectionRange(3, 3);
    const inputEvent = vi.fn();
    input.addEventListener('input', inputEvent);

    const changed = insertDictationIntoField(input, 'milk', 20);

    expect(changed).toBe(true);
    expect(input.value).toBe('Buy milk ');
    expect(input.selectionStart).toBe(9);
    expect(inputEvent).toHaveBeenCalledOnce();
  });
});
