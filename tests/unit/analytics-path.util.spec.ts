import { describe, it, expect } from 'vitest';
import {
  countedPath,
  displayPath,
  isCountedPath,
  pageTitleFor,
  selectPathIds,
} from '../../src/app/core/utils/analytics-path.util';

/**
 * GoatCounter cannot tell two apps on one account apart — it stores no domain —
 * so DeepWork files every pageview under its own prefix. These are the paths
 * that decide what the dashboard shows, and the reason a visit to the app's
 * dashboard is `/deepwork/` rather than `/deepwork`: the counter looks paths up
 * by exact name.
 */
describe('countedPath', () => {
  it('files the dashboard under the prefix', () => {
    expect(countedPath('/')).toBe('/deepwork/');
    expect(countedPath('')).toBe('/deepwork/');
  });

  it('files a page under the prefix', () => {
    expect(countedPath('/settings')).toBe('/deepwork/settings');
    expect(countedPath('/journal/2026-06-05')).toBe('/deepwork/journal/2026-06-05');
  });

  it('accepts a path without its leading slash', () => {
    expect(countedPath('settings')).toBe('/deepwork/settings');
  });

  it('drops the query and the fragment', () => {
    // The campaign parameters travel in the pageview's own query field; a path
    // that carried them would make every campaign a separate page.
    expect(countedPath('/tasks?filter=today')).toBe('/deepwork/tasks');
    expect(countedPath('/journal/2026-06-05#note')).toBe('/deepwork/journal/2026-06-05');
  });

  it('trims a trailing slash so one page is one row', () => {
    expect(countedPath('/tasks/')).toBe('/deepwork/tasks');
  });

  it('does not file everything twice when the prefix is already there', () => {
    // `location.pathname` on the GitHub Pages build carries the base href, so a
    // caller that passed it would otherwise write `/deepwork/deepwork/...`.
    expect(countedPath('/deepwork/settings')).toBe('/deepwork/settings');
    expect(countedPath('/deepwork/')).toBe('/deepwork/');
    expect(countedPath('/deepwork')).toBe('/deepwork/');
  });
});

describe('pageTitleFor', () => {
  it('names the page the way the app names it', () => {
    expect(pageTitleFor('/')).toBe('DeepWork — Dashboard');
    expect(pageTitleFor('/settings')).toBe('DeepWork — Settings');
    expect(pageTitleFor('/journal/2026-06-05')).toBe('DeepWork — Journal');
  });

  it('names a route it has never heard of rather than repeating itself', () => {
    expect(pageTitleFor('/release-notes')).toBe('DeepWork — Release notes');
  });
});

describe('isCountedPath', () => {
  it('accepts the app and its pages', () => {
    expect(isCountedPath('/deepwork')).toBe(true);
    expect(isCountedPath('/deepwork/tasks')).toBe(true);
    expect(isCountedPath('/deepwork/')).toBe(true);
  });

  it('does not accept a path that merely starts with the same letters', () => {
    expect(isCountedPath('/deepworkish')).toBe(false);
    expect(isCountedPath('/')).toBe(false);
    expect(isCountedPath('/tasks')).toBe(false);
  });
});

describe('selectPathIds', () => {
  it('picks out the app own paths, with the IDs the API filters by', () => {
    expect(
      selectPathIds([
        { id: 1, path: '/deepwork/tasks' },
        { id: 2, path: '/' },
        { id: 3, path: '/deepwork' },
        { id: 4, path: '/about' },
      ]),
    ).toEqual([1, 3]);
  });

  it('has nothing to say about a site with no such paths', () => {
    expect(selectPathIds([])).toEqual([]);
  });
});

describe('displayPath', () => {
  it('drops the prefix a reader does not need', () => {
    expect(displayPath('/deepwork/settings')).toBe('/settings');
    expect(displayPath('/deepwork')).toBe('/ (dashboard)');
    expect(displayPath('/deepwork/')).toBe('/ (dashboard)');
  });

  it('leaves another app path alone, which is how a filter gets noticed', () => {
    expect(displayPath('/about')).toBe('/about');
  });
});
