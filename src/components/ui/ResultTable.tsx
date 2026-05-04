import type { ReactNode } from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  headerAlign?: 'left' | 'right' | 'center';
  cellAlign?: 'left' | 'right' | 'center';
  /**
   * CSS length token (例: '3.5rem')。**hard-coded リテラルのみ許容**。
   * setProperty('--col-width', value) は CSSOM 階層で declaration value として encapsulate される
   * ため CSS injection は不可能だが、user input を bridge する場合は事前 sanitize 必須。
   * discipline で将来 regression を予防（origin discipline、issue #266 由来）。
   */
  width?: string;
  /** td に追加される className (typography / 色 / nowrap 等の修飾用) */
  className?: string;
  /** セルパディング。default: 'normal' (0.5rem 0.75rem)、compact (0.25rem 0.5rem) */
  cellPadding?: 'normal' | 'compact';
  render: (row: T, index: number) => ReactNode;
}

interface Props<T> {
  rows: T[];
  columns: TableColumn<T>[];
  getKey: (row: T) => string | number;
  /**
   * CSS length token (hard-coded literals only)。`TableColumn.width` と同じ origin discipline。
   * user input を bridge する場合は sanitize 必須。
   */
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
  return (
    <div className="rounded-lg border border-default overflow-hidden">
      {renderHeader && (
        <div className="flex flex-col gap-2 px-4 py-3 bg-subtle border-b border-default">
          {renderHeader()}
        </div>
      )}
      <div className="overflow-x-auto">
        <table
          ref={(el) => {
            if (!el) return;
            if (minWidth) {
              el.style.setProperty('--result-table-min-width', minWidth);
            } else {
              el.style.removeProperty('--result-table-min-width');
            }
          }}
          className="w-full border-collapse result-table"
        >
          <colgroup>
            {columns.map((col) => (
              <col
                key={col.key}
                ref={(el) => {
                  if (!el) return;
                  if (col.width) {
                    el.style.setProperty('--col-width', col.width);
                  } else {
                    el.style.removeProperty('--col-width');
                  }
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
                  className={`caption text-muted font-semibold whitespace-nowrap ${paddingClass()} ${alignClass(col.headerAlign)}`}
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
