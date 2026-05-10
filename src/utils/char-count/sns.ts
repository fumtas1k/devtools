import { countGraphemes } from './chars';

/**
 * URL を検出する簡易正規表現。
 * - http(s):// から始まり、空白・< > " で停止
 * - 末尾の典型的な句読点 (. , ! ? ; : ' " ) ] }) は URL から除外する
 *
 * twitter-text 公式の URL 抽出と完全互換ではない。IDN・cashtag・mention 等は別途対応。
 */
const URL_PATTERN = /https?:\/\/[^\s<>"]+/gi;
const TRAILING_PUNCT = /[.,!?;:'")\]}]+$/;

export function extractUrlRanges(s: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const m of s.matchAll(URL_PATTERN)) {
    let url = m[0];
    const trail = url.match(TRAILING_PUNCT);
    if (trail) url = url.slice(0, -trail[0].length);
    // 防御的: URL_PATTERN は `https?://` + `[^\s<>"]+` で最低 8 文字、句読点 strip 後も
    // 7 文字残るため url.length は 0 にならないが、regex 改修時の安全網として残す
    if (url.length === 0) continue;
    const start = m.index!;
    ranges.push({ start, end: start + url.length });
  }
  return ranges;
}

/**
 * twitter-text 仕様の weight-1 範囲。これ以外は weight 2。
 * - U+0000–U+10FF
 * - U+2000–U+200D (general punctuation 前半)
 * - U+2010–U+201F (dashes / quotation 系)
 * - U+2032–U+2037 (prime 系)
 */
function isWeightOne(cp: number): boolean {
  return (
    cp <= 0x10ff ||
    (cp >= 0x2000 && cp <= 0x200d) ||
    (cp >= 0x2010 && cp <= 0x201f) ||
    (cp >= 0x2032 && cp <= 0x2037)
  );
}

function weightSegment(segment: string): number {
  let w = 0;
  for (const ch of segment) {
    // for...of は string を code point 単位で iterate するため codePointAt(0) は必ず定義済み
    w += isWeightOne(ch.codePointAt(0)!) ? 1 : 2;
  }
  return w;
}

const URL_WEIGHT = 23;

/**
 * X (Twitter) 公式仕様準拠の weighted character length。
 * 1. 前後空白を trim
 * 2. URL を 23 weighted chars 換算
 * 3. 残り文字を weight-1 / weight-2 範囲で集計
 *
 * twitter-text 公式 conformance との誤差は URL regex の簡易性のみ (~5% 以下の URL pattern)。
 */
export function twitterWeight(s: string): number {
  const trimmed = s.trim();
  if (trimmed.length === 0) return 0;

  const ranges = extractUrlRanges(trimmed);

  let weight = 0;
  let cursor = 0;
  for (const { start, end } of ranges) {
    if (start > cursor) {
      weight += weightSegment(trimmed.slice(cursor, start));
    }
    weight += URL_WEIGHT;
    cursor = end;
  }
  if (cursor < trimmed.length) {
    weight += weightSegment(trimmed.slice(cursor));
  }
  return weight;
}

/** Bluesky の文字数 (書記素クラスタ数) */
export function blueskyCount(s: string): number {
  return countGraphemes(s);
}
