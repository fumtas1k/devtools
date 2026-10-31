import type { InputHTMLAttributes } from 'react';
import { cx } from '@/utils/cx';

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
 *
 * style: global.css `@layer components` の `.field-control`（DADS の Input。docs/decisions.md [143]）。
 * エラー時は `aria-invalid="true"` で枠が error 色になる。
 */
export function BareInput({
  value,
  onChange,
  error = false,
  mono = false,
  className,
  ...rest
}: Props) {
  const monoClass = mono ? 'font-mono' : '';
  const extraClass = className ?? '';
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={error || undefined}
      className={cx('field-control', monoClass, extraClass)}
      {...rest}
    />
  );
}
