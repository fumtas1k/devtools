import { useEffect, useRef } from 'react';

interface Option<T> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  ariaLabel?: string;
  /** ボタンサイズ。デフォルトは `md` */
  size?: 'sm' | 'md';
  /** `grid`: 等幅グリッド（デフォルト）。`wrap`: flex-wrap で自然幅 */
  layout?: 'grid' | 'wrap';
}

/**
 * 排他選択トグル。
 *
 * style: global.css `@layer components` の `.toggle-grid`（CSS 変数 --toggle-cols 経由で
 * 動的列数）/ `.btn-toggle` / `.btn-toggle[aria-pressed="true"]` を参照。
 *
 * 動的列数は `setProperty('--toggle-cols', N)` で CSS 変数を注入する。これは CSSOM API 経由の
 * 設定で、属性直接代入（`gridTemplateColumns` への直接代入）ではないため CSP3 strict 下でも許容される。
 */
export function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  layout = 'grid',
}: Props<T>) {
  const isWrap = layout === 'wrap';
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isWrap && gridRef.current) {
      gridRef.current.style.setProperty('--toggle-cols', String(options.length));
    }
  }, [isWrap, options.length]);

  const containerClass = isWrap
    ? 'bg-subtle rounded-lg border border-input p-1 flex flex-wrap gap-1 w-max max-w-full'
    : 'bg-subtle rounded-lg border border-input p-1 toggle-grid';
  const buttonSizeClass = size === 'sm' ? 'px-2.5 py-0.5' : 'px-3 py-1.5';

  return (
    <div ref={gridRef} className={containerClass} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`caption font-semibold btn-toggle rounded-lg whitespace-nowrap ${buttonSizeClass}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
