import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SafeHtmlPipe } from '../../src/app/shared/pipes/safe-html.pipe';

describe('SafeHtmlPipe', () => {
  let pipe: SafeHtmlPipe;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SafeHtmlPipe],
    });
    pipe = TestBed.inject(SafeHtmlPipe);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('is defined', () => {
    expect(pipe).toBeDefined();
  });

  it('transform() returns a truthy SafeHtml for SVG input', () => {
    const result = pipe.transform('<svg><circle cx="12" cy="12" r="10"/></svg>');
    expect(result).toBeTruthy();
  });

  it('transform() returns a value for empty string', () => {
    const result = pipe.transform('');
    expect(result).toBeDefined();
  });

  it('transform() returns an object (SafeHtml wrapper, not raw string)', () => {
    const result = pipe.transform('<b>hello</b>');
    // Angular SafeHtml is an object, not a plain string
    expect(typeof result).not.toBe('string');
  });
});
