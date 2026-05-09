import type { CountResult } from './types';
import {
  countUtf16Length,
  countCodePoints,
  countGraphemes,
  countGraphemesNoNewline,
  countGraphemesNoWhitespace,
} from './chars';
import { checkUtf8, checkUtf8Bmp, checkUtf16, checkSjis, checkEucJp } from './encodings';
import { analyzeLines } from './lines';
import { twitterWeight, blueskyCount } from './sns';
import {
  countGenkoSheets,
  countParagraphs,
  countReadingMinutes,
  countEnglishWords,
} from './manuscript';

const LARGE_THRESHOLD = 1_000_000;

export function count(s: string): CountResult {
  return {
    chars: {
      utf16Length: countUtf16Length(s),
      codePoints: countCodePoints(s),
      graphemes: countGraphemes(s),
      graphemesNoNewline: countGraphemesNoNewline(s),
      graphemesNoWhitespace: countGraphemesNoWhitespace(s),
    },
    bytes: {
      utf8: checkUtf8(s),
      utf8Bmp: checkUtf8Bmp(s),
      utf16: checkUtf16(s),
      sjis: checkSjis(s),
      eucjp: checkEucJp(s),
    },
    lines: analyzeLines(s),
    sns: {
      twitterWeight: twitterWeight(s),
      blueskyCount: blueskyCount(s),
    },
    manuscript: {
      genkoSheets: countGenkoSheets(s),
      paragraphs: countParagraphs(s),
      readingMinutes: countReadingMinutes(s),
      englishWords: countEnglishWords(s),
    },
    meta: {
      inputLength: s.length,
      large: s.length > LARGE_THRESHOLD,
      truncated: false,
    },
  };
}

export type { CountResult } from './types';
