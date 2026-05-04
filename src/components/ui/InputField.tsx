import type { InputHTMLAttributes, ReactNode } from 'react';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

interface Props {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  error?: string;
  hint?: string;
  onSampleClick?: () => void;
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number;
  readOnly?: boolean;
  mono?: boolean;
  resize?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement | HTMLInputElement>;
}

export function InputField({
  id,
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 4,
  error,
  hint,
  onSampleClick,
  inputMode,
  maxLength,
  readOnly = false,
  mono = false,
  resize = false,
  onKeyDown,
}: Props) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  const inputClass = [
    'caption w-full rounded-lg px-3 py-2 border text-default',
    error ? 'border-error' : 'border-input',
    readOnly ? 'bg-surface' : 'bg-default',
    mono && 'font-mono',
    multiline && !resize && 'resize-none',
    multiline && resize && 'resize-y',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <div className="flex items-center justify-between mb-3 min-h-8">
        <label htmlFor={id} className="body-emphasis text-default">
          {label}
        </label>
        {onSampleClick && (
          <button
            type="button"
            onClick={onSampleClick}
            className="caption text-link btn-link-plain"
          >
            サンプルを入力
          </button>
        )}
      </div>

      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={rows}
          readOnly={readOnly}
          maxLength={maxLength}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          className={inputClass}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          readOnly={readOnly}
          maxLength={maxLength}
          inputMode={inputMode}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          className={inputClass}
        />
      )}

      {error ? (
        <ErrorMessage id={errorId} message={error} />
      ) : hint ? (
        <p id={hintId} className="caption text-muted mt-1">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
