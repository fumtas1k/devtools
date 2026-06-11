import React from 'react';

/**
 * DADS Input — single-line text field.
 * Sizes lg/md/sm. Error and disabled states map to the DADS
 * field treatment (dashed border when read-only).
 */
export function Input(props) {
  const {
    blockSize = 'lg',
    isError = false,
    disabled = false,
    className = '',
    ...rest
  } = props;

  const classes = ['dads-field', `dads-field--${blockSize}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <input
      className={classes}
      aria-invalid={isError || undefined}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      {...rest}
    />
  );
}
