import type { InputHTMLAttributes, ReactNode } from 'react';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

interface Props {
  id: string;
  label: ReactNode;
  /** ラベル行を視覚的に隠す（sr-only 化）。同一カラムの見出しを上部に 1 つだけ置く
      表形式レイアウトで、2 行目以降の重複ラベルを視覚的に省きつつ
      `<label htmlFor>` によるアクセシブル名は維持する用途。既定 true。 */
  labelVisible?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  error?: string;
  hint?: string;
  onSampleClick?: () => void;
  /** ラベル行の右端に差し込む追加要素（複数サンプルボタン等、標準の onSampleClick で
      1 つに収まらないケース用）。onSampleClick と併用も可。 */
  headerRight?: ReactNode;
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number;
  readOnly?: boolean;
  mono?: boolean;
  resize?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement | HTMLInputElement>;
  /** multiline（textarea）時に aria-busy を付与する。debounce 中の表明など。既定 false。 */
  busy?: boolean;
  /** ブラウザの autofill / 保存挙動の制御（例: "off"）。秘密鍵など hardening が必要な欄で指定する。 */
  autoComplete?: string;
}

export function InputField({
  id,
  label,
  labelVisible = true,
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 4,
  error,
  hint,
  onSampleClick,
  headerRight,
  inputMode,
  maxLength,
  readOnly = false,
  mono = false,
  resize = false,
  onKeyDown,
  busy = false,
  autoComplete,
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
      <div
        className={`flex items-center justify-between mb-3 min-h-8${labelVisible ? '' : ' sr-only'}`}
      >
        <label htmlFor={id} className="body-emphasis text-default">
          {label}
        </label>
        {(onSampleClick || headerRight) && (
          <div className="flex items-center gap-3">
            {headerRight}
            {onSampleClick && (
              <button
                type="button"
                onClick={onSampleClick}
                className="caption text-link-plain btn-link-plain"
              >
                サンプルを入力
              </button>
            )}
          </div>
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
          aria-busy={busy || undefined}
          autoComplete={autoComplete}
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
          autoComplete={autoComplete}
          className={inputClass}
        />
      )}

      {/* error と hint は併存表示する（error 時に hint=構文ヒント等が消えないように）。
         error を上、hint をその下に薄く出す。aria-describedby は両 id を参照（#510）。 */}
      {error && <ErrorMessage id={errorId} message={error} />}
      {hint && (
        <p id={hintId} className="caption text-muted mt-1">
          {hint}
        </p>
      )}
    </div>
  );
}
