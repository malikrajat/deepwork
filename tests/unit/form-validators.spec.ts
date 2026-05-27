import { describe, it, expect } from 'vitest';
import {
  noXss,
  noSqlInjection,
  trimmedRequired,
  noLeadingTrailingSpaces,
  alphanumeric,
  futureDate,
  pastDate,
} from '../../src/app/shared/validators/form-validators';

// Helper: wraps a value into the Signal Forms validator context shape
const ctx = (value: string) => ({ value: () => value });

describe('form-validators', () => {

  // ── noXss ──────────────────────────────────────────────────────────────
  describe('noXss', () => {
    it('returns undefined for normal text', () => {
      expect(noXss(ctx('Hello World'))).toBeUndefined();
      expect(noXss(ctx(''))).toBeUndefined();
    });

    it('blocks <script> tag', () => {
      expect(noXss(ctx('<script>alert(1)</script>'))).toMatchObject({ kind: 'xss' });
    });

    it('blocks javascript: protocol', () => {
      expect(noXss(ctx('javascript:alert(1)'))).toMatchObject({ kind: 'xss' });
    });

    it('blocks inline event handler (on* = )', () => {
      expect(noXss(ctx('onclick=doEvil()'))).toMatchObject({ kind: 'xss' });
      expect(noXss(ctx('onmouseover = bad()'))).toMatchObject({ kind: 'xss' });
    });

    it('blocks <iframe>', () => {
      expect(noXss(ctx('<iframe src="evil.com"></iframe>'))).toMatchObject({ kind: 'xss' });
    });

    it('blocks <object> and <embed>', () => {
      expect(noXss(ctx('<object data="x.swf"></object>'))).toMatchObject({ kind: 'xss' });
      expect(noXss(ctx('<embed src="x.swf" />'))).toMatchObject({ kind: 'xss' });
    });

    it('blocks vbscript:', () => {
      expect(noXss(ctx('vbscript:msgbox(1)'))).toMatchObject({ kind: 'xss' });
    });

    it('blocks data:text/html', () => {
      expect(noXss(ctx('data:text/html,<h1>hi</h1>'))).toMatchObject({ kind: 'xss' });
    });

    it('includes an error message string', () => {
      const result = noXss(ctx('<script>'));
      expect(typeof result?.message).toBe('string');
      expect(result!.message.length).toBeGreaterThan(0);
    });
  });

  // ── noSqlInjection ─────────────────────────────────────────────────────
  describe('noSqlInjection', () => {
    it('returns undefined for safe input', () => {
      expect(noSqlInjection(ctx('My task title'))).toBeUndefined();
      expect(noSqlInjection(ctx(''))).toBeUndefined();
    });

    it("blocks quote + OR sequence", () => {
      expect(noSqlInjection(ctx("' OR 1=1--"))).toMatchObject({ kind: 'sqlInjection' });
    });

    it('blocks -- comment sequences', () => {
      expect(noSqlInjection(ctx('-- drop table'))).toMatchObject({ kind: 'sqlInjection' });
    });

    it('blocks UNION SELECT pattern', () => {
      expect(noSqlInjection(ctx("'; UNION SELECT * FROM users --"))).toMatchObject({ kind: 'sqlInjection' });
    });

    it('blocks EXEC keyword', () => {
      expect(noSqlInjection(ctx('EXEC xp_cmdshell'))).toMatchObject({ kind: 'sqlInjection' });
    });
  });

  // ── trimmedRequired ────────────────────────────────────────────────────
  describe('trimmedRequired', () => {
    it('passes a non-empty string', () => {
      expect(trimmedRequired(ctx('hello'))).toBeUndefined();
      expect(trimmedRequired(ctx('  a  '))).toBeUndefined();
    });

    it('fails an empty string', () => {
      expect(trimmedRequired(ctx(''))).toMatchObject({ kind: 'trimmedRequired' });
    });

    it('fails a whitespace-only string', () => {
      expect(trimmedRequired(ctx('   '))).toMatchObject({ kind: 'trimmedRequired' });
      expect(trimmedRequired(ctx('\t\n'))).toMatchObject({ kind: 'trimmedRequired' });
    });
  });

  // ── noLeadingTrailingSpaces ────────────────────────────────────────────
  describe('noLeadingTrailingSpaces', () => {
    it('passes a clean string', () => {
      expect(noLeadingTrailingSpaces(ctx('hello world'))).toBeUndefined();
    });

    it('passes empty string (nothing to check)', () => {
      expect(noLeadingTrailingSpaces(ctx(''))).toBeUndefined();
    });

    it('fails string with leading space', () => {
      expect(noLeadingTrailingSpaces(ctx(' hello'))).toMatchObject({ kind: 'whitespace' });
    });

    it('fails string with trailing space', () => {
      expect(noLeadingTrailingSpaces(ctx('hello '))).toMatchObject({ kind: 'whitespace' });
    });

    it('fails string with both leading and trailing spaces', () => {
      expect(noLeadingTrailingSpaces(ctx(' hello '))).toMatchObject({ kind: 'whitespace' });
    });
  });

  // ── alphanumeric ───────────────────────────────────────────────────────
  describe('alphanumeric', () => {
    const validator = alphanumeric();

    it('passes letters and numbers', () => {
      expect(validator(ctx('Hello123'))).toBeUndefined();
      expect(validator(ctx(''))).toBeUndefined();
    });

    it('fails string with special characters', () => {
      expect(validator(ctx('hello!'))).toMatchObject({ kind: 'alphanumeric' });
      expect(validator(ctx('hello world'))).toMatchObject({ kind: 'alphanumeric' });
    });

    it('allows extra characters when configured', () => {
      const dashValidator = alphanumeric('-_');
      expect(dashValidator(ctx('hello_world-123'))).toBeUndefined();
      expect(dashValidator(ctx('hello!'))).toMatchObject({ kind: 'alphanumeric' });
    });
  });

  // ── futureDate ─────────────────────────────────────────────────────────
  describe('futureDate', () => {
    it('passes empty value (field is optional)', () => {
      expect(futureDate(ctx(''))).toBeUndefined();
    });

    it('fails a past date', () => {
      expect(futureDate(ctx('2000-01-01'))).toMatchObject({ kind: 'futureDate' });
    });

    it('passes a date that is tomorrow', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(futureDate(ctx(tomorrow.toISOString().slice(0, 10)))).toBeUndefined();
    });

    it('fails when date string is not a valid date', () => {
      expect(futureDate(ctx('not-a-date'))).toMatchObject({ kind: 'invalidDate' });
      expect(futureDate(ctx('2024-13-45'))).toMatchObject({ kind: 'invalidDate' });
    });
  });

  // ── pastDate ───────────────────────────────────────────────────────────
  describe('pastDate', () => {
    it('passes empty value', () => {
      expect(pastDate(ctx(''))).toBeUndefined();
    });

    it('passes a past date', () => {
      expect(pastDate(ctx('2000-01-01'))).toBeUndefined();
    });

    it('fails a future date', () => {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      expect(pastDate(ctx(future.toISOString().slice(0, 10)))).toMatchObject({ kind: 'pastDate' });
    });
  });
});
