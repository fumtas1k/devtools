import type { ReactNode, CSSProperties } from 'react';
import { useEffect, useRef } from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  headerAlign?: 'left' | 'right' | 'center';
  cellAlign?: 'left' | 'right' | 'center';
  width?: string;
  /** td に追加される className (typography / 色 / nowrap 等の修飾用) */
  className?: string;
  /** セルパディング。default: 'normal' (0.5rem 0.75rem)、compact (0.25rem 0.5rem) */
  cellPadding?: 'normal' | 'compact';
  /**
   * @deprecated PR 1.5 で `cellPadding` + `className` に置換。本 PR 内の過渡 API。次の commit で削除。
   */
  cellStyle?: CSSProperties;
  render: (row: T, index: number) => ReactNode;
}

interface Props<T> {
  rows: T[];
  columns: TableColumn<T>[];
  getKey: (row: T) => string | number;
  minWidth?: string;
  selectedIndex?: number | null;
  onRowClick?: (index: number) => void;
  renderHeader?: () => ReactNode;
}

const alignClass = (a?: 'left' | 'right' | 'center') =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

const paddingClass = (p?: 'normal' | 'compact') => (p === 'compact' ? 'px-2 py-1' : 'px-3 py-2');

export function ResultTable<T>({
  rows,
  columns,
  getKey,
  minWidth,
  selectedIndex = null,
  onRowClick,
  renderHeader,
}: Props<T>) {
  const tableRef = useRef<HTMLTableElement>(null);
  const colgroupRef = useRef<HTMLTableColElement[]>([]);

  useEffect(() => {
    if (tableRef.current && minWidth) {
      tableRef.current.style.setProperty('--result-table-min-width', minWidth);
    }
  }, [minWidth]);

  useEffect(() => {
    columns.forEach((col, i) => {
      const colEl = colgroupRef.current[i];
      if (colEl && col.width) {
        colEl.style.setProperty('--col-width', col.width);
      }
    });
  }, [columns]);

  return (
    <div className="rounded-lg border border-default overflow-hidden">
      {renderHeader && (
        <div className="flex flex-col gap-2 px-4 py-3 bg-subtle border-b border-default">
          {renderHeader()}
        </div>
      )}
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full border-collapse result-table">
          <colgroup>
            {columns.map((col, i) => (
              <col
                key={col.key}
                ref={(el) => {
                  if (el) colgroupRef.current[i] = el;
                }}
                className={col.width ? 'result-table-col' : undefined}
              />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-surface border-b border-default">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`caption text-muted font-semibold whitespace-nowrap ${paddingClass(col.cellPadding)} ${alignClass(col.headerAlign)}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isSelected = selectedIndex === i;
              return (
                <tr
                  key={getKey(row)}
                  onClick={onRowClick ? () => onRowClick(i) : undefined}
                  className="result-table-row"
                  data-selected={isSelected ? 'true' : 'false'}
                  data-clickable={onRowClick ? 'true' : 'false'}
                  aria-selected={onRowClick ? isSelected : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={col.cellStyle}
                      className={`caption text-default ${paddingClass(col.cellPadding)} ${alignClass(col.cellAlign)} ${col.className ?? ''}`}
                    >
                      {col.render(row, i)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
