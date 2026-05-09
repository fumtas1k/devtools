const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });

export function countUtf16Length(s: string): number {
  return s.length;
}

export function countCodePoints(s: string): number {
  return [...s].length;
}

export function countGraphemes(s: string): number {
  if (s.length === 0) return 0;
  return [...segmenter.segment(s)].length;
}

/** 全角スペース (U+3000) も除去する */
export function countGraphemesNoNewline(s: string): number {
  return countGraphemes(s.replace(/[\r\n]/g, ''));
}

/** 改行・半角/全角空白・タブを除去してから計算 */
export function countGraphemesNoWhitespace(s: string): number {
  // \s は半角空白・タブ・改行を含む。全角スペース U+3000 は \s に含まれない
  return countGraphemes(s.replace(/[\s　]/g, ''));
}
