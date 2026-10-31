import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { COMPACT_BUTTON_SHAPE_CLASSES } from './_compactButton';
import { cx } from '@/utils/cx';

type Variant = 'default' | 'primary' | 'secondary' | 'danger' | 'text';
type Size = 'default' | 'compact';

interface Props extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'style' | 'className'
> {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  variant?: Variant;
  loading?: boolean;
  /**
   * 高さプリセット（DADS Button のサイズ）。角丸は両サイズとも SIZE_CLASS 経由で供給し、
   * base className には持たせない（issue #320: 共有定数を角丸の単一の真実源にするため）。
   * - 'default'（既定）: DADS の md。高さ 48px・最小幅 96px・角丸 8px・16px Bold・行高 1
   * - 'compact': DADS の sm（COMPACT_BUTTON_SHAPE_CLASSES）。高さ 36px・最小幅 80px・角丸 6px。
   *   CopyButton (default) と同じ高さ・角丸（issue #320 で統一）
   */
  size?: Size;
}

const SIZE_CLASS: Record<Size, string> = {
  default: 'min-h-12 min-w-24 px-4 py-2 rounded-md text-base font-bold leading-none',
  compact: COMPACT_BUTTON_SHAPE_CLASSES,
};

/**
 * 汎用アクションボタン（DADS Button。docs/decisions.md [140]）。
 * - `variant`: 'primary'（solid-fill。主要操作）/ 'secondary'・'default'（outline。副次操作）/
 *   'text'（軽い操作）/ 'danger'（outline を error 色にしたもの）
 * - `size`: 'default' | 'compact'（'compact' は CopyButton と同じ高さ・角丸に揃える）
 * - `loading`: true のとき `aria-busy="true"` を付与し、disabled 状態にする
 * - ローディング中の子要素はそのまま表示するため、呼び出し元でローディング文言に切り替えること
 *   （例: `{loading ? '生成中…' : '生成'}`）
 * - `disabled=true`: variant ごとに disabled 時の色を CSS `:disabled` 擬似で上書き
 *   （primary は solid-gray-300 の塗り、outline / danger / text は solid-gray-300 の文字と枠）
 * - `aria-*` など ButtonHTMLAttributes のほとんどの属性を渡せる
 *
 * style: global.css `@layer components` の `.btn-action` / `.btn-action--{variant}` を参照。
 */
export function ActionButton({
  onClick,
  disabled,
  children,
  variant = 'default',
  loading = false,
  size = 'default',
  ...rest
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading ? 'true' : undefined}
      className={cx(
        'inline-flex items-center justify-center whitespace-nowrap btn-action',
        `btn-action--${variant}`,
        SIZE_CLASS[size]
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
