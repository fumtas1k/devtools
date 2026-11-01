import type { ReactNode } from 'react';
import { StatusIcon } from '@/components/ui/StatusIcon';

type Variant = 'warning' | 'error' | 'info' | 'success';

interface Props {
  variant?: Variant;
  title: string;
  children: ReactNode;
  role?: string;
}

// DADS の NotificationBanner（color-chip 型）: 見出し 18px Bold + 28px アイコン、本文 16px（docs/decisions.md [141]）
export function NotificationBanner({ variant = 'warning', title, children, role = 'note' }: Props) {
  return (
    <div
      role={role}
      className={`notification-banner notification-banner--${variant} rounded-lg pt-4 pr-6 pb-6 pl-10`}
    >
      <div className="flex items-start gap-3">
        <StatusIcon variant={variant} size={28} filled className="shrink-0" />
        <p className="section-heading font-bold text-default">{title}</p>
      </div>
      <div className="text-body mt-2">{children}</div>
    </div>
  );
}
