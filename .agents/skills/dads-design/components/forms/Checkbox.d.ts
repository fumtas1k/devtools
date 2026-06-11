import type { InputHTMLAttributes, ReactNode } from 'react';

/** Checkbox with optional inline label. */
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  /** Label rendered to the right of the box. */
  children?: ReactNode;
  isError?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Checkbox(props: CheckboxProps): JSX.Element;
