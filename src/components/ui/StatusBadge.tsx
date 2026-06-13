import type { ReactNode } from 'react';
import { cx } from '@/utils/cx';

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
      className={cx('status-badge', `status-badge--${tone}`, className)}
      aria-hidden={decorative || undefined}
    >
      {children}
    </span>
  );
}
