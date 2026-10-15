import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { TimelineBarComponent } from '../../src/app/shared/components/timeline-bar/timeline-bar.component';
import { TaskService } from '../../src/app/core/services/task.service';
import { TimerService } from '../../src/app/core/services/timer.service';

/**
 * What a focus session's card puts on screen.
 *
 * The card used to carry a task title and nothing else: the session's own times
 * lived in the hover tooltip, which a touch screen never fires. The behaviour
 * behind these affordances — the labels, the height of a block, the span a
 * running session is drawn inside — is tested in `timeline.util.spec.ts`, where
 * it can be handed a list of sessions.
 *
 * It cannot be handed one here: this project mandates signal inputs, and
 * Angular's JIT compiler — the only one available under Vitest — cannot resolve
 * them, so `ComponentRef.setInput` fails with NG0303 (the same limitation
 * documented in `timeline-bar.component.spec.ts`). The template is therefore
 * asserted against its source, as `desktop-prefs-panel.component.spec.ts` does.
 */

const SOURCE = resolve(
  __dirname,
  '../../src/app/shared/components/timeline-bar/timeline-bar.component.ts',
);

/** The declarations inside one CSS rule, so a whole-file match cannot pass by accident. */
function cssRule(src: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(src)?.[1] ?? '';
}

describe('TimelineBarComponent focus cards', () => {
  const src = readFileSync(SOURCE, 'utf8');

  describe('template contract', () => {
    it('puts the session times on the card, not only in the tooltip', () => {
      expect(src).toContain('class="block-time"');
      // Both the finished blocks and the running one.
      expect(src).toContain('block.timeLabel');
      expect(src).toContain('ab.timeLabel');
    });

    it('draws the span a running session was booked for behind its elapsed bar', () => {
      expect(src).toContain('planned-span');
      expect(src).toContain('ab.plannedHeightPx');
    });

    it('keeps the times outside the label that can be ellipsised away', () => {
      // The title shrinks; the range is the thing the card exists to show.
      expect(src).toContain('class="block-label"');
      expect(cssRule(src, '.block-label')).toContain('text-overflow: ellipsis');
      expect(cssRule(src, '.block-time')).toContain('flex: 0 0 auto');
    });

    it('shows the now line rather than hiding it', () => {
      const rule = cssRule(src, '.now-marker');
      expect(rule).not.toBe('');
      expect(rule).not.toContain('display: none');
      expect(rule).toContain('height: 1px');
    });
  });

  describe('rendering', () => {
    let fixture: ComponentFixture<TimelineBarComponent>;

    beforeEach(() => {
      vi.useFakeTimers();
      TestBed.configureTestingModule({
        imports: [TimelineBarComponent],
        providers: [
          { provide: TaskService, useValue: { tasks: signal([]) } },
          {
            provide: TimerService,
            useValue: { currentTaskId: signal(null), totalDuration: signal(1500) },
          },
        ],
      });
      fixture = TestBed.createComponent(TimelineBarComponent);
      fixture.detectChanges();
    });

    afterEach(() => {
      TestBed.resetTestingModule();
      vi.useRealTimers();
    });

    it('compiles its template and draws the now line', () => {
      expect(fixture.nativeElement.querySelector('.now-marker')).not.toBeNull();
    });

    it('draws no focus card until there is a session', () => {
      expect(fixture.nativeElement.querySelectorAll('.session-block').length).toBe(0);
      expect(fixture.nativeElement.querySelector('.session-block.planned-span')).toBeNull();
    });
  });
});
