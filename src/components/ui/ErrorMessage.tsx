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
 */
export function ErrorMessage({ id, message, variant = 'inline' }: Props) {
  if (variant === 'block') {
    return (
      <div id={id} role="alert" className="border border-error bg-error-tint rounded-lg p-4">
        <p className="caption text-error">{message}</p>
      </div>
    );
  }
  return (
    <p id={id} role="alert" className="caption text-error mt-1">
      {message}
    </p>
  );
}
