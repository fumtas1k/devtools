import type { TextareaHTMLAttributes } from 'react';

/** Multi-line text field (vertically resizable). */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  isError?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Textarea(props: TextareaProps): JSX.Element;
