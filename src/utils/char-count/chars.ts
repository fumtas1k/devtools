// 'ja' を選ぶ主目的は東アジア文字前提だが、書記素分割は locale 非依存に近い
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

/**
 * 半角文字を 0.5、全角文字を 1 として計算した文字数（書記素ベース）。
 * 半角判定: ASCII 印刷可能 (U+0020–U+007E) + 半角カタカナ (U+FF61–U+FF9F)
 */
export function countWeightedWidth(s: string): number {
  if (s.length === 0) return 0;
  let total = 0;
  for (const { segment } of segmenter.segment(s)) {
    const cp = segment.codePointAt(0) ?? 0;
    const isHalfWidth = (cp >= 0x0020 && cp <= 0x007e) || (cp >= 0xff61 && cp <= 0xff9f);
    total += isHalfWidth ? 0.5 : 1;
  }
  return total;
}
