/**
 * className を組み立てる小さなヘルパー。
 * falsy 値（false / null / undefined / '' / 0）を除去し、残りを単一スペースで結合する。
 * template literal + `.trim()` 方式で発生していた連続空白・前後空白を防ぐ（issue #260）。
 *
 * @example
 * cx('btn', isActive && 'is-active', className)
 */
export type ClassValue = string | number | false | null | undefined;

export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
