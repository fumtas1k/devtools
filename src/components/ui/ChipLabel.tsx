import type { ReactNode } from 'react';

interface Props {
  color: 'red' | 'blue' | 'gray';
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function ChipLabel({ color, children, icon, className = '' }: Props) {
  return (
    <span className={`chip-label chip-label--${color}${className ? ` ${className}` : ''}`}>
      {icon}
      {children}
    </span>
  );
}
