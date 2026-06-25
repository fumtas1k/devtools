import React from 'react';

/**
 * DADS Breadcrumbs — hierarchical location trail.
 * Pass `items` as an array of { label, href } objects; the last
 * item is rendered as the current page.
 */
export function Breadcrumbs(props) {
  const { items = [], className = '', ...rest } = props;
  return (
    <nav className={['dads-breadcrumbs', className].filter(Boolean).join(' ')} aria-label="パンくずリスト" {...rest}>
      <ol>
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} {...(isLast ? { 'aria-current': 'page' } : {})}>
              {isLast || !item.href ? (
                <span>{item.label}</span>
              ) : (
                <a href={item.href}>{item.label}</a>
              )}
              {!isLast && (
                <span className="dads-bc-sep" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M4.5 1.3L3.8 2L7.8 6L3.8 10L4.5 10.7L9.2 6L4.5 1.3Z" fill="currentColor" />
                  </svg>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
