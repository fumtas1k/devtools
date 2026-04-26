import type { ReactNode, CSSProperties } from 'react';
import { caption, colors } from '@/utils/styles';

export interface TableColumn<T> {
  key: string;
  header: string;
  headerAlign?: 'left' | 'right' | 'center';
  cellAlign?: 'left' | 'right' | 'center';
  width?: string;
  className?: string;
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
    <div className="rounded-lg" style={{ border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
      {renderHeader && (
        <div
          className="flex flex-col gap-2 px-4 py-3"
          style={{ background: colors.bgSubtle, borderBottom: `1px solid ${colors.border}` }}
        >
          {renderHeader()}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: colors.bgSurface, borderBottom: `1px solid ${colors.border}` }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  style={{
                    ...caption,
                    color: colors.muted,
                    textAlign: col.headerAlign ?? 'left',
                    padding: '0.5rem 0.75rem',
                    whiteSpace: 'nowrap',
                    fontWeight: 600,
                    width: col.width,
                  }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isSelected = selectedIndex === i;
              const isLast = i === rows.length - 1;
              return (
                <tr
                  key={getKey(row)}
                  onClick={onRowClick ? () => onRowClick(i) : undefined}
                  style={{
                    background: isSelected
                      ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-bg))'
                      : i % 2 === 0
                        ? colors.bg
                        : colors.bgSurface,
                    cursor: onRowClick ? 'pointer' : undefined,
                  }}
                  aria-selected={onRowClick ? isSelected : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={col.className}
                      style={{
                        ...col.cellStyle,
                        textAlign: col.cellAlign,
                        borderTop: `2px solid ${isSelected ? colors.primary : 'transparent'}`,
                        borderBottom: `2px solid ${isSelected ? colors.primary : 'transparent'}`,
                        boxShadow: !isSelected && !isLast ? `inset 0 -1px 0 ${colors.border}` : 'none',
                      }}
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
