import { describe, it, expect, beforeEach } from 'vitest';
import { UiService } from '../../src/app/core/services/ui.service';

describe('UiService (behavior)', () => {
  let svc: UiService;

  beforeEach(() => {
    svc = new UiService();
  });

  it('defaults to focusMode false and toggles correctly', () => {
    expect(svc.focusMode()).toBe(false);
    svc.toggleFocusMode();
    expect(svc.focusMode()).toBe(true);
    svc.toggleFocusMode();
    expect(svc.focusMode()).toBe(false);
  });

  it('enterFocusMode and exitFocusMode set state explicitly', () => {
    svc.enterFocusMode();
    expect(svc.focusMode()).toBe(true);
    svc.exitFocusMode();
    expect(svc.focusMode()).toBe(false);
  });
});
