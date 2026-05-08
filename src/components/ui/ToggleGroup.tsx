import { useDynamicStyleSheet } from '@/hooks/useDynamicStyleSheet';

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
 * 動的列数は `useDynamicStyleSheet` 経由で per-instance scoped rule
 * (`.dyn-XXX { --toggle-cols: N; }`) として注入する。`setProperty` 経由 inline
 * style は CSP3 `style-src` 制約に抵触するため不採用 (`docs/decisions.md [067]`)。
 * `layout='wrap'` 時は dynamic rule 不要 (`.toggle-grid` 自体が unused) のため
 * sheet 生成を skip する。
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
  const dynClassName = useDynamicStyleSheet((className) =>
    isWrap ? '' : `.${className} { --toggle-cols: ${options.length}; }`
  );

  const containerClass = isWrap
    ? 'bg-subtle rounded-lg border border-input p-1 flex flex-wrap gap-1 w-max max-w-full'
    : `bg-subtle rounded-lg border border-input p-1 toggle-grid ${dynClassName}`;
  const buttonSizeClass = size === 'sm' ? 'px-2.5 py-0.5' : 'px-3 py-1.5';

  return (
    <div className={containerClass} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
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
