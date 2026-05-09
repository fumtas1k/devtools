import { useCallback } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
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
      <label htmlFor={id} className="body-emphasis text-default block mb-1">
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
          className="caption w-24 rounded-lg border border-input bg-default text-default px-3 py-2"
          aria-describedby={`${id}-hint`}
        />
        <ActionButton onClick={handleGenerate} variant="primary">
          {buttonLabel}
        </ActionButton>
      </div>
      <p id={`${id}-hint`} className="caption text-muted mt-1">
        {min}〜{max}
      </p>
    </div>
  );
}
