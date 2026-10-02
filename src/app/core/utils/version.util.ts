/**
 * Version comparison for the update check.
 *
 * Release tags are written by hand ("v1.0.0", "2.0.0-beta.1", "1.0"), so the
 * comparison cannot be a string compare and cannot assume three numbers. These
 * helpers follow semantic versioning where it matters — a release outranks its
 * own pre-releases — and treat anything unparseable as "no opinion" instead of
 * guessing.
 */

/** A version split into the parts that decide which one is newer. */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  /** Text after the first `-` (`beta.1`), or null for a release build. */
  prerelease: string | null;
  /** The version as it was given, trimmed. */
  raw: string;
}

/** `v` prefix optional, one to three numbers, optional pre-release and build. */
const VERSION_PATTERN =
  /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Splits `1.2.3-beta.1` into its parts, or returns null when it is not a version. */
export function parseVersion(value: string | null | undefined): ParsedVersion | null {
  if (!value) return null;
  const raw = value.trim();
  const match = VERSION_PATTERN.exec(raw);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
    prerelease: match[4] ?? null,
    raw,
  };
}

/**
 * Orders two versions the way a user reads them: negative when `a` is older,
 * positive when `a` is newer, `0` when they are the same.
 *
 * `null` means at least one of them is not a version, so the caller can say so
 * rather than silently reporting "up to date".
 */
export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;

  for (const part of ['major', 'minor', 'patch'] as const) {
    if (left[part] !== right[part]) return left[part] < right[part] ? -1 : 1;
  }

  return comparePrerelease(left.prerelease, right.prerelease);
}

/** True when `candidate` is a version that is newer than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  return (compareVersions(candidate, current) ?? 0) > 0;
}

/** `1.0.0` → `v1.0.0`; already-prefixed and unparseable values are left alone. */
export function formatVersion(value: string | null | undefined): string {
  const parsed = parseVersion(value);
  if (!parsed) return value?.trim() ?? '';
  return `v${parsed.raw.replace(/^v/i, '')}`;
}

/**
 * Release outranks its own pre-releases; two pre-releases are compared segment
 * by segment, numerically where both segments are numbers.
 */
function comparePrerelease(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  const left = a.split('.');
  const right = b.split('.');
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const one = left[index];
    const other = right[index];
    // A shorter pre-release list is the smaller one (`1.0.0-alpha` < `1.0.0-alpha.1`).
    if (one === undefined) return -1;
    if (other === undefined) return 1;
    if (one === other) continue;

    const oneNumber = Number(one);
    const otherNumber = Number(other);
    const bothNumeric = !Number.isNaN(oneNumber) && !Number.isNaN(otherNumber);
    if (bothNumeric && oneNumber !== otherNumber) return oneNumber < otherNumber ? -1 : 1;
    if (bothNumeric) continue;

    return one < other ? -1 : 1;
  }

  return 0;
}
