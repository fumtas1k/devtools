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
  return { display: s.slice(0, max), truncated: true };
}
