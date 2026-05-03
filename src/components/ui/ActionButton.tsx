import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'default' | 'primary' | 'secondary' | 'danger';

interface Props extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'style' | 'className'
> {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  variant?: Variant;
  loading?: boolean;
}

/**
 * 汎用アクションボタン。
 * - `variant`: 'default' | 'primary' | 'secondary' | 'danger'
 * - `loading`: true のとき `aria-busy="true"` を付与し、disabled 状態にする
 * - ローディング中の子要素はそのまま表示するため、呼び出し元でローディング文言に切り替えること
 *   （例: `{loading ? '生成中…' : '生成'}`）
 * - `disabled=true`: variant ごとに disabled 時の bg/border を CSS `:disabled` 擬似で上書き
 *   （primary は border 不可視・secondary は背景透過維持）
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
  ...rest
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading ? 'true' : undefined}
      className={`caption font-semibold inline-flex items-center px-4 py-2 rounded-lg whitespace-nowrap btn-action btn-action--${variant}`}
      {...rest}
    >
      {children}
    </button>
  );
}
