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
    // matchAll の RegExpMatchArray.index は実装上常に number だが TS 型は ?: number のため
    // defensive に nullish coalesce する (実害なし)
    const start = m.index ?? 0;
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

// X (Twitter) v3 config: emojiParsingEnabled=true
// 絵文字 grapheme cluster は構成コードポイント数に関わらず単一 weight-2 ユニットとして扱う
const snsSegmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
const SKIN_TONE_RE = /[\u{1F3FB}-\u{1F3FF}]/u;

/**
 * grapheme cluster が絵文字シーケンスかどうか判定する。
 *
 * 単一コードポイントは weight ranges で処理するため false を返す:
 * - BMP 記号 (© U+00A9) → weight-1 range で weight 1 のまま
 * - SMP 絵文字 (😀 U+1F600) → weight 2 のまま（結果に変化なし）
 *
 * 複数コードポイントで以下を含む場合は絵文字クラスタ:
 * - U+FE0F (VS16): ❤️, ☺️ など
 * - U+200D (ZWJ): 家族絵文字 👨‍👩‍👧‍👦 など
 * - U+20E3 (COMBINING ENCLOSING KEYCAP): 1️⃣ など
 * - U+1F3FB–U+1F3FF (skin tone modifiers): 👋🏽 など
 * - 先頭が Regional Indicator (U+1F1E0–U+1F1FF): 🇯🇵 など
 */
function isEmojiCluster(cluster: string): boolean {
  if ([...cluster].length === 1) return false;
  const cp0 = cluster.codePointAt(0) ?? 0;
  return (
    cluster.includes('️') || // VS16: ❤️, ☺️ など
    cluster.includes('‍') || // ZWJ: 👨‍👩‍👧‍👦 など
    cluster.includes('⃣') || // COMBINING ENCLOSING KEYCAP: 1️⃣
    SKIN_TONE_RE.test(cluster) ||
    (cp0 >= 0x1f1e0 && cp0 <= 0x1f1ff) // Regional Indicator pair: 🇯🇵
  );
}

function weightSegment(segment: string): number {
  let w = 0;
  for (const { segment: cluster } of snsSegmenter.segment(segment)) {
    if (isEmojiCluster(cluster)) {
      w += 2;
    } else {
      for (const ch of cluster) {
        // for...of は string を code point 単位で iterate するため codePointAt(0) は必ず定義済み
        w += isWeightOne(ch.codePointAt(0)!) ? 1 : 2;
      }
    }
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
