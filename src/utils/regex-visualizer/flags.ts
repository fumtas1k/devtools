/**
 * regexp-tree / recheck が未対応のフラグを除去して返す。
 * 'd'（hasIndices, ES2022）は両ライブラリが未対応のため除外する。
 * AST 構造・ReDoS 解析には影響しない metadata フラグのため除去して渡して問題ない。
 */
export function stripUnsupportedFlags(flags: string): string {
  return [...flags].filter((f) => f !== 'd').join('');
}
