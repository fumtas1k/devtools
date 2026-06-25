import type { HTMLAttributes, ReactNode } from 'react';

export type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

/** Small inline status pill (e.g. 受付中 / 完了 / エラー). */
export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Semantic colour. @default 'neutral' */
  tone?: StatusBadgeTone;
  children?: ReactNode;
  className?: string;
}

export function StatusBadge(props: StatusBadgeProps): JSX.Element;
