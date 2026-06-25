import type { HTMLAttributes, ReactNode } from 'react';

export type ChipVariant = 'text' | 'outline' | 'filled-outline' | 'fill';
export type ChipColor =
  | 'gray' | 'blue' | 'light-blue' | 'cyan' | 'green' | 'lime'
  | 'yellow' | 'orange' | 'red' | 'magenta' | 'purple';

/** Small categorisation tag / chip. */
export interface ChipLabelProps extends HTMLAttributes<HTMLSpanElement> {
  /** Visual treatment. @default 'text' */
  variant?: ChipVariant;
  /** Accent colour. @default 'gray' */
  color?: ChipColor;
  children?: ReactNode;
  className?: string;
}

export function ChipLabel(props: ChipLabelProps): JSX.Element;
