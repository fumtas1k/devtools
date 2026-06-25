import type { InputHTMLAttributes } from 'react';

export type InputBlockSize = 'lg' | 'md' | 'sm';

/** Single-line text field. */
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Field height. @default 'lg' */
  blockSize?: InputBlockSize;
  /** Error state — sets aria-invalid and the error border. */
  isError?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Input(props: InputProps): JSX.Element;
