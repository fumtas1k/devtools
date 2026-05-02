import type { InputHTMLAttributes } from 'react';
import { caption, colors } from '@/utils/styles';

interface Props extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'style' | 'className'
> {
  value: string;
  onChange: (value: string) => void;
  /** エラー状態のときボーダー色を error に変更する */
  error?: boolean;
  /** monospace フォントを使用する */
  mono?: boolean;
  /** カスタム className（flexbox 内の幅制御などに使用） */
  className?: string;
}

/**
 * ラベル無し・グリッド配置向けの薄い `<input>` コンポーネント。
 *
 * - `InputField` はラベル前提のため、ラベル不要のグリッド内 input はこちらを使う
 * - `outline: none` を component base から外し、global CSS の `:focus-visible` に委ねる（a11y 向上）
 */
export function BareInput({
  value,
  onChange,
  error = false,
  mono = false,
  className,
  ...rest
}: Props) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      style={{
        ...caption,
        ...(mono ? { fontFamily: 'monospace' } : {}),
        padding: '0.4rem 0.5rem',
        borderRadius: '0.375rem',
        border: `1px solid ${error ? colors.error : colors.borderInput}`,
        background: colors.bg,
        color: colors.text,
        width: '100%',
      }}
      {...rest}
    />
  );
}
