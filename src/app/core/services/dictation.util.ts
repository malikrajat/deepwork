/** A word or phrase the recogniser keeps getting wrong. */
export interface DictationCorrection {
  from: string;
  to: string;
}

export interface DictationLanguage {
  code: string;
  label: string;
}

export interface DictationPrefs {
  language: string;
  corrections: DictationCorrection[];
}

/** English variants come first — the default is English. */
export const DICTATION_LANGUAGES: DictationLanguage[] = [
  { code: 'en-US', label: 'English (United States)' },
  { code: 'en-GB', label: 'English (United Kingdom)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-AU', label: 'English (Australia)' },
  { code: 'en-CA', label: 'English (Canada)' },
  { code: 'en-NZ', label: 'English (New Zealand)' },
  { code: 'en-ZA', label: 'English (South Africa)' },
  { code: 'en-IE', label: 'English (Ireland)' },
  { code: 'en-SG', label: 'English (Singapore)' },
  { code: 'en-PH', label: 'English (Philippines)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'es-ES', label: 'Spanish (Spain)' },
  { code: 'es-MX', label: 'Spanish (Mexico)' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'it-IT', label: 'Italian' },
  { code: 'nl-NL', label: 'Dutch' },
  { code: 'ja-JP', label: 'Japanese' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
];

/** App vocabulary that generic recognisers tend to mangle. */
export const DEFAULT_CORRECTIONS: DictationCorrection[] = [
  { from: 'deep work', to: 'DeepWork' },
  { from: 'deep-work', to: 'DeepWork' },
  { from: 'deepwork', to: 'DeepWork' },
  { from: 'eisenhower', to: 'Eisenhower' },
  { from: 'pomodoro', to: 'Pomodoro' },
  { from: 'to do list', to: 'to-do list' },
];

/** Spoken punctuation, applied to finished phrases. */
const INLINE_PUNCTUATION: Array<[string, string]> = [
  ['question mark', '?'],
  ['exclamation mark', '!'],
  ['exclamation point', '!'],
  ['full stop', '.'],
  ['semicolon', ';'],
  ['comma', ','],
  ['colon', ':'],
  ['period', '.'],
];

const LINE_BREAKS: Array<[RegExp, string]> = [
  [/\s*\bnew paragraph\b\s*/gi, '\n\n'],
  [/\s*\bnew line\b\s*/gi, '\n'],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Longest phrases first so "deep work session" wins over "deep work". */
export function mergeCorrections(corrections: DictationCorrection[]): DictationCorrection[] {
  const merged = new Map<string, DictationCorrection>();
  for (const correction of [...DEFAULT_CORRECTIONS, ...corrections]) {
    const from = correction?.from?.trim();
    if (from) merged.set(from.toLowerCase(), { from, to: correction.to ?? '' });
  }
  return [...merged.values()].sort((a, b) => b.from.length - a.from.length);
}

/**
 * Turn a raw speech transcript into something worth keeping in a journal:
 * personal vocabulary, spoken punctuation, filler removal, sentence case.
 *
 * Pure and synchronous so it is easy to reason about (and to try out).
 */
export function polishTranscript(raw: string, corrections: DictationCorrection[]): string {
  if (!raw || !raw.trim()) return '';

  let text = ` ${raw.replace(/\s+/g, ' ').trim()} `;

  for (const correction of mergeCorrections(corrections)) {
    if (!correction.to) continue;
    text = text.replace(
      new RegExp(`(^|[ \\t])${escapeRegExp(correction.from)}(?=[ \\t]|[.,!?;:]|$)`, 'gi'),
      `$1${correction.to}`
    );
  }

  for (const [phrase, symbol] of INLINE_PUNCTUATION) {
    text = text.replace(new RegExp(`[ \\t]+${phrase}\\b`, 'gi'), symbol);
  }

  // Filler words add nothing to a written journal.
  text = text.replace(/\b(?:um+|uh+|erm+|hmm+)\b[,]?/gi, ' ');
  text = text.replace(/[ \t]+([,.;:!?])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();

  // Line breaks before sentence case, so a new line starts a new sentence.
  for (const [pattern, replacement] of LINE_BREAKS) {
    text = text.replace(pattern, replacement);
  }

  // Sentence case, and the pronoun "I".
  text = text.replace(
    /(^|[.!?][ \t]+|\n[ \t]*)([a-z])/g,
    (_match, prefix: string, letter: string) => prefix + letter.toUpperCase()
  );
  text = text.replace(/\bi\b/g, 'I');

  return text
    .split('\n')
    .map(line => line.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The user's own language, falling back to English. */
export function defaultDictationLanguage(navigatorLanguage?: string): string {
  const nav = (navigatorLanguage ?? '').toLowerCase();
  if (nav && nav.startsWith('en')) {
    const exact = DICTATION_LANGUAGES.find(language => language.code.toLowerCase() === nav);
    return exact ? exact.code : 'en-US';
  }
  return 'en-US';
}
