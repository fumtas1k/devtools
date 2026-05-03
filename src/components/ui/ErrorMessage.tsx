interface Props {
  id?: string;
  message: string;
  variant?: 'inline' | 'block';
}

export function ErrorMessage({ id, message, variant = 'inline' }: Props) {
  if (variant === 'block') {
    return (
      <div id={id} role="alert" className="rounded-lg p-4 border-error bg-error">
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
