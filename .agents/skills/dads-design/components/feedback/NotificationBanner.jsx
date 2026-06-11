import React from 'react';

const ICONS = {
  info1: 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  info2: 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  success: 'M12 2a10 10 0 100 20 10 10 0 000-20zm-2 15l-5-5 1.4-1.4L10 14.2l7.6-7.6L19 8l-9 9z',
  warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  error: 'M12 2a10 10 0 100 20 10 10 0 000-20zm5 13.6L15.6 17 12 13.4 8.4 17 7 15.6 10.6 12 7 8.4 8.4 7 12 10.6 15.6 7 17 8.4 13.4 12 17 15.6z',
};

/**
 * DADS NotificationBanner — page-level message block.
 * type sets colour + icon; bannerStyle 'standard' is a full border,
 * 'color-chip' a thin border with a thick inset left bar.
 */
export function NotificationBanner(props) {
  const {
    type = 'info1',
    bannerStyle = 'standard',
    title,
    children,
    className = '',
    ...rest
  } = props;

  const classes = [
    'dads-banner',
    `dads-banner--${type}`,
    bannerStyle === 'color-chip' ? 'dads-banner--chip' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} role="status" {...rest}>
      <div className="dads-banner__head">
        <svg className="dads-banner__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d={ICONS[type] || ICONS.info1} />
        </svg>
        <span className="dads-banner__title">{title}</span>
      </div>
      {children && <div className="dads-banner__body">{children}</div>}
    </div>
  );
}
