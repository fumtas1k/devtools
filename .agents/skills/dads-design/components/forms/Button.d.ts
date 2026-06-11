import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'solid-fill' | 'outline' | 'text';
export type ButtonSize = 'lg' | 'md' | 'sm' | 'xs';

/**
 * Primary action button for the Digital Agency Design System.
 *
 * @startingPoint section="Forms" subtitle="Primary / secondary / tertiary actions in 4 sizes" viewport="700x180"
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual emphasis. @default 'solid-fill' */
  variant?: ButtonVariant;
  /** Control size. @default 'md' */
  size?: ButtonSize;
  /** Render as an anchor pointing here instead of a <button>. */
  href?: string;
  /** Disabled state (sets aria-disabled). */
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Button(props: ButtonProps): JSX.Element;
