interface Props {
  variant: 'success' | 'error' | 'warning';
  size?: number;
  className?: string;
  /** 塗りつぶしアイコン（地色 + 白抜きシンボル）。通知バナー等で使用 */
  filled?: boolean;
}

export function StatusIcon({ variant, size = 16, className = '', filled = false }: Props) {
  const base = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    className: `inline-block align-middle${className ? ` ${className}` : ''}`,
  };

  const common = {
    ...base,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (filled && variant !== 'success') {
    // 地色（currentColor）で塗りつぶし、シンボルを白抜きで描画する
    const filledCommon = { ...base };

    if (variant === 'error') {
      return (
        <svg {...filledCommon} fill="currentColor">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
          <line x1="9" y1="9" x2="15" y2="15" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
        </svg>
      );
    }

    // 警告: 三角形に「!」を抜いた塗りつぶし（DADS 公式パス）
    return (
      <svg {...filledCommon} fill="currentColor">
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
      </svg>
    );
  }

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
      <circle cx="12" cy="17.5" r="1.25" fill="currentColor" />
    </svg>
  );
}
