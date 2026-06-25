import React from 'react';

/**
 * DADS Label — form field label with optional requirement badge.
 */
export function Label(props) {
  const { children, htmlFor, requirement, className = '', ...rest } = props;
  return (
    <label
      htmlFor={htmlFor}
      className={['dads-label', className].filter(Boolean).join(' ')}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', font: '700 16px/1.5 var(--font-sans)', color: 'var(--text-heading)' }}
      {...rest}
    >
      {children}
      {requirement === 'required' && (
        <span style={{ font: '400 14px/1 var(--font-sans)', color: 'var(--color-red-800)', border: '1px solid var(--color-red-800)', borderRadius: 'var(--radius-4)', padding: '2px 6px' }}>必須</span>
      )}
      {requirement === 'optional' && (
        <span style={{ font: '400 14px/1 var(--font-sans)', color: 'var(--text-subtle)', border: '1px solid var(--border-divider)', borderRadius: 'var(--radius-4)', padding: '2px 6px' }}>任意</span>
      )}
    </label>
  );
}
