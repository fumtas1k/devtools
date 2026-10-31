import { useDynamicStyleSheet } from '@/hooks/useDynamicStyleSheet';
import { cx } from '@/utils/cx';

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
  /**
   * 横に並ぶ入力欄・ボタン（48px）と土台の高さをそろえる。
   * md の土台は 46px のため、そのままだと 2px 低い。ボタンは 36px のまま中央に置き、
   * 土台だけ 48px にする（`size="md"` のときだけ効く。docs/decisions.md [151]）
   */
  matchField?: boolean;
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
  matchField = false,
}: Props<T>) {
  const isWrap = layout === 'wrap';
  const dynClassName = useDynamicStyleSheet((className) =>
    isWrap ? '' : `.${className} { --toggle-cols: ${options.length}; }`
  );

  const fieldHeightClass = matchField && size === 'md' ? 'min-h-12 content-center' : '';
  const containerClass = isWrap
    ? cx(
        'bg-subtle rounded-md border border-input p-1 flex flex-wrap gap-1 w-max max-w-full',
        fieldHeightClass
      )
    : cx(
        'bg-subtle rounded-md border border-input p-1 toggle-grid',
        dynClassName,
        fieldHeightClass
      );
  // md: DADS の sm ボタン相当（高さ 36px・16px Bold）、sm: xs 相当（28px・14px Bold）。
  // 土台の角丸 8px から枠 1px と余白 4px を引いた内側のボタンは rounded-sm（4px）にする
  const buttonSizeClass = size === 'sm' ? 'min-h-7 px-3 text-sm' : 'min-h-9 px-4 text-base';

  return (
    <div className={containerClass} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={cx(
            'inline-flex items-center justify-center font-bold leading-none btn-toggle rounded-sm whitespace-nowrap',
            buttonSizeClass
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
