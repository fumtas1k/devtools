import { caption, colors, shadows } from '@/utils/styles';

interface Option<T> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

export function ToggleGroup<T extends string>({ options, value, onChange, ariaLabel }: Props<T>) {
  return (
    <div
      className="grid gap-1 rounded-lg p-1"
      role="group"
      aria-label={ariaLabel}
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)`, background: colors.bgSubtle }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className="rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors"
          style={{
            ...caption,
            fontWeight: 600,
            background: value === opt.value ? colors.bg : 'transparent',
            color: value === opt.value ? colors.text : colors.muted,
            boxShadow: value === opt.value ? shadows.tab : 'none',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
