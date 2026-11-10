import { describe, it, expect } from 'vitest';
import { ConfirmDialogService } from '../../src/app/core/services/confirm-dialog.service';

/**
 * The confirmation service is the app's own `confirm()`.
 *
 * Its contract is small and entirely about the answer: the caller waits on a
 * promise, the components draws whatever is in `request`, and exactly one
 * answer releases that promise. These tests are what keeps a replaced or
 * cancelled question from leaving the caller's action hanging.
 */
describe('ConfirmDialogService', () => {
  it('exposes the question with the app’s default answers', () => {
    const dialog = new ConfirmDialogService();

    void dialog.confirm({ title: 'Switch focus session?', message: 'A block is running.' });

    expect(dialog.request()).toMatchObject({
      title: 'Switch focus session?',
      message: 'A block is running.',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      tone: 'default',
      icon: 'question',
    });
  });

  it('uses the warning icon for a danger question', () => {
    const dialog = new ConfirmDialogService();

    void dialog.confirm({ title: 'Delete?', message: 'It cannot be undone.', tone: 'danger' });

    expect(dialog.request()?.tone).toBe('danger');
    expect(dialog.request()?.icon).toBe('warning');
  });

  it('resolves true when the primary answer is chosen', async () => {
    const dialog = new ConfirmDialogService();
    const answer = dialog.confirm({ title: 'Go?', message: 'Now?' });

    dialog.answer(true);

    await expect(answer).resolves.toBe(true);
    expect(dialog.request()).toBeNull();
  });

  it('resolves false when the question is declined', async () => {
    const dialog = new ConfirmDialogService();
    const answer = dialog.confirm({ title: 'Go?', message: 'Now?' });

    dialog.answer(false);

    await expect(answer).resolves.toBe(false);
    expect(dialog.request()).toBeNull();
  });

  it('releases a replaced question as false instead of leaving it pending', async () => {
    const dialog = new ConfirmDialogService();
    const first = dialog.confirm({ title: 'First?', message: 'One' });
    const second = dialog.confirm({ title: 'Second?', message: 'Two' });

    await expect(first).resolves.toBe(false);
    expect(dialog.request()?.title).toBe('Second?');

    dialog.answer(true);
    await expect(second).resolves.toBe(true);
  });

  it('ignores an answer when nothing is being asked', () => {
    const dialog = new ConfirmDialogService();

    expect(() => dialog.answer(true)).not.toThrow();
    expect(dialog.request()).toBeNull();
  });
});
