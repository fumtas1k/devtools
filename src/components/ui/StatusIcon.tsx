interface Props {
  variant: 'success' | 'error' | 'warning';
  size?: number;
  className?: string;
}

export function StatusIcon({ variant, size = 16, className = '' }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: `inline-block align-middle${className ? ` ${className}` : ''}`,
  };

  if (variant === 'success') {
    return (
      <svg {...common} strokeWidth={2.5}>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }

  if (variant === 'error') {
    return (
      <svg {...common} strokeWidth={2.5}>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }

  return (
    <svg {...common} strokeWidth={2}>
      <path d="M12 3 L22 20 L2 20 Z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <line x1="12" y1="17.5" x2="12" y2="17.5" />
    </svg>
  );
}
