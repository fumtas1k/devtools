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

const variantClass: Record<Variant, string> = {
  default: 'btn-action--default',
  primary: 'btn-action--primary',
  secondary: 'btn-action--secondary',
  danger: 'btn-action--danger',
};

/**
 * 汎用アクションボタン。
 * - `variant`: 'default' | 'primary' | 'secondary' | 'danger'
 * - `loading`: true のとき `aria-busy="true"` を付与し、disabled 状態にする
 * - disabled 状態の bg/border の variant 別上書きは global.css の
 *   `.btn-action--<variant>:disabled` で表現
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
      className={`inline-flex items-center px-4 py-2 rounded-lg whitespace-nowrap font-semibold caption ${
        variantClass[variant]
      }${isDisabled ? ' cursor-not-allowed' : ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}
