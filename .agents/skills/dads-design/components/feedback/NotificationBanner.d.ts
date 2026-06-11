import type { ReactNode, HTMLAttributes } from 'react';

export type NotificationType = 'info1' | 'info2' | 'success' | 'warning' | 'error';
export type NotificationStyle = 'standard' | 'color-chip';

/**
 * Page-level notification / alert banner.
 *
 * @startingPoint section="Feedback" subtitle="Info / success / warning / error message blocks" viewport="700x200"
 */
export interface NotificationBannerProps extends HTMLAttributes<HTMLDivElement> {
  /** Severity — drives colour and icon. @default 'info1' */
  type?: NotificationType;
  /** 'standard' full border, or 'color-chip' inset left bar. @default 'standard' */
  bannerStyle?: NotificationStyle;
  /** Bold heading line. */
  title: string;
  children?: ReactNode;
  className?: string;
}

export function NotificationBanner(props: NotificationBannerProps): JSX.Element;
