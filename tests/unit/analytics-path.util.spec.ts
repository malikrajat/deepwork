import { describe, it, expect } from 'vitest';
import { countedPath, pageTitleFor } from '../../src/app/core/utils/analytics-path.util';

/**
 * DeepWork has its own GoatCounter site (`app-deepwork.goatcounter.com`), so a
 * pageview is filed under the route the router is on — with no prefix to keep it
 * apart from another app, because there is no other app on the site.
 */
describe('countedPath', () => {
  it('files the dashboard as the site root', () => {
    expect(countedPath('/')).toBe('/');
    expect(countedPath('')).toBe('/');
  });

  it('files a page under its route', () => {
    expect(countedPath('/settings')).toBe('/settings');
    expect(countedPath('/journal/2026-06-05')).toBe('/journal/2026-06-05');
  });

  it('accepts a path without its leading slash', () => {
    expect(countedPath('settings')).toBe('/settings');
  });

  it('drops the query and the fragment', () => {
    // The campaign parameters travel in the pageview's own query field; a path
    // that carried them would make every campaign a separate page.
    expect(countedPath('/tasks?filter=today')).toBe('/tasks');
    expect(countedPath('/journal/2026-06-05#note')).toBe('/journal/2026-06-05');
  });

  it('trims a trailing slash so one page is one row', () => {
    expect(countedPath('/tasks/')).toBe('/tasks');
    expect(countedPath('/tasks///')).toBe('/tasks');
  });

  it('leaves a route that already looks right alone', () => {
    expect(countedPath('/deepwork/settings')).toBe('/deepwork/settings');
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
