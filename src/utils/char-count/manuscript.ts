import { countGraphemes, countGraphemesNoNewline } from './chars';

/** 400 字詰め原稿用紙換算 (改行は字数に含めない) */
export function countGenkoSheets(s: string): number {
  const g = countGraphemesNoNewline(s);
  return g === 0 ? 0 : Math.ceil(g / 400);
}

/** 空行区切りの段落数 */
export function countParagraphs(s: string): number {
  const normalized = s.replace(/\r\n|\r/g, '\n');
  return normalized.split(/\n\s*\n+/).filter((p) => p.trim().length > 0).length;
}

/** 推定読了時間 (日本語 600 字/分、最小 1 分) */
export function countReadingMinutes(s: string): number {
  const g = countGraphemes(s);
  return Math.max(1, Math.ceil(g / 600));
}

/** 英単語数の概算 */
export function countEnglishWords(s: string): number {
  return (s.match(/\b[a-zA-Z]+\b/g) ?? []).length;
}
