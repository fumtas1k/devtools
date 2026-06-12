/**
 * Shannon エントロピー計算。
 * テキストの各文字の出現頻度から情報エントロピー（bits/char）を求める。
 */

/**
 * 文字列の Shannon エントロピー（bits/char）を計算して返す。
 * 空文字列の場合は 0 を返す。
 *
 * エントロピーが高いほどランダム性が高く、
 * API キーやトークン等の機密情報である可能性が高い。
 */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const c of s) {
    freq.set(c, (freq.get(c) ?? 0) + 1);
  }
  let entropy = 0;
  const len = s.length;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
