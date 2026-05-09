import type { ReactNode } from 'react';
import { useDynamicStyleSheet } from '@/hooks/useDynamicStyleSheet';
import { assertCssLength } from '@/utils/css-length';

export interface TableColumn<T> {
  key: string;
  header: string;
  headerAlign?: 'left' | 'right' | 'center';
  cellAlign?: 'left' | 'right' | 'center';
  /**
   * CSS length token (例: '3.5rem')。**hard-coded リテラルのみ許容**。
   * Constructable Stylesheets 経由で per-instance scoped rule に展開されるため、
   * `assertCssLength` で `{number}{unit?}` 形式以外を reject する (CSS injection 防御)。
   * user input を bridge する場合は事前 sanitize 必須。
   * 詳細は `docs/decisions.md [067]` / PR 9 spec § 4.2 / 4.3 参照。
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
   * `assertCssLength` で形式 validate。
   */
  minWidth?: string;
  selectedIndex?: number | null;
  onRowClick?: (index: number) => void;
  renderHeader?: () => ReactNode;
}

const alignClass = (a?: 'left' | 'right' | 'center') =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

const paddingClass = (p?: 'normal' | 'compact') => (p === 'compact' ? 'px-2 py-1' : 'px-3 py-2');

function buildResultTableRules<T>(
  className: string,
  columns: TableColumn<T>[],
  minWidth?: string
): string {
  const rules: string[] = [];
  if (minWidth) rules.push(`.${className} { min-width: ${minWidth}; }`);
  columns.forEach((col, i) => {
    if (col.width) {
      rules.push(`.${className} > colgroup > col:nth-child(${i + 1}) { width: ${col.width}; }`);
    }
  });
  return rules.join('\n');
}

export function ResultTable<T>({
  rows,
  columns,
  getKey,
  minWidth,
  selectedIndex = null,
  onRowClick,
  renderHeader,
}: Props<T>) {
  if (minWidth !== undefined) assertCssLength(minWidth, 'minWidth');
  for (const c of columns) {
    if (c.width !== undefined) assertCssLength(c.width, `column[${c.key}].width`);
  }

  const dynClassName = useDynamicStyleSheet((className) =>
    buildResultTableRules(className, columns, minWidth)
  );

  return (
    <div className="rounded-lg border border-default overflow-hidden">
      {renderHeader && (
        <div className="flex flex-col gap-2 px-4 py-3 bg-subtle border-b border-default">
          {renderHeader()}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className={`w-full border-collapse result-table ${dynClassName}`}>
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} />
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
              const clickable = onRowClick !== undefined;
              return (
                <tr
                  key={getKey(row)}
                  onClick={clickable ? () => onRowClick(i) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick(i);
                          }
                        }
                      : undefined
                  }
                  tabIndex={clickable ? 0 : undefined}
                  className="result-table-row"
                  data-selected={isSelected ? 'true' : 'false'}
                  data-clickable={clickable ? 'true' : 'false'}
                  aria-current={clickable && isSelected ? 'true' : undefined}
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
