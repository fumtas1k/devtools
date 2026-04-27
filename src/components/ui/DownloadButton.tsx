import { colors, caption } from '@/utils/styles';

interface Props {
  onClick: () => void;
  label: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function DownloadButton({
  onClick,
  label,
  variant = 'primary',
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: Props) {
  const isPrimary = variant === 'primary';

  const baseStyle: React.CSSProperties = {
    ...caption,
    fontWeight: 700,
    padding: '0.5rem 0.75rem',
    lineHeight: 1,
    borderRadius: '0.5rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  };

  const variantStyle: React.CSSProperties = isPrimary
    ? {
        background: disabled ? colors.bgSubtle : colors.primary,
        color: disabled ? colors.muted : colors.textOnPrimary,
        border: 'none',
      }
    : {
        background: 'transparent',
        color: disabled ? colors.muted : colors.primary,
        border: `1px solid ${disabled ? colors.border : colors.primary}`,
      };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel || label}
      className={`${isPrimary ? 'hover:opacity-90' : 'hover:bg-blue-50'} ${className}`}
      style={{ ...baseStyle, ...variantStyle }}
    >
      <DownloadIcon />
      {label}
    </button>
  );
}
