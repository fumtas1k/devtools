import React from 'react';

/**
 * DADS Table — data table with the standard header treatment.
 * Pass `columns` and `rows`, or compose children directly.
 */
export function Table(props) {
  const { caption, columns, rows, children, className = '', ...rest } = props;

  if (children) {
    return (
      <table className={['dads-table', className].filter(Boolean).join(' ')} {...rest}>
        {caption && <caption>{caption}</caption>}
        {children}
      </table>
    );
  }

  return (
    <table className={['dads-table', className].filter(Boolean).join(' ')} {...rest}>
      {caption && <caption>{caption}</caption>}
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i} scope="col">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td key={ci}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
