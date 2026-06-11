import type { SelectHTMLAttributes, ReactNode } from 'react';

export type SelectBlockSize = 'lg' | 'md' | 'sm';

/** Native dropdown select with the DADS chevron. */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Field height. @default 'lg' */
  blockSize?: SelectBlockSize;
  isError?: boolean;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Select(props: SelectProps): JSX.Element;
