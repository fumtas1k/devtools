import React from 'react';

/**
 * DADS StatusBadge — small inline status pill.
 * Default is neutral grey; pass a `tone` for semantic colour.
 */
export function StatusBadge(props) {
  const { tone = 'neutral', className = '', children, style, ...rest } = props;

  const tones = {
    neutral: { background: 'var(--color-solid-gray-536)', color: '#fff' },
    info: { background: 'var(--color-blue-900)', color: '#fff' },
    success: { background: 'var(--color-success-2)', color: '#fff' },
    warning: { background: 'var(--color-warning-yellow-2)', color: '#fff' },
    error: { background: 'var(--color-error-1)', color: '#fff' },
  };

  return (
    <span
      className={['dads-status-badge', className].filter(Boolean).join(' ')}
      style={{ ...tones[tone], ...style }}
      {...rest}
    >
      {children}
    </span>
  );
}
