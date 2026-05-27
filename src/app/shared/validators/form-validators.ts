/**
 * Reusable validation rules for Angular Signal Forms.
 * Provides sanitization, XSS protection, and common field validations.
 * All validators follow the Signal Forms contract: return {kind, message} | undefined.
 */

/** Validation error shape for Signal Forms */
export interface FormValidationError {
  readonly kind: string;
  readonly message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Security validators
// ─────────────────────────────────────────────────────────────────────────────

/** Detects potentially dangerous HTML/script content (XSS prevention) */
const DANGEROUS_PATTERNS = [
  /<script\b/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /data:text\/html/i,
  /vbscript:/i,
];

/** Schema-compatible validator: blocks XSS payloads in text fields */
export function noXss(ctx: { value: () => string }): FormValidationError | undefined {
  const val = ctx.value();
  if (!val) return undefined;
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(val)) {
      return { kind: 'xss', message: 'Input contains potentially unsafe content' };
    }
  }
  return undefined;
}

/** Schema-compatible validator: blocks SQL injection patterns */
const SQL_PATTERNS = [
  /(['";]\s*(OR|AND|UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\s)/i,
  /(--\s|\/\*|\*\/)/,
  /(\bEXEC\b|\bEXECUTE\b)/i,
];

export function noSqlInjection(ctx: { value: () => string }): FormValidationError | undefined {
  const val = ctx.value();
  if (!val) return undefined;
  for (const pattern of SQL_PATTERNS) {
    if (pattern.test(val)) {
      return { kind: 'sqlInjection', message: 'Input contains invalid characters' };
    }
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// String validators
// ─────────────────────────────────────────────────────────────────────────────

/** Trims and checks for non-empty (use with required for better UX) */
export function trimmedRequired(ctx: { value: () => string }): FormValidationError | undefined {
  const val = ctx.value();
  if (!val || val.trim().length === 0) {
    return { kind: 'trimmedRequired', message: 'This field cannot be empty or whitespace only' };
  }
  return undefined;
}

/** No leading/trailing whitespace */
export function noLeadingTrailingSpaces(ctx: { value: () => string }): FormValidationError | undefined {
  const val = ctx.value();
  if (!val) return undefined;
  if (val !== val.trim()) {
    return { kind: 'whitespace', message: 'Remove leading or trailing spaces' };
  }
  return undefined;
}

/** Alphanumeric characters only (plus optional allowed chars) */
export function alphanumeric(allowedExtra = ''): (ctx: { value: () => string }) => FormValidationError | undefined {
  const escapedExtra = allowedExtra.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  const regex = new RegExp(`^[a-zA-Z0-9${escapedExtra}]*$`);
  return (ctx) => {
    const val = ctx.value();
    if (!val) return undefined;
    if (!regex.test(val)) {
      const suffix = allowedExtra ? ` and ${allowedExtra}` : '';
      return { kind: 'alphanumeric', message: `Only letters, numbers${suffix} are allowed` };
    }
    return undefined;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Date validators
// ─────────────────────────────────────────────────────────────────────────────

/** Date must be in the future */
export function futureDate(ctx: { value: () => string }): FormValidationError | undefined {
  const val = ctx.value();
  if (!val) return undefined;
  const date = new Date(val);
  if (Number.isNaN(date.getTime())) {
    return { kind: 'invalidDate', message: 'Enter a valid date' };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) {
    return { kind: 'futureDate', message: 'Date must be in the future' };
  }
  return undefined;
}

/** Date must be in the past */
export function pastDate(ctx: { value: () => string }): FormValidationError | undefined {
  const val = ctx.value();
  if (!val) return undefined;
  const date = new Date(val);
  if (Number.isNaN(date.getTime())) {
    return { kind: 'invalidDate', message: 'Enter a valid date' };
  }
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (date > today) {
    return { kind: 'pastDate', message: 'Date must be in the past' };
  }
  return undefined;
}

/** Date must be within a range */
export function dateRange(minDate: string, maxDate: string): (ctx: { value: () => string }) => FormValidationError | undefined {
  return (ctx) => {
    const val = ctx.value();
    if (!val) return undefined;
    const date = new Date(val);
    if (Number.isNaN(date.getTime())) {
      return { kind: 'invalidDate', message: 'Enter a valid date' };
    }
    if (date < new Date(minDate) || date > new Date(maxDate)) {
      return { kind: 'dateRange', message: `Date must be between ${minDate} and ${maxDate}` };
    }
    return undefined;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Number validators
// ─────────────────────────────────────────────────────────────────────────────

/** Number must be a positive integer */
export function positiveInteger(ctx: { value: () => number }): FormValidationError | undefined {
  const val = ctx.value();
  if (val === 0) return undefined; // Allow zero in most cases
  if (!Number.isInteger(val) || val < 0) {
    return { kind: 'positiveInteger', message: 'Must be a positive whole number' };
  }
  return undefined;
}

/** Number must be within a range (inclusive) */
export function numberRange(min: number, max: number): (ctx: { value: () => number }) => FormValidationError | undefined {
  return (ctx) => {
    const val = ctx.value();
    if (val < min || val > max) {
      return { kind: 'numberRange', message: `Must be between ${min} and ${max}` };
    }
    return undefined;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanitization helpers (use BEFORE saving to DB, not as validators)
// ─────────────────────────────────────────────────────────────────────────────

/** Strip HTML tags from a string */
export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

/** Sanitize string: trim, strip HTML, collapse multiple spaces */
export function sanitizeText(value: string): string {
  return stripHtml(value).trim().replace(/\s{2,}/g, ' ');
}

/** Sanitize for safe storage - escapes HTML entities */
export function escapeHtml(value: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
  };
  return value.replace(/[&<>"']/g, (char) => map[char]);
}
