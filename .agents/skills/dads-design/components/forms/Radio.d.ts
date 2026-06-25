import type { InputHTMLAttributes, ReactNode } from 'react';

/** Radio button with optional inline label. Group via shared `name`. */
export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  children?: ReactNode;
  isError?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Radio(props: RadioProps): JSX.Element;
