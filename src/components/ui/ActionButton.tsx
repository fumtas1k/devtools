import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { colors, caption } from '@/utils/styles';

type Variant = 'default' | 'primary' | 'danger';

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

const bgMap: Record<Variant, string> = {
  default: colors.bgSubtle,
  primary: colors.primary,
  danger: 'transparent',
};
const colorMap: Record<Variant, string> = {
  default: colors.text,
  primary: colors.textOnPrimary,
  danger: colors.error,
};
const borderMap: Record<Variant, string> = {
  default: colors.borderInput,
  primary: colors.primary,
  danger: colors.error,
};

/**
 * 汎用アクションボタン。
 * - `variant`: 'default' | 'primary' | 'danger'
 * - `loading`: true のとき `aria-busy="true"` を付与し、disabled 状態にする
 * - ローディング中の子要素はそのまま表示するため、呼び出し元でローディング文言に切り替えること
 *   （例: `{loading ? '生成中…' : '生成'}`）
 * - `aria-*` など ButtonHTMLAttributes のほとんどの属性を渡せる
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
      className={`inline-flex items-center px-4 py-2 rounded-lg whitespace-nowrap font-semibold${isDisabled ? ' cursor-not-allowed' : ''}`}
      style={{
        ...caption,
        // caption の fontWeight: 400 を className `font-semibold` (= 600) と整合させるため明示上書き
        fontWeight: 600,
        border: `1px solid ${borderMap[variant]}`,
        background: isDisabled ? colors.bgSubtle : bgMap[variant],
        color: isDisabled ? colors.muted : colorMap[variant],
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
