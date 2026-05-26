import { checkSync } from 'recheck';

export type RedosStatus = 'safe' | 'vulnerable' | 'unknown';

export interface RedosResult {
  status: RedosStatus;
  /** vulnerable のとき: 攻撃文字列 */
  attackString?: string;
  /** vulnerable のとき: 複雑度の日本語表記 */
  complexity?: string;
  /** vulnerable のとき: pattern 内の危険箇所オフセット範囲 */
  hotspot?: { start: number; end: number }[];
  /** unknown のとき: 理由（timeout 等） */
  reason?: string;
}

function complexityLabel(c: { type: string; degree?: number }): string {
  if (c.type === 'exponential') return '指数時間（exponential）';
  if (c.type === 'polynomial') return `多項式時間（${c.degree ?? '?'} 次）`;
  return c.type;
}

/**
 * pattern + flags の ReDoS 脆弱性を判定する（同期）。
 * recheck checkSync の Diagnostics を 安全 / 脆弱 / 不明 の 3 状態へ正規化する。
 * timeout（メインスレッド占有の上限）を渡し、timeout 時は unknown とする。
 * 「不明」を「安全」と混同しないこと（呼び出し側 UI も区別表示する）。
 */
export function analyzeRedos(pattern: string, flags: string): RedosResult {
  const d = checkSync(pattern, flags, { timeout: 1000 });
  switch (d.status) {
    case 'vulnerable':
      return {
        status: 'vulnerable',
        attackString: d.attack.string,
        complexity: complexityLabel(d.complexity),
        hotspot: d.hotspot.map((h) => ({ start: h.start, end: h.end })),
      };
    case 'safe':
      return { status: 'safe' };
    default:
      return { status: 'unknown', reason: d.error.kind };
  }
}
