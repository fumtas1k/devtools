import { caption, elevation, colors } from '@/utils/styles';

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

export function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  layout = 'grid',
}: Props<T>) {
  return (
    <div
      className={`rounded-lg p-1 ${layout === 'grid' ? 'grid gap-1' : 'flex flex-wrap gap-1'}`}
      role="group"
      aria-label={ariaLabel}
      style={{
        background: colors.bgSubtle,
        ...(layout === 'grid'
          ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }
          : {}),
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`rounded-lg whitespace-nowrap transition-colors ${size === 'sm' ? 'px-2.5 py-0.5' : 'px-3 py-1.5'}`}
          style={{
            ...caption,
            fontWeight: 600,
            background: value === opt.value ? colors.bg : 'transparent',
            color: value === opt.value ? colors.text : colors.muted,
            boxShadow: value === opt.value ? elevation.level2 : 'none',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
