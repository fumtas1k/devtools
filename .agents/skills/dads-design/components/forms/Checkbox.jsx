import React from 'react';

/**
 * DADS Checkbox — accessible checkbox with optional label.
 */
export function Checkbox(props) {
  const { children, isError = false, disabled = false, className = '', ...rest } = props;

  const input = (
    <span className="dads-choice__box">
      <input
        type="checkbox"
        className={['dads-checkbox', className].filter(Boolean).join(' ')}
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
