import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { COMPACT_BUTTON_SHAPE_CLASSES } from './_compactButton';

type Variant = 'default' | 'primary' | 'secondary' | 'danger';
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
   * 高さプリセット。
   * - 'default'（既定）: `font-semibold px-4 py-2`、`caption` の line-height 1.7 を継承
   * - 'compact': COMPACT_BUTTON_SHAPE_CLASSES（rounded-lg / font-bold / px-3 py-2 / leading-none）、
   *   CopyButton (default) と同じ高さ・角丸（issue #320 で統一）
   */
  size?: Size;
}

const SIZE_CLASS: Record<Size, string> = {
  default: 'font-semibold px-4 py-2',
  compact: COMPACT_BUTTON_SHAPE_CLASSES,
};

/**
 * 汎用アクションボタン。
 * - `variant`: 'default' | 'primary' | 'secondary' | 'danger'
 * - `size`: 'default' | 'compact'（'compact' は CopyButton と同じ高さ・角丸に揃える）
 * - `loading`: true のとき `aria-busy="true"` を付与し、disabled 状態にする
 * - ローディング中の子要素はそのまま表示するため、呼び出し元でローディング文言に切り替えること
 *   （例: `{loading ? '生成中…' : '生成'}`）
 * - `disabled=true`: variant ごとに disabled 時の bg/border を CSS `:disabled` 擬似で上書き
 *   （primary は border 不可視・secondary/danger は中立グレーボーダーに統一）
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
      className={`caption inline-flex items-center rounded-lg whitespace-nowrap btn-action btn-action--${variant} ${SIZE_CLASS[size]}`}
      {...rest}
    >
      {children}
    </button>
  );
}
