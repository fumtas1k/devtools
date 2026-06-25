import type { TableHTMLAttributes, ReactNode } from 'react';

/** Data table with the DADS header + row-hover treatment. */
export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  /** Optional caption shown above the table. */
  caption?: ReactNode;
  /** Column headers (used when `rows` is provided). */
  columns?: ReactNode[];
  /** Row data as a 2-D array (used with `columns`). */
  rows?: ReactNode[][];
  /** Alternatively, compose <thead>/<tbody> yourself. */
  children?: ReactNode;
  className?: string;
}

export function Table(props: TableProps): JSX.Element;
