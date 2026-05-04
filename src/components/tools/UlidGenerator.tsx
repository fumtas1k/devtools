import { useState } from 'react';
import { ulid } from 'ulidx';
import { CopyButton } from '@/components/ui/CopyButton';
import { bodyEmphasis, colors } from '@/utils/styles';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { CountInput } from '@/components/ui/CountInput';
import { ClearButton } from '@/components/ui/ClearButton';
import { ResultTable } from '@/components/ui/ResultTable';
import type { TableColumn } from '@/components/ui/ResultTable';

interface UlidRow {
  id: string;
  timestamp: string;
}

function generateRows(count: number): UlidRow[] {
  return Array.from({ length: count }, () => {
    const id = ulid();
    const timestamp = new Date().toISOString();
    return { id, timestamp };
  });
}

type QuoteStyle = 'none' | 'single' | 'double';

export function UlidGeneratorTool() {
  const [rows, setRows] = useState<UlidRow[]>([]);
  const [quoteStyle, setQuoteStyle] = useState<QuoteStyle>('none');

  const formatId = (id: string) => {
    if (quoteStyle === 'double') return `"${id}"`;
    if (quoteStyle === 'single') return `'${id}'`;
    return id;
  };

  const allUlids = rows
    .map((r, i) => {
      const isLast = i === rows.length - 1;
      if (quoteStyle === 'double') return `"${r.id}"${isLast ? '' : ','}`;
      if (quoteStyle === 'single') return `'${r.id}'${isLast ? '' : ','}`;
      return r.id;
    })
    .join('\n');

  const columns: TableColumn<UlidRow>[] = [
    {
      key: 'no',
      header: 'No.',
      headerAlign: 'right',
      cellAlign: 'right',
      width: '3.5rem',
      className: 'text-muted tabular-nums',
      render: (_, i) => i + 1,
    },
    {
      key: 'ulid',
      header: 'ULID',
      className: 'font-mono whitespace-nowrap',
      render: (row) => (
        <>
          <span style={{ color: colors.primary }}>{row.id.slice(0, 10)}</span>
          <span>{row.id.slice(10)}</span>
        </>
      ),
    },
    {
      key: 'timestamp',
      header: 'タイムスタンプ（ISO 8601）',
      className: 'font-mono text-muted whitespace-nowrap',
      render: (row) => row.timestamp,
    },
    {
      key: 'copy',
      header: 'コピー',
      headerAlign: 'center',
      cellAlign: 'center',
      width: '6rem',
      cellPadding: 'compact',
      className: 'whitespace-nowrap',
      render: (row) => <CopyButton text={formatId(row.id)} compact />,
    },
  ];

  return (
    <div className="space-y-6">
      <CountInput
        id="ulid-count"
        defaultValue={10}
        onGenerate={(count) => setRows(generateRows(count))}
      />

      {rows.length > 0 && (
        <div role="status" aria-live="polite">
          <ResultTable
            rows={rows}
            columns={columns}
            getKey={(row) => row.id}
            minWidth="36rem"
            renderHeader={() => (
              <>
                <span style={{ ...bodyEmphasis, color: colors.text }}>{rows.length} 件生成</span>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="shrink-0">
                    <ToggleGroup<QuoteStyle>
                      options={[
                        { value: 'none', label: 'なし' },
                        { value: 'double', label: '"..."' },
                        { value: 'single', label: "'...'" },
                      ]}
                      value={quoteStyle}
                      onChange={setQuoteStyle}
                      ariaLabel="クォートスタイル"
                      size="sm"
                    />
                  </div>
                  <div className="shrink-0">
                    <CopyButton text={allUlids} label="すべてコピー" />
                  </div>
                  <ClearButton onClick={() => setRows([])} />
                </div>
              </>
            )}
          />
        </div>
      )}
    </div>
  );
}
