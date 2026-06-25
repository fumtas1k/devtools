import type { HTMLAttributes } from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/** Hierarchical location trail; last item is the current page. */
export interface BreadcrumbsProps extends HTMLAttributes<HTMLElement> {
  /** Ordered crumbs from root to current page. */
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs(props: BreadcrumbsProps): JSX.Element;
