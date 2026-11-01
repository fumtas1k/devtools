import type { CountResult } from './types';

/** SSR と空入力用。count('') と同じ値を重い集計モジュールを読まずに使う。 */
export const EMPTY_COUNT_RESULT: CountResult = {
  chars: {
    utf16Length: 0,
    codePoints: 0,
    graphemes: 0,
    graphemesNoNewline: 0,
    graphemesNoWhitespace: 0,
    weightedWidth: 0,
  },
  bytes: {
    utf8: { ok: true, bytes: 0, failedCount: 0 },
    utf8Bmp: { ok: true, bytes: 0, failedCount: 0 },
    utf16: { ok: true, bytes: 0, failedCount: 0 },
    sjis: { ok: true, bytes: 0, failedCount: 0 },
    eucjp: { ok: true, bytes: 0, failedCount: 0 },
  },
  lines: {
    total: 0,
    nonEmpty: 0,
    longestGraphemes: 0,
    newline: 'none',
    counts: { lf: 0, crlf: 0, cr: 0 },
  },
  sns: { twitterWeight: 0, blueskyCount: 0 },
  manuscript: { genkoSheets: 0, paragraphs: 0, readingMinutes: 1, englishWords: 0 },
  meta: { inputLength: 0, large: false, truncated: false },
};
