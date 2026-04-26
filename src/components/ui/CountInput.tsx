import { useCallback } from 'react';
import { bodyEmphasis, caption, colors } from '@/utils/styles';
import { useClampedInput } from '@/hooks/useClampedInput';

interface Props {
  id: string;
  label?: string;
  min?: number;
  max?: number;
  defaultValue?: number;
  buttonLabel?: string;
  onGenerate: (count: number) => void;
}

export function CountInput({
  id,
  label = '生成数',
  min = 1,
  max = 100,
  defaultValue = 1,
  buttonLabel = '生成',
  onGenerate,
}: Props) {
  const { value, inputStr, handleChange, handleBlur } = useClampedInput(defaultValue, min, max);

  const handleGenerate = useCallback(() => {
    onGenerate(value);
  }, [value, onGenerate]);

  return (
    <div>
      <label
        htmlFor={id}
        style={{ ...bodyEmphasis, color: colors.text, display: 'block', marginBottom: '0.25rem' }}
      >
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          value={inputStr}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleBlur();
              handleGenerate();
            }
          }}
          className="rounded-lg px-3 py-2"
          style={{
            ...caption,
            width: '6rem',
            border: `1px solid ${colors.borderInput}`,
            outline: 'none',
            background: colors.bg,
            color: colors.text,
          }}
          aria-describedby={`${id}-hint`}
        />
        <button
          onClick={handleGenerate}
          className="rounded-lg px-4 py-2 transition-colors"
          style={{
            ...caption,
            fontWeight: 600,
            background: colors.primary,
            color: colors.textOnPrimary,
            border: 'none',
          }}
        >
          {buttonLabel}
        </button>
      </div>
      <p id={`${id}-hint`} style={{ ...caption, color: colors.muted, marginTop: '0.25rem' }}>
        {min}〜{max}
      </p>
    </div>
  );
}
