import type { ReactNode } from 'react';
import { StatusIcon } from '@/components/ui/StatusIcon';

type Variant = 'warning' | 'error';

interface Props {
  variant?: Variant;
  title: string;
  children: ReactNode;
  role?: string;
}

const ICON_COLOR: Record<Variant, string> = {
  warning: 'text-warning',
  error: 'text-error',
};

export function NotificationBanner({ variant = 'warning', title, children, role = 'note' }: Props) {
  return (
    <div
      role={role}
      className={`notification-banner notification-banner--${variant} rounded-lg p-4`}
    >
      <div className="flex items-center gap-2">
        <StatusIcon
          variant={variant}
          size={20}
          filled
          className={`${ICON_COLOR[variant]} shrink-0`}
        />
        <p className="body-emphasis text-default">{title}</p>
      </div>
      <p className="caption text-default mt-2">{children}</p>
    </div>
  );
}
