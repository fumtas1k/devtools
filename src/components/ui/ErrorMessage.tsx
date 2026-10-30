interface Props {
  id?: string;
  message: string;
  variant?: 'inline' | 'block';
}

/**
 * エラーメッセージ表示。
 *
 * style: Tailwind auto-utility (border-error / text-error from --color-error in @theme)
 * + global.css `@layer components` の `.bg-error-tint` (var(--color-error-bg)) を参照。
 * block は red-50 の地に載るため、文字は error-1 では 4.5:1 に届かず `.text-error-text`（error-2）を使う。
 */
export function ErrorMessage({ id, message, variant = 'inline' }: Props) {
  if (variant === 'block') {
    return (
      <div id={id} role="alert" className="border border-error bg-error-tint rounded-lg p-4">
        <p className="caption text-error-text">{message}</p>
      </div>
    );
  }
  return (
    <p id={id} role="alert" className="caption text-error mt-1">
      {message}
    </p>
  );
}
