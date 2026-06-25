import React from 'react';

/**
 * DADS Accordion — a single disclosure built on <details>/<summary>.
 * The circular chevron rotates open. Compose several in a list.
 */
export function Accordion(props) {
  const { title, children, defaultOpen = false, className = '', ...rest } = props;
  return (
    <details
      className={['dads-accordion', className].filter(Boolean).join(' ')}
      open={defaultOpen}
      {...rest}
    >
      <summary className="dads-accordion__summary">
        <span className="dads-accordion__icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M16.668 5.5L10.0013 12.1667L3.33464 5.5L2.16797 6.66667L10.0013 14.5L17.8346 6.66667L16.668 5.5Z" fill="currentColor" />
          </svg>
        </span>
        {title}
      </summary>
      <div className="dads-accordion__content">{children}</div>
    </details>
  );
}
