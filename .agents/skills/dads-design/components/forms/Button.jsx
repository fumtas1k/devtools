import React from 'react';

/**
 * DADS Button — the primary action primitive.
 * Variants: solid-fill (primary), outline (secondary), text (tertiary).
 * Sizes: lg / md / sm / xs. Renders an <a> when `href` is provided.
 */
export function Button(props) {
  const {
    variant = 'solid-fill',
    size = 'md',
    href,
    disabled = false,
    className = '',
    children,
    ...rest
  } = props;

  const classes = [
    'dads-btn',
    `dads-btn--${variant}`,
    `dads-btn--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (href && !disabled) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <button
      type={rest.type ?? 'button'}
      className={classes}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
