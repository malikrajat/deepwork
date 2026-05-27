import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TimelineBarComponent } from '../../src/app/shared/components/timeline-bar/timeline-bar.component';
import { TaskService } from '../../src/app/core/services/task.service';
import { TimerService } from '../../src/app/core/services/timer.service';

// TimelineBarComponent uses signal inputs (input()) which are not resolvable in
// Angular JIT mode (Vitest). Tests use the component directly with default input
// values (sessions=[], activeRunning=false) — no setInput() calls needed.

describe('TimelineBarComponent', () => {
  let fixture: ComponentFixture<TimelineBarComponent>;
  const mockTaskService = { tasks: signal([]) };
  const mockTimerService = {};

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [TimelineBarComponent],
      providers: [
        { provide: TaskService, useValue: mockTaskService },
        { provide: TimerService, useValue: mockTimerService },
      ],
    });
    fixture = TestBed.createComponent(TimelineBarComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('renders the timeline container', () => {
    expect(fixture.nativeElement.querySelector('.timeline-container')).not.toBeNull();
  });

  it('renders exactly 24 hour markers', () => {
    const markers = fixture.nativeElement.querySelectorAll('.hour-marker');
    expect(markers.length).toBe(24);
  });

  it('canvasHeight equals 24 * hourHeight', () => {
    const comp = fixture.componentInstance;
    expect(comp.canvasHeight).toBe(24 * comp.hourHeight);
  });

  it('hours array has 24 entries starting at 0', () => {
    const comp = fixture.componentInstance;
    expect(comp.hours).toHaveLength(24);
    expect(comp.hours[0]).toBe(0);
    expect(comp.hours[23]).toBe(23);
  });

  it('shows no session blocks with default empty sessions', () => {
    expect(fixture.nativeElement.querySelectorAll('.session-block').length).toBe(0);
  });

  it('shows no active block with default activeRunning=false', () => {
    expect(fixture.nativeElement.querySelector('.session-block.is-active')).toBeNull();
  });

  it('currentHour is a number between 0 and 23', () => {
    const h = fixture.componentInstance.currentHour();
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(23);
  });

  it('hourHeight is a positive number', () => {
    expect(fixture.componentInstance.hourHeight).toBeGreaterThan(0);
  });
});
