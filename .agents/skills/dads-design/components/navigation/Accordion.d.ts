import type { ReactNode } from 'react';

/** Disclosure / accordion item built on native <details>. */
export interface AccordionProps {
  /** Summary line (always visible). */
  title: ReactNode;
  /** Revealed content. */
  children?: ReactNode;
  /** Start expanded. @default false */
  defaultOpen?: boolean;
  className?: string;
}

export function Accordion(props: AccordionProps): JSX.Element;
