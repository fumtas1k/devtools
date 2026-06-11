/*
 * DADS fallback component library.
 * The Design System tab injects the compiled _ds_bundle.js and populates
 * window.DADS_952a55. When a page is opened OUTSIDE that tab (direct serve,
 * verifier iframe, standalone export) the bundle isn't injected — this file
 * defines the same components so the page still renders. It NEVER overwrites
 * the real bundle: every component is registered only if missing.
 *
 * Visuals come entirely from styles.css classes, so output is identical.
 */
(function () {
  const NS = (window.DADS_952a55 = window.DADS_952a55 || {});
  const def = (name, fn) => { if (!NS[name]) NS[name] = fn; };
  const cx = (...a) => a.filter(Boolean).join(' ');

  def('Button', function Button(props) {
    const { variant = 'solid-fill', size = 'md', href, disabled = false, className = '', children, ...rest } = props;
    const cls = cx('dads-btn', `dads-btn--${variant}`, `dads-btn--${size}`, className);
    if (href && !disabled) return <a href={href} className={cls} {...rest}>{children}</a>;
    return <button type={rest.type ?? 'button'} className={cls} disabled={disabled} aria-disabled={disabled || undefined} {...rest}>{children}</button>;
  });

  def('Input', function Input(props) {
    const { blockSize = 'lg', isError = false, disabled = false, className = '', ...rest } = props;
    return <input className={cx('dads-field', `dads-field--${blockSize}`, className)} aria-invalid={isError || undefined} aria-disabled={disabled || undefined} disabled={disabled} {...rest} />;
  });

  def('Textarea', function Textarea(props) {
    const { isError = false, disabled = false, rows = 4, className = '', ...rest } = props;
    return <textarea rows={rows} className={cx('dads-field', className)} aria-invalid={isError || undefined} aria-disabled={disabled || undefined} disabled={disabled} {...rest} />;
  });

  def('Select', function Select(props) {
    const { blockSize = 'lg', isError = false, disabled = false, className = '', children, ...rest } = props;
    return (
      <span className="dads-select-wrap">
        <select className={cx('dads-field', `dads-field--${blockSize}`, className)} aria-invalid={isError || undefined} aria-disabled={disabled || undefined} disabled={disabled} {...rest}>{children}</select>
        <svg className="dads-select-chevron" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.3344 4.4L8.001 9.7333L2.6677 4.4L1.7344 5.3333L8.001 11.6L14.2677 5.3333L13.3344 4.4Z" fill="currentColor" /></svg>
      </span>
    );
  });

  const choice = (type, boxCls) => function Choice(props) {
    const { children, isError = false, disabled = false, className = '', ...rest } = props;
    const input = (
      <span className="dads-choice__box">
        <input type={type} className={cx(boxCls, className)} aria-invalid={isError || undefined} aria-disabled={disabled || undefined} disabled={disabled} {...rest} />
      </span>
    );
    if (!children) return input;
    return <label className="dads-choice">{input}<span className="dads-choice__label">{children}</span></label>;
  };
  def('Checkbox', choice('checkbox', 'dads-checkbox'));
  def('Radio', choice('radio', 'dads-radio'));

  def('Label', function Label(props) {
    const { children, htmlFor, requirement, className = '', ...rest } = props;
    return (
      <label htmlFor={htmlFor} className={cx('dads-label', className)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', font: '700 16px/1.5 var(--font-sans)', color: 'var(--text-heading)' }} {...rest}>
        {children}
        {requirement === 'required' && <span style={{ font: '400 14px/1 var(--font-sans)', color: 'var(--color-red-800)', border: '1px solid var(--color-red-800)', borderRadius: 'var(--radius-4)', padding: '2px 6px' }}>必須</span>}
        {requirement === 'optional' && <span style={{ font: '400 14px/1 var(--font-sans)', color: 'var(--text-subtle)', border: '1px solid var(--border-divider)', borderRadius: 'var(--radius-4)', padding: '2px 6px' }}>任意</span>}
      </label>
    );
  });

  const ICONS = {
    info1: 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
    info2: 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
    success: 'M12 2a10 10 0 100 20 10 10 0 000-20zm-2 15l-5-5 1.4-1.4L10 14.2l7.6-7.6L19 8l-9 9z',
    warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
    error: 'M12 2a10 10 0 100 20 10 10 0 000-20zm5 13.6L15.6 17 12 13.4 8.4 17 7 15.6 10.6 12 7 8.4 8.4 7 12 10.6 15.6 7 17 8.4 13.4 12 17 15.6z',
  };
  def('NotificationBanner', function NotificationBanner(props) {
    const { type = 'info1', bannerStyle = 'standard', title, children, className = '', ...rest } = props;
    return (
      <div className={cx('dads-banner', `dads-banner--${type}`, bannerStyle === 'color-chip' && 'dads-banner--chip', className)} role="status" {...rest}>
        <div className="dads-banner__head">
          <svg className="dads-banner__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={ICONS[type] || ICONS.info1} /></svg>
          <span className="dads-banner__title">{title}</span>
        </div>
        {children && <div className="dads-banner__body">{children}</div>}
      </div>
    );
  });

  def('StatusBadge', function StatusBadge(props) {
    const { tone = 'neutral', className = '', children, style, ...rest } = props;
    const tones = {
      neutral: { background: 'var(--color-solid-gray-536)', color: '#fff' },
      info: { background: 'var(--color-blue-900)', color: '#fff' },
      success: { background: 'var(--color-success-2)', color: '#fff' },
      warning: { background: 'var(--color-warning-yellow-2)', color: '#fff' },
      error: { background: 'var(--color-error-1)', color: '#fff' },
    };
    return <span className={cx('dads-status-badge', className)} style={{ ...tones[tone], ...style }} {...rest}>{children}</span>;
  });

  def('Accordion', function Accordion(props) {
    const { title, children, defaultOpen = false, className = '', ...rest } = props;
    return (
      <details className={cx('dads-accordion', className)} open={defaultOpen} {...rest}>
        <summary className="dads-accordion__summary">
          <span className="dads-accordion__icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.668 5.5L10.0013 12.1667L3.33464 5.5L2.16797 6.66667L10.0013 14.5L17.8346 6.66667L16.668 5.5Z" fill="currentColor" /></svg></span>
          {title}
        </summary>
        <div className="dads-accordion__content">{children}</div>
      </details>
    );
  });

  def('Breadcrumbs', function Breadcrumbs(props) {
    const { items = [], className = '', ...rest } = props;
    return (
      <nav className={cx('dads-breadcrumbs', className)} aria-label="パンくずリスト" {...rest}>
        <ol>
          {items.map((item, i) => {
            const isLast = i === items.length - 1;
            return (
              <li key={i} {...(isLast ? { 'aria-current': 'page' } : {})}>
                {isLast || !item.href ? <span>{item.label}</span> : <a href={item.href}>{item.label}</a>}
                {!isLast && <span className="dads-bc-sep" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 1.3L3.8 2L7.8 6L3.8 10L4.5 10.7L9.2 6L4.5 1.3Z" fill="currentColor" /></svg></span>}
              </li>
            );
          })}
        </ol>
      </nav>
    );
  });

  const MAIN = { gray: 'var(--color-solid-gray-800)', blue: 'var(--color-blue-700)', 'light-blue': 'var(--color-light-blue-800)', cyan: 'var(--color-cyan-900)', green: 'var(--color-green-800)', lime: 'var(--color-lime-900)', yellow: 'var(--color-yellow-1000)', orange: 'var(--color-orange-900)', red: 'var(--color-red-900)', magenta: 'var(--color-magenta-800)', purple: 'var(--color-purple-800)' };
  const FILL = Object.assign({}, MAIN, { gray: 'var(--color-solid-gray-700)' });
  const BG50 = { gray: 'var(--color-solid-gray-50)', blue: 'var(--color-blue-50)', 'light-blue': 'var(--color-light-blue-50)', cyan: 'var(--color-cyan-50)', green: 'var(--color-green-50)', lime: 'var(--color-lime-50)', yellow: 'var(--color-yellow-50)', orange: 'var(--color-orange-50)', red: 'var(--color-red-50)', magenta: 'var(--color-magenta-50)', purple: 'var(--color-purple-50)' };
  def('ChipLabel', function ChipLabel(props) {
    const { variant = 'text', color = 'gray', className = '', children, style, ...rest } = props;
    let s = {};
    if (variant === 'text') s = { color: MAIN[color] };
    else if (variant === 'outline') s = { color: MAIN[color], borderColor: MAIN[color] };
    else if (variant === 'filled-outline') s = { color: MAIN[color], borderColor: MAIN[color], background: BG50[color] };
    else if (variant === 'fill') s = { background: FILL[color] };
    return <span className={cx('dads-chip', `dads-chip--${variant}`, className)} style={{ ...s, ...style }} {...rest}>{children}</span>;
  });

  def('Table', function Table(props) {
    const { caption, columns, rows, children, className = '', ...rest } = props;
    if (children) return <table className={cx('dads-table', className)} {...rest}>{caption && <caption>{caption}</caption>}{children}</table>;
    return (
      <table className={cx('dads-table', className)} {...rest}>
        {caption && <caption>{caption}</caption>}
        <thead><tr>{columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
        <tbody>{rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>)}</tbody>
      </table>
    );
  });
})();
