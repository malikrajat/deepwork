import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { signal } from '@angular/core';
import { DatabaseErrorComponent } from '../../src/app/shared/components/database-error/database-error.component';
import { DbService, DatabaseUnreadableError } from '../../src/app/core/services/db.service';

const SOURCE = resolve(
  __dirname,
  '../../src/app/shared/components/database-error/database-error.component.ts',
);
const src = () => readFileSync(SOURCE, 'utf8');

const report = {
  present: true,
  bytes: 4096,
  holdsData: true,
  unreadable: 'the file is not a SQLite database',
  path: 'C:\\Users\\someone\\AppData\\Roaming\\com.deepwork.app\\deepwork.db',
};

/**
 * The one screen DeepWork shows instead of itself.
 *
 * What matters is what it tells the user, and the three facts the user cannot
 * work out on their own: that nothing was deleted, where the file is, and that a
 * copy of it is next to it. A guard that refused to open the database and said
 * nothing would be indistinguishable from an app that lost the data.
 */
describe('DatabaseErrorComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: DbService, useValue: { failure: signal(new DatabaseUnreadableError(report)) } },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('is driven by the database service\u2019s own failure', () => {
    const component = TestBed.runInInjectionContext(() => new DatabaseErrorComponent());
    expect(component.db.failure()).toBeInstanceOf(DatabaseUnreadableError);
  });

  it('says that nothing was deleted, first', () => {
    const source = src();
    expect(source).toContain('still on disk');
    expect(source).toContain('not deleted');
  });

  it('names the file the user has to go and look at', () => {
    const source = src();
    expect(source).toContain('failure.report.path');
  });

  it('repeats what the desktop layer found, rather than paraphrasing it', () => {
    expect(src()).toContain('failure.report.unreadable');
  });

  it('points at the copies taken before every launch', () => {
    const source = src();
    expect(source).toContain('backups');
    expect(source).toContain('before this launch');
  });

  it('tells the user to keep the damaged file', () => {
    expect(src()).toContain('keep the damaged file');
  });

  it('renders nothing at all when there is no failure', () => {
    const source = src();
    // One `@if`, wrapped around the whole of the markup: no failure, no card.
    expect(source).toContain('@if (db.failure(); as failure)');
  });

  it('is *nothing* on screen when there is no failure — no box, and no clicks eaten', () => {
    const source = src();
    // The regression this guards is the worst bug this component has shipped: an
    // unconditional `position: fixed; inset: 0; pointer-events: all` host meant an
    // app with a perfectly good database still had an invisible, full-window,
    // z-index-30000 element over every pixel of it. Every click in the app landed
    // on that instead of on the app, and the one card drawn above it looked like a
    // set of dead buttons. `display: contents` generates no box, so an empty
    // component occupies nothing.
    expect(source).toContain('display: contents');

    // ...and every part of that surface lives inside the `@if`, where it only
    // exists when there is something to show. The host's own rule must carry none
    // of it.
    const hostRule = source.slice(source.indexOf(':host {'), source.indexOf('.db-error-layer'));
    expect(hostRule).not.toContain('position: fixed');
    expect(hostRule).not.toContain('inset');
    expect(hostRule).not.toContain('pointer-events');
    expect(hostRule).not.toContain('z-index');
  });

  it('covers the window — and takes its clicks — when it *is* showing', () => {
    const layer = src().slice(src().indexOf('.db-error-layer'));
    expect(layer).toContain('position: fixed');
    expect(layer).toContain('inset: 0');
    expect(layer).toContain('z-index: 30000');
  });
});

describe('DatabaseUnreadableError', () => {
  it('carries the report so the card can name the file', () => {
    const error = new DatabaseUnreadableError(report);
    expect(error.report.path).toBe(report.path);
    expect(error.name).toBe('DatabaseUnreadableError');
  });

  it('says nothing was deleted, in the message a log will keep', () => {
    const message = new DatabaseUnreadableError(report).message;
    expect(message).toContain(report.path);
    expect(message).toContain('Nothing has been changed');
    expect(message).toContain(report.unreadable);
  });
});
