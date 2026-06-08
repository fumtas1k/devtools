import type { ReactNode } from 'react';

interface Props {
  tone: 'error' | 'success' | 'warning' | 'info';
  children: ReactNode;
  className?: string;
}

export function StatusBadge({ tone, children, className = '' }: Props) {
  return (
    <span className={`status-badge status-badge--${tone}${className ? ` ${className}` : ''}`}>
      {children}
    </span>
  );
}
