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

/** options.length を 1–5 にクランプして toggle-cols-N クラスを返す */
function getColsClass(count: number): string {
  const clamped = Math.min(Math.max(count, 1), 5);
  return `toggle-cols-${clamped}`;
}

export function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  layout = 'grid',
}: Props<T>) {
  const isWrap = layout === 'wrap';

  return (
    <div
      className={`rounded-lg p-1 bg-subtle border-input ${
        isWrap
          ? 'flex flex-wrap gap-1 w-max max-w-full'
          : `grid gap-1 ${getColsClass(options.length)}`
      }`}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`rounded-lg whitespace-nowrap transition-colors caption font-semibold ${
            size === 'sm' ? 'px-2.5 py-0.5' : 'px-3 py-1.5'
          } ${
            value === opt.value
              ? 'bg-token text-token shadow-elevation-2'
              : 'bg-transparent text-muted'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
