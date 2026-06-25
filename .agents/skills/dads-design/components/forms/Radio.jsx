import React from 'react';

/**
 * DADS Radio — accessible radio with optional label.
 */
export function Radio(props) {
  const { children, isError = false, disabled = false, className = '', ...rest } = props;

  const input = (
    <span className="dads-choice__box">
      <input
        type="radio"
        className={['dads-radio', className].filter(Boolean).join(' ')}
        aria-invalid={isError || undefined}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        {...rest}
      />
    </span>
  );

  if (!children) return input;

  return (
    <label className="dads-choice">
      {input}
      <span className="dads-choice__label">{children}</span>
    </label>
  );
}
