import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SeoTitleStrategy } from '../../src/app/core/services/seo-title.strategy';

/** A route target is required, but the strategy only reads router metadata. */
@Component({ selector: 'app-test-blank', template: '', standalone: true })
class BlankComponent {}

const HOME_DESCRIPTION =
  'A free, local-first Pomodoro timer with today’s tasks, a day planner and habits. No account and no cloud.';

const TASKS_DESCRIPTION =
  'A To Do, In Progress and Done board with search, recurrence and CSV import and export.';

const JOURNAL_DESCRIPTION =
  'Dated journal entries with word counts, kept in the same local database as your tasks.';

function meta(name: string): string {
  return (
    document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ??
    document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ??
    ''
  );
}

function canonical(): string {
  return document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
}

describe('SeoTitleStrategy', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    document.head.querySelectorAll('link[rel="canonical"]').forEach((link) => link.remove());
    document.title = '';

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            component: BlankComponent,
            title: 'Focus timer',
            data: { description: HOME_DESCRIPTION },
          },
          {
            path: 'tasks',
            component: BlankComponent,
            title: 'Task board',
            data: { description: TASKS_DESCRIPTION },
          },
          {
            path: 'journal',
            component: BlankComponent,
            title: 'Journal',
            data: { description: JOURNAL_DESCRIPTION, canonicalPath: '/journal' },
          },
          {
            path: 'journal/:date',
            component: BlankComponent,
            title: 'Journal',
            data: { description: JOURNAL_DESCRIPTION, canonicalPath: '/journal' },
          },
          { path: 'untitled', component: BlankComponent },
        ]),
        { provide: TitleStrategy, useClass: SeoTitleStrategy },
      ],
    });

    harness = await RouterTestingHarness.create();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('writes the title, description and absolute canonical URL for the root route', async () => {
    await harness.navigateByUrl('/');

    expect(document.title).toBe('Focus timer · DeepWork');
    expect(meta('description')).toBe(HOME_DESCRIPTION);
    expect(meta('og:title')).toBe('Focus timer · DeepWork');
    expect(meta('og:url')).toBe('https://app.deepwork.rajatmalik.dev/');
    expect(canonical()).toBe('https://app.deepwork.rajatmalik.dev/');
  });

  it('updates the metadata when the route changes', async () => {
    await harness.navigateByUrl('/tasks');

    expect(document.title).toBe('Task board · DeepWork');
    expect(meta('description')).toBe(TASKS_DESCRIPTION);
    expect(meta('twitter:description')).toBe(TASKS_DESCRIPTION);
    expect(canonical()).toBe('https://app.deepwork.rajatmalik.dev/tasks');
  });

  it('keeps a dated journal address on the undated canonical URL', async () => {
    await harness.navigateByUrl('/journal/2026-11-17');

    expect(document.title).toBe('Journal · DeepWork');
    expect(canonical()).toBe('https://app.deepwork.rajatmalik.dev/journal');
    expect(meta('og:url')).toBe('https://app.deepwork.rajatmalik.dev/journal');
  });

  it('reuses the existing canonical link instead of adding a second one', async () => {
    await harness.navigateByUrl('/tasks');
    await harness.navigateByUrl('/journal');

    expect(document.head.querySelectorAll('link[rel="canonical"]').length).toBe(1);
  });

  it('falls back to the app title when a route has none', async () => {
    await harness.navigateByUrl('/untitled');

    expect(document.title).toBe('DeepWork — free focus timer, task manager and habit tracker');
    expect(canonical()).toBe('https://app.deepwork.rajatmalik.dev/untitled');
  });
});
