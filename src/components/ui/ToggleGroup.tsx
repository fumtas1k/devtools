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
 * style: `src/styles/components/button.css`（`@layer components`）の `.toggle-grid` / `.btn-toggle` /
 * `.btn-toggle[aria-pressed="true"]` を参照。
 *
 * `layout='grid'` の列数は常に選択肢の数（全ボタンを等幅で 1 行に並べる）なので、
 * `.toggle-grid` が `grid-auto-flow: column` + `grid-auto-columns: minmax(0, 1fr)` で受ける。
 * 列数を動的な値で渡さないため、動的スタイルシートも inline style も要らない
 * （`style-src` に `'unsafe-inline'` が無い本番 CSP でそのまま通る。`docs/decisions.md [166]`）。
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
  const fieldHeightClass = matchField && size === 'md' ? 'min-h-12 content-center' : '';
  const containerClass = isWrap
    ? cx(
        'bg-subtle rounded-md border border-input p-1 flex flex-wrap gap-1 w-max max-w-full',
        fieldHeightClass
      )
    : cx('bg-subtle rounded-md border border-input p-1 toggle-grid', fieldHeightClass);
  // md: DADS の sm ボタン相当（高さ 36px・16px Bold）、sm: xs 相当（28px・14px Bold）。
  // 土台の角丸 8px から枠 1px と余白 4px を引いた内側のボタンは rounded-sm（4px）にする
  const buttonSizeClass =
    size === 'sm' ? 'min-h-7 min-w-11 px-3 text-sm' : 'min-h-9 px-4 text-base';

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
