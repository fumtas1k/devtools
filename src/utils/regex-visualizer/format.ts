// 攻撃文字列など表示用の整形ヘルパー（純粋関数のみ）。
// recheck / regexp-tree（CJS）に依存しないため client component から静的 import しても
// SSR module graph を汚さない（redos.ts / parse.ts を値 import すると CJS が SSR で評価され落ちる）。

/** 攻撃文字列の表示上限文字数（pump 文字列は長大なため UI ではここで truncate する） */
export const ATTACK_STRING_DISPLAY_MAX = 200;

/**
 * 攻撃文字列を表示用に truncate する。
 * 多項式時間の脆弱性では pump 文字列が数千文字になりページが極端に縦長になるため、
 * 先頭 max 文字のみ表示する。全文は呼び出し側がコピー用に元文字列を保持する。
 */
export function truncateAttackString(
  s: string,
  max = ATTACK_STRING_DISPLAY_MAX
): { display: string; truncated: boolean } {
  if (s.length <= max) return { display: s, truncated: false };
  // 切り出し位置（max-1）が代理対の前半（上位サロゲート）だと、相方が max 以降にあり
  // 孤立サロゲート → U+FFFD 表示になる。その 1 コード単位だけ削って表示崩れを防ぐ
  // （max は UTF-16 長の上限のまま維持。u フラグ + アストラル文字を含むパターン対策）。
  const end = isHighSurrogate(s.charCodeAt(max - 1)) ? max - 1 : max;
  return { display: s.slice(0, end), truncated: true };
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
