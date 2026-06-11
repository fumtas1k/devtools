import type { LabelHTMLAttributes, ReactNode } from 'react';

/** Form field label, optionally showing a 必須 / 任意 requirement badge. */
export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** Associates the label with a field id. */
  htmlFor?: string;
  /** Show a requirement badge. */
  requirement?: 'required' | 'optional';
  children?: ReactNode;
  className?: string;
}

export function Label(props: LabelProps): JSX.Element;
