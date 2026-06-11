import React from 'react';

// Per-colour shade map lifted from the DADS ChipLabel source.
const MAIN = {
  gray: 'var(--color-solid-gray-800)',
  blue: 'var(--color-blue-700)',
  'light-blue': 'var(--color-light-blue-800)',
  cyan: 'var(--color-cyan-900)',
  green: 'var(--color-green-800)',
  lime: 'var(--color-lime-900)',
  yellow: 'var(--color-yellow-1000)',
  orange: 'var(--color-orange-900)',
  red: 'var(--color-red-900)',
  magenta: 'var(--color-magenta-800)',
  purple: 'var(--color-purple-800)',
};
const FILL = { ...MAIN, gray: 'var(--color-solid-gray-700)' };
const BG50 = {
  gray: 'var(--color-solid-gray-50)',
  blue: 'var(--color-blue-50)',
  'light-blue': 'var(--color-light-blue-50)',
  cyan: 'var(--color-cyan-50)',
  green: 'var(--color-green-50)',
  lime: 'var(--color-lime-50)',
  yellow: 'var(--color-yellow-50)',
  orange: 'var(--color-orange-50)',
  red: 'var(--color-red-50)',
  magenta: 'var(--color-magenta-50)',
  purple: 'var(--color-purple-50)',
};

/**
 * DADS ChipLabel — a small categorisation tag.
 * variant: text | outline | filled-outline | fill. 11 colours.
 */
export function ChipLabel(props) {
  const { variant = 'text', color = 'gray', className = '', children, style, ...rest } = props;

  let s = {};
  if (variant === 'text') s = { color: MAIN[color] };
  else if (variant === 'outline') s = { color: MAIN[color], borderColor: MAIN[color] };
  else if (variant === 'filled-outline')
    s = { color: MAIN[color], borderColor: MAIN[color], background: BG50[color] };
  else if (variant === 'fill') s = { background: FILL[color] };

  return (
    <span
      className={['dads-chip', `dads-chip--${variant}`, className].filter(Boolean).join(' ')}
      style={{ ...s, ...style }}
      {...rest}
    >
      {children}
    </span>
  );
}
