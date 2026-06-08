import type { ReactNode } from 'react';

interface Props {
  tone: 'error' | 'success' | 'warning' | 'info';
  children: ReactNode;
  className?: string;
  /** true のとき aria-hidden="true" を付与し、スクリーンリーダーの読み上げを抑制する */
  decorative?: boolean;
}

export function StatusBadge({ tone, children, className = '', decorative = false }: Props) {
  return (
    <span
      className={`status-badge status-badge--${tone}${className ? ` ${className}` : ''}`}
      aria-hidden={decorative || undefined}
    >
      {children}
    </span>
  );
}
