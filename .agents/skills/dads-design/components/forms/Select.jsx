import React from 'react';

/**
 * DADS Select — native select with the DADS chevron and field styling.
 */
export function Select(props) {
  const {
    blockSize = 'lg',
    isError = false,
    disabled = false,
    className = '',
    children,
    ...rest
  } = props;

  const classes = ['dads-field', `dads-field--${blockSize}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className="dads-select-wrap">
      <select
        className={classes}
        aria-invalid={isError || undefined}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        {...rest}
      >
        {children}
      </select>
      <svg
        className="dads-select-chevron"
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
      >
        <path
          d="M13.3344 4.4L8.001 9.7333L2.6677 4.4L1.7344 5.3333L8.001 11.6L14.2677 5.3333L13.3344 4.4Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
