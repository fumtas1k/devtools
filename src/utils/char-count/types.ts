export interface EncodingCompat {
  ok: boolean;
  /** ok=true のときのバイト数。不可なら null (?置換 byte を出さない) */
  bytes: number | null;
  failedCount: number;
}

export interface LineStats {
  total: number;
  nonEmpty: number;
  longestGraphemes: number;
  newline: 'lf' | 'crlf' | 'cr' | 'mixed' | 'none';
  counts: { lf: number; crlf: number; cr: number };
}

export interface CountResult {
  chars: {
    utf16Length: number;
    codePoints: number;
    graphemes: number;
    graphemesNoNewline: number;
    graphemesNoWhitespace: number;
    /** 半角=0.5、全角=1 で計算した文字数 */
    weightedWidth: number;
  };
  bytes: {
    utf8: EncodingCompat;
    utf8Bmp: EncodingCompat;
    utf16: EncodingCompat;
    sjis: EncodingCompat;
    eucjp: EncodingCompat;
  };
  lines: LineStats;
  sns: {
    twitterWeight: number;
    blueskyCount: number;
  };
  manuscript: {
    genkoSheets: number;
    paragraphs: number;
    readingMinutes: number;
    englishWords: number;
  };
  meta: {
    inputLength: number;
    /** 1MB 超で true */
    large: boolean;
    truncated: boolean;
  };
}
