import React from 'react';

/**
 * DADS Textarea — multi-line text field, vertically resizable.
 */
export function Textarea(props) {
  const { isError = false, disabled = false, rows = 4, className = '', ...rest } = props;
  return (
    <textarea
      rows={rows}
      className={['dads-field', className].filter(Boolean).join(' ')}
      aria-invalid={isError || undefined}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      {...rest}
    />
  );
}
