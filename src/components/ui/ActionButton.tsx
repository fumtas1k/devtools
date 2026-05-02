import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { colors, caption } from '@/utils/styles';

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

const bgMap: Record<Variant, string> = {
  default: colors.bgSubtle,
  primary: colors.primary,
  secondary: 'transparent',
  danger: 'transparent',
};
const colorMap: Record<Variant, string> = {
  default: colors.text,
  primary: colors.textOnPrimary,
  secondary: colors.primary,
  danger: colors.error,
};
const borderMap: Record<Variant, string> = {
  default: colors.borderInput,
  primary: colors.primary,
  secondary: colors.primary,
  danger: colors.error,
};

// disabled 時の variant 別 styling。旧 DownloadButton の見た目を維持するため
// primary は border 不可視 (bg と同色)、secondary は背景透過 + グレーボーダーに上書きする。
const disabledBgMap: Record<Variant, string> = {
  default: colors.bgSubtle,
  primary: colors.bgSubtle,
  secondary: 'transparent',
  danger: colors.bgSubtle,
};
const disabledBorderMap: Record<Variant, string> = {
  default: colors.borderInput,
  primary: colors.bgSubtle,
  secondary: colors.border,
  danger: colors.error,
};

/**
 * 汎用アクションボタン。
 * - `variant`: 'default' | 'primary' | 'secondary' | 'danger'
 * - `loading`: true のとき `aria-busy="true"` を付与し、disabled 状態にする
 * - ローディング中の子要素はそのまま表示するため、呼び出し元でローディング文言に切り替えること
 *   （例: `{loading ? '生成中…' : '生成'}`）
 * - `disabled=true`: variant ごとに disabled 時の bg/border を上書き（primary は border 不可視・secondary は背景透過維持）
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
        border: `1px solid ${isDisabled ? disabledBorderMap[variant] : borderMap[variant]}`,
        background: isDisabled ? disabledBgMap[variant] : bgMap[variant],
        color: isDisabled ? colors.muted : colorMap[variant],
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
