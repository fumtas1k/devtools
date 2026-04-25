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
    <div style={{ position: 'relative' }}>
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
          appearance: 'none',
          paddingRight: '2.5rem',
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: '0.75rem',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: colors.muted,
        }}
      >
        <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
