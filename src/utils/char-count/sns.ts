import { countGraphemes } from './chars';

/**
 * Twitter (X) 文字数の概算。
 * 公式ルール (URL 短縮 23 字、Combining Mark 0 weight 等) は非対応。
 * U+0000–U+10FF の code point = weight 1、それ以外 = weight 2。
 */
export function twitterWeight(s: string): number {
  let weight = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    weight += cp <= 0x10ff ? 1 : 2;
  }
  return weight;
}

/** Bluesky の文字数 (書記素クラスタ数) */
export function blueskyCount(s: string): number {
  return countGraphemes(s);
}
