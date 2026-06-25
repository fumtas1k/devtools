import type { ReactNode } from 'react';
import { cx } from '@/utils/cx';

interface Props {
  tone: 'error' | 'info' | 'neutral';
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function ChipLabel({ tone, children, icon, className = '' }: Props) {
  return (
    <span className={cx('chip-label', `chip-label--${tone}`, className)}>
      {icon}
      {children}
    </span>
  );
}
