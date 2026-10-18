/**
 * Journal entries are rich text, stored as HTML.
 *
 * The editor writes markup, but every row written before the editor existed is
 * plain text and those rows are not migrated — so the two have to be told apart
 * on read, and every reader of an entry (the page, the reader pane, the search
 * box, Analytics) has to agree on what the string means. That agreement lives
 * here: `journalHtml` for anything that renders an entry, `journalText` for
 * anything that counts, searches or summarises one.
 *
 * Storing HTML also moves the XSS question: the editor produces markup that a
 * validator like `noXss` would reject outright (a link is `javascript:`-free
 * but an `<a>` tag is still a tag). Rendering is safe regardless — the template
 * binds through Angular's own sanitizer — but content is also assigned to a
 * `contenteditable` element, where an `onerror` attribute would run. So markup
 * is cleaned at the two doors it enters by: load and save.
 */

/** A tag that only ever appears in markup, never in a plain-text entry. */
const HTML_TAG =
  /<\/?(?:p|div|br|span|strong|b|em|i|u|s|strike|del|ins|h[1-6]|ul|ol|li|blockquote|pre|code|a|img|hr|font|mark|sub|sup|figure|figcaption|table|thead|tbody|tr|td|th)\b[^>]*>/i;

/** True when the stored string is markup rather than the pre-editor plain text. */
export function looksLikeHtml(content: string): boolean {
  return HTML_TAG.test(content);
}

function escapeChar(char: string): string {
  switch (char) {
    case '&':
      return '&amp;';
    case '<':
      return '&lt;';
    case '>':
      return '&gt;';
    case '"':
      return '&quot;';
    case "'":
      return '&#39;';
    default:
      return char;
  }
}

/** Escapes text so it renders as itself inside an HTML document. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, escapeChar);
}

const NAMED_ENTITIES = new Map<string, string>([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
  ['ndash', '–'],
  ['mdash', '—'],
  ['hellip', '…'],
  ['lsquo', '‘'],
  ['rsquo', '’'],
  ['ldquo', '“'],
  ['rdquo', '”'],
  ['times', '×'],
  ['copy', '©'],
  ['reg', '®'],
]);

/** Turns `&amp;`, `&#8212;` and the rest back into the characters they stand for. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (match: string, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED_ENTITIES.get(body.toLowerCase()) ?? match;
  });
}

/**
 * Elements removed with everything inside them.
 *
 * `<iframe>` is on the list on purpose. The editor can embed video, but an
 * embedded frame is the one element here that can run script with this app's
 * own origin, and a journal entry has no use for one.
 */
const DROPPED_BLOCKS =
  /<\s*(script|style|noscript|template|object|iframe|svg|math)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

/** The same elements when they arrive without a matching pair, plus void tags. */
const DROPPED_TAGS =
  /<\s*\/?\s*(?:script|style|noscript|template|object|iframe|svg|math|embed|link|meta|base)\b[^>]*>/gi;

/** `onclick=`, `onerror=`, `onload=` … in any quoting style. */
const INLINE_HANDLER = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/** Attributes that hold a URL, and the schemes that must not reach them. */
const URL_ATTRIBUTE = /\b(href|src|xlink:href|action|formaction|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const UNSAFE_SCHEME = /^(?:javascript|vbscript|data:text\/html)/i;

/**
 * Inline styles, and the CSS that turns one into a request or a script host.
 *
 * The journal keeps inline styles because that is how the editor writes colour
 * and highlighting — a preview without them would lose the one thing the
 * editor was added for. What it does not keep is CSS that loads something.
 */
const STYLE_ATTRIBUTE = /\sstyle\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const UNSAFE_CSS = /url\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding|javascript\s*:/i;

/**
 * Removes the markup that must never reach the DOM: script-bearing elements,
 * inline event handlers, `javascript:` URLs, and CSS that fetches or executes.
 * Formatting — including colour and highlighting — is left untouched.
 */
export function sanitizeJournalHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(DROPPED_BLOCKS, '')
    .replace(DROPPED_TAGS, '')
    .replace(INLINE_HANDLER, '')
    .replace(
      STYLE_ATTRIBUTE,
      (match: string, _quoted: string, dq: string, sq: string, bare: string) =>
        UNSAFE_CSS.test(decodeEntities(dq ?? sq ?? bare ?? '')) ? '' : match,
    )
    .replace(
      URL_ATTRIBUTE,
      (match: string, attr: string, _quoted: string, dq: string, sq: string, bare: string) => {
        // Entities are decoded first: `java&#115;cript:` is a `javascript:` URL
        // by the time the browser reads the attribute. Whitespace inside a
        // scheme — `java\tscript:` — is ignored by the engines, so it goes too.
        const url = decodeEntities(dq ?? sq ?? bare ?? '').replace(/\s+/g, '');
        return UNSAFE_SCHEME.test(url) ? `${attr}="#"` : match;
      },
    );
}

/** Paragraph breaks, and the tags that end a line of their own. */
const LINE_BREAK = /<\s*br\s*\/?\s*>/gi;
const BLOCK_END = /<\s*\/\s*(?:p|div|h[1-6]|li|blockquote|pre|tr|table|ul|ol|figure|figcaption)\s*>/gi;

/**
 * The stored entry as markup that can be edited or rendered.
 *
 * Plain-text rows become paragraphs, so the line breaks the writer typed
 * survive the trip into a `contenteditable` element, which would otherwise
 * collapse them into one run-on line.
 */
export function journalHtml(content: string): string {
  if (!content.trim()) return '';
  if (looksLikeHtml(content)) return sanitizeJournalHtml(content);

  return content
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** The stored entry as readable text: no tags, entities decoded, lines kept. */
export function journalText(content: string): string {
  if (!content) return '';
  if (!looksLikeHtml(content)) return content;

  return decodeEntities(
    content
      .replace(DROPPED_BLOCKS, '')
      .replace(LINE_BREAK, '\n')
      .replace(BLOCK_END, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Words in a run of plain text, by the same rule the analytics use. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** One line of plain text, cut to `max` characters, for a list row. */
export function snippet(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}...` : flat;
}
