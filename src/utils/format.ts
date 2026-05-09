/**
 * 数値の表示用フォーマッタ
 */

const KB = 1024;
const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

/**
 * バイト数を人間が読める形式（B / KB / MB / GB）にフォーマットする。
 *
 * 境界:
 * - `< 1024`        → `${n} B`
 * - `< 1024**2`     → `${n/1024} KB`（小数 1 桁）
 * - `< 1024**3`     → `${n/1024**2} MB`（小数 1 桁）
 * - それ以上        → `${n/1024**3} GB`（小数 1 桁）
 *
 * 負の数や非整数は呼び出し側で防ぐ前提（バリデーションメッセージ・ファイルサイズ表示用途）。
 */
export function formatBytes(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / GB).toFixed(1)} GB`;
}
