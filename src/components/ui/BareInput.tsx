import type { InputHTMLAttributes } from 'react';

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
 * style: global.css `@layer components` の `.caption` / `.bg-default` / `.text-default` /
 * `.border-input` / `.border-error` (Tailwind auto-utility from --color-error in @theme) を参照。
 */
export function BareInput({
  value,
  onChange,
  error = false,
  mono = false,
  className,
  ...rest
}: Props) {
  const borderClass = error ? 'border-error' : 'border-input';
  const monoClass = mono ? 'font-mono' : '';
  const extraClass = className ?? '';
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`caption rounded-md border ${borderClass} ${monoClass} bg-default text-default w-full px-2 py-1.5 ${extraClass}`.trim()}
      {...rest}
    />
  );
}
