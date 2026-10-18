import { describe, it, expect } from 'vitest';
import {
  countWords,
  decodeEntities,
  escapeHtml,
  journalHtml,
  journalText,
  looksLikeHtml,
  sanitizeJournalHtml,
  snippet,
} from '../../src/app/core/utils/journal-content.util';

/**
 * Journal entries are HTML since the rich text editor arrived, but the rows
 * written before it are plain text. These two readers are what keeps the old
 * rows working: one produces markup the editor and the reader pane can show,
 * the other produces the text every count and search is made of.
 *
 * The important cases are the boundaries: a plain entry that happens to contain
 * an ampersand must not lose it, an old entry's blank lines must survive the
 * trip into a `contenteditable`, and markup that could run script must never
 * come out of either function.
 */

const markup = [
  '<p>Hello</p>',
  '<div>x</div>',
  'a <b>bold</b> word',
  '<h2>Title</h2>',
  '<ul><li>one</li></ul>',
  '<a href="#">link</a>',
  '<br>',
  '<span style="color:red">red</span>',
  '<font color="#ff0000">old-style colour</font>',
];

describe('journal content: telling markup from plain text', () => {
  it('recognises the tags the editor and older browsers produce', () => {
    for (const value of markup) {
      expect(looksLikeHtml(value), value).toBe(true);
    }
  });

  it('treats ordinary prose as plain text', () => {
    expect(looksLikeHtml('')).toBe(false);
    expect(looksLikeHtml('Today I did 5 < 6 push-ups & felt fine.')).toBe(false);
    expect(looksLikeHtml('a < b and c > d')).toBe(false);
    expect(looksLikeHtml('angle brackets <3')).toBe(false);
  });
});

describe('journal content: escaping and entities', () => {
  it('escapes the five characters that would otherwise be markup', () => {
    expect(escapeHtml('a & b < c > d "e" \'f\'')).toBe(
      'a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;',
    );
    expect(escapeHtml('nothing to do')).toBe('nothing to do');
  });

  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(decodeEntities('&lt;p&gt;')).toBe('<p>');
    expect(decodeEntities('em dash &#8212; here')).toBe('em dash — here');
    expect(decodeEntities('em dash &#x2014; here')).toBe('em dash — here');
    expect(decodeEntities('non&nbsp;breaking')).toBe('non breaking');
  });

  it('leaves entities it does not know, and codes that are not characters', () => {
    expect(decodeEntities('&notarealentity;')).toBe('&notarealentity;');
    expect(decodeEntities('&#0;')).toBe('&#0;');
    expect(decodeEntities('&#x110000;')).toBe('&#x110000;');
  });
});

describe('journal content: sanitising', () => {
  it('removes script-bearing elements with their contents', () => {
    expect(sanitizeJournalHtml('<p>safe</p><script>alert(1)</script>')).toBe('<p>safe</p>');
    expect(sanitizeJournalHtml('<style>body{display:none}</style><p>safe</p>')).toBe(
      '<p>safe</p>',
    );
    expect(sanitizeJournalHtml('<iframe src="https://example.com"></iframe><p>safe</p>')).toBe(
      '<p>safe</p>',
    );
    expect(sanitizeJournalHtml('<object data="x"></object>ok')).toBe('ok');
    expect(sanitizeJournalHtml('<svg><script>alert(1)</script></svg>ok')).toBe('ok');
  });

  it('removes stray tags whose pair never arrived', () => {
    expect(sanitizeJournalHtml('a<meta charset="x">b<link rel="x">c<embed src="x">d')).toBe(
      'abcd',
    );
  });

  it('removes inline event handlers in every quoting style', () => {
    expect(sanitizeJournalHtml('<p onclick="steal()">x</p>')).toBe('<p>x</p>');
    expect(sanitizeJournalHtml("<img src='a.png' onerror='steal()'>")).toBe("<img src='a.png'>");
    expect(sanitizeJournalHtml('<p onmouseover=steal()>x</p>')).toBe('<p>x</p>');
  });

  it('neutralises javascript: and data: URLs but keeps links and images', () => {
    expect(sanitizeJournalHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a href="#">x</a>');
    expect(sanitizeJournalHtml('<a href="JaVaScRiPt:alert(1)">x</a>')).toBe('<a href="#">x</a>');
    expect(sanitizeJournalHtml('<a href="java\tscript:alert(1)">x</a>')).toBe('<a href="#">x</a>');
    expect(sanitizeJournalHtml('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com">x</a>',
    );
    expect(sanitizeJournalHtml('<img src="data:text/html;base64,AAAA">')).toBe('<img src="#">');
    expect(sanitizeJournalHtml('<img src="photo.png">')).toBe('<img src="photo.png">');
  });

  it('leaves ordinary formatting alone', () => {
    const formatted = '<p><strong>bold</strong> <em>italic</em> <u>under</u></p>';
    expect(sanitizeJournalHtml(formatted)).toBe(formatted);
  });

  it('keeps the inline colour and highlighting the editor writes', () => {
    const highlighted =
      '<p>keep <span style="background-color: rgba(253, 230, 138, 0.45)">this</span></p>';
    expect(sanitizeJournalHtml(highlighted)).toBe(highlighted);
    expect(sanitizeJournalHtml('<font color="#ff0000">red</font>')).toBe(
      '<font color="#ff0000">red</font>',
    );
  });

  it('drops the CSS that fetches or executes, and keeps the tag', () => {
    expect(sanitizeJournalHtml('<p style="background: url(https://tracker/x)">x</p>')).toBe(
      '<p>x</p>',
    );
    expect(sanitizeJournalHtml('<p style="width: expression(alert(1))">x</p>')).toBe('<p>x</p>');
    expect(sanitizeJournalHtml('<p style="behavior: url(x.htc)">x</p>')).toBe('<p>x</p>');
    expect(sanitizeJournalHtml('<p style="color: red">x</p>')).toBe('<p style="color: red">x</p>');
  });

  it('reads through entities before judging a URL', () => {
    expect(sanitizeJournalHtml('<a href="java&#115;cript:alert(1)">x</a>')).toBe('<a href="#">x</a>');
    expect(sanitizeJournalHtml('<a href="&#106;avascript:alert(1)">x</a>')).toBe('<a href="#">x</a>');
  });

  it('has nothing to do with an empty string', () => {
    expect(sanitizeJournalHtml('')).toBe('');
  });
});

describe('journal content: reading an entry as markup', () => {
  it('returns nothing for an entry with no words', () => {
    expect(journalHtml('')).toBe('');
    expect(journalHtml('   \n  ')).toBe('');
  });

  it('turns an old plain-text entry into paragraphs and keeps its line breaks', () => {
    expect(journalHtml('One line')).toBe('<p>One line</p>');
    expect(journalHtml('Line one\nLine two')).toBe('<p>Line one<br>Line two</p>');
    expect(journalHtml('First\n\nSecond')).toBe('<p>First</p><p>Second</p>');
    expect(journalHtml('First\r\n\r\n\r\nSecond')).toBe('<p>First</p><p>Second</p>');
  });

  it('escapes plain text rather than treating it as markup', () => {
    expect(journalHtml('5 < 6 & 7 > 6')).toBe('<p>5 &lt; 6 &amp; 7 &gt; 6</p>');
  });

  it('cleans markup it is handed', () => {
    expect(journalHtml('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>');
  });
});

describe('journal content: reading an entry as text', () => {
  it('passes plain text straight through', () => {
    expect(journalText('Line one\nLine two')).toBe('Line one\nLine two');
    expect(journalText('')).toBe('');
  });

  it('strips tags and turns block ends and breaks into line breaks', () => {
    expect(journalText('<p>One</p><p>Two</p>')).toBe('One\nTwo');
    expect(journalText('<p>One<br>Two</p>')).toBe('One\nTwo');
    expect(journalText('<ul><li>one</li><li>two</li></ul>')).toBe('one\ntwo');
    expect(journalText('<h1>Title</h1><p>Body</p>')).toBe('Title\nBody');
  });

  it('decodes entities and normalises the whitespace they leave behind', () => {
    expect(journalText('<p>Tom &amp; Jerry</p>')).toBe('Tom & Jerry');
    expect(journalText('<p>non&nbsp;breaking</p>')).toBe('non breaking');
    expect(journalText('<p>One</p><p></p><p></p><p>Two</p>')).toBe('One\n\nTwo');
    expect(journalText('<p>  padded  </p>')).toBe('padded');
  });

  it('drops the contents of script and style blocks', () => {
    expect(journalText('<p>safe</p><script>alert(1)</script>')).toBe('safe');
    expect(journalText('<style>.x{}</style><p>safe</p>')).toBe('safe');
  });

  it('reads a formatted entry as the words the writer wrote', () => {
    const words = journalText('<p><strong>Four</strong> words <em>right</em> here</p>');
    expect(countWords(words)).toBe(4);
  });
});

describe('journal content: counting and summarising', () => {
  it('counts words the way the analytics do', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
    expect(countWords('one')).toBe(1);
    expect(countWords('one two')).toBe(2);
    expect(countWords('  one   two  ')).toBe(2);
    expect(countWords('one\ntwo\tthree')).toBe(3);
  });

  it('flattens an entry for a list row without cutting a word in half', () => {
    expect(snippet('Short entry')).toBe('Short entry');
    expect(snippet('Line one\n\nLine two')).toBe('Line one Line two');
    expect(snippet('one two three', 20)).toBe('one two three');

    const long = 'word '.repeat(20).trim();
    expect(snippet(long, 20)).toBe('word word word word...');
    expect(snippet(long, 60).endsWith('...')).toBe(true);
  });
});
