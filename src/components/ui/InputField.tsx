import type { InputHTMLAttributes, ReactNode } from 'react';
import { bodyEmphasis, caption, colors } from '@/utils/styles';
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

  const baseInputStyle = {
    ...caption,
    width: '100%',
    border: `1px solid ${error ? colors.error : colors.borderInput}`,
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
    background: readOnly ? colors.bgSurface : colors.bg,
    color: colors.text,
    ...(mono ? { fontFamily: 'monospace', letterSpacing: '0.02em' } : {}),
    ...(multiline && !resize ? { resize: 'none' as const } : {}),
  };

  return (
    <div>
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: '0.75rem', minHeight: '2rem' }}
      >
        <label htmlFor={id} style={{ ...bodyEmphasis, color: colors.text }}>
          {label}
        </label>
        {onSampleClick && (
          <button
            type="button"
            onClick={onSampleClick}
            style={{
              ...caption,
              color: colors.link,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
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
          style={baseInputStyle}
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
          style={baseInputStyle}
        />
      )}

      {error ? (
        <ErrorMessage id={errorId} message={error} />
      ) : hint ? (
        <p id={hintId} style={{ ...caption, color: colors.muted, marginTop: '0.25rem' }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
