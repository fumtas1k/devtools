import type { ReactNode } from 'react';

interface Props {
  tone: 'error' | 'info' | 'neutral';
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function ChipLabel({ tone, children, icon, className = '' }: Props) {
  return (
    <span className={`chip-label chip-label--${tone}${className ? ` ${className}` : ''}`}>
      {icon}
      {children}
    </span>
  );
}
