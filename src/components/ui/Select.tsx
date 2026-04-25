import { caption, colors, onFocusRing, onBlurRing } from '@/utils/styles';

interface Option<T> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  id?: string;
}

export function Select<T extends string>({ options, value, onChange, ariaLabel, id }: Props<T>) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      aria-label={ariaLabel}
      onFocus={onFocusRing}
      onBlur={onBlurRing}
      className="rounded-lg px-3 py-2 w-full"
      style={{
        ...caption,
        border: `1px solid ${colors.borderInput}`,
        background: colors.bg,
        color: colors.text,
        appearance: 'auto',
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
