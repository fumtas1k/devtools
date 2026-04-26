import { caption, colors } from '@/utils/styles';

interface Props {
  id?: string;
  message: string;
  variant?: 'inline' | 'block';
}

export function ErrorMessage({ id, message, variant = 'inline' }: Props) {
  if (variant === 'block') {
    return (
      <div
        id={id}
        role="alert"
        className="rounded-lg p-4"
        style={{ border: `1px solid ${colors.error}`, background: colors.errorBg }}
      >
        <p style={{ ...caption, color: colors.error }}>{message}</p>
      </div>
    );
  }
  return (
    <p id={id} role="alert" style={{ ...caption, color: colors.error, marginTop: '0.25rem' }}>
      {message}
    </p>
  );
}
