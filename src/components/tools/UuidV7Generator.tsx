import { useState } from 'react';
import { cx } from '@/utils/cx';
import { v7 as uuidv7 } from 'uuid';
import { CopyButton } from '@/components/ui/CopyButton';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { CountInput } from '@/components/ui/CountInput';
import { ClearButton } from '@/components/ui/ClearButton';
import { ResultTable } from '@/components/ui/ResultTable';
import type { TableColumn } from '@/components/ui/ResultTable';
import { parseUuidV7Fields, extractUuidV7Timestamp } from '@/utils/uuid-v7';
import { useQuoteStyle, QUOTE_OPTIONS, type QuoteStyle } from '@/hooks/useQuoteStyle';

interface UuidRow {
  id: string;
  timestamp: string;
}

/** フィールド分解パネル用の class 定義 */
const FIELD_CLASSES = {
  unixTsMs: 'uuid-field-ts',
  ver: 'uuid-field-ver',
  randA: 'uuid-field-rand-a',
  varNibble: 'uuid-field-var',
  randB: 'uuid-field-rand-b',
} as const;

function generateRows(count: number): UuidRow[] {
  return Array.from({ length: count }, () => {
    const id = uuidv7();
    return { id, timestamp: extractUuidV7Timestamp(id) };
  });
}

/** UUID 文字列を色分けして表示する */
function ColoredUuid({ uuid, quoteStyle }: { uuid: string; quoteStyle: QuoteStyle }) {
  const parts = uuid.split('-');
  const quote = quoteStyle === 'double' ? '"' : quoteStyle === 'single' ? "'" : '';
  const fullText = `${quote}${uuid}${quote}`;

  return (
    <span className="font-mono caption whitespace-nowrap" aria-label={fullText} title={fullText}>
      {quote && <span className="text-muted">{quote}</span>}
      <span className={FIELD_CLASSES.unixTsMs}>{parts[0]}</span>
      <span className="text-muted">-</span>
      <span className={FIELD_CLASSES.unixTsMs}>{parts[1]}</span>
      <span className="text-muted">-</span>
      <span className={FIELD_CLASSES.ver}>{parts[2][0]}</span>
      <span className={FIELD_CLASSES.randA}>{parts[2].substring(1)}</span>
      <span className="text-muted">-</span>
      <span className={FIELD_CLASSES.varNibble}>{parts[3][0]}</span>
      <span className={FIELD_CLASSES.randB}>{parts[3].substring(1)}</span>
      <span className="text-muted">-</span>
      <span className={FIELD_CLASSES.randB}>{parts[4]}</span>
      {quote && <span className="text-muted">{quote}</span>}
    </span>
  );
}

/** フィールド分解パネル */
function FieldBreakdownPanel({ uuid }: { uuid: string }) {
  const fields = parseUuidV7Fields(uuid);

  const fieldDefs = [
    { key: 'unix_ts_ms', bits: '48bit', value: fields.unixTsMs, className: FIELD_CLASSES.unixTsMs },
    { key: 'ver', bits: '4bit', value: fields.ver, className: FIELD_CLASSES.ver },
    { key: 'rand_a', bits: '12bit', value: fields.randA, className: FIELD_CLASSES.randA },
    { key: 'var', bits: '2bit', value: fields.varNibble, className: FIELD_CLASSES.varNibble },
    { key: 'rand_b', bits: '62bit', value: fields.randB, className: FIELD_CLASSES.randB },
  ] as const;

  return (
    <div className="rounded-lg p-3 bg-subtle border border-default">
      <p className="caption text-muted mb-2">フィールド分解</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {fieldDefs.map((f) => (
          <div key={f.key} className="flex flex-col gap-0.5">
            <span className="caption text-muted uuid-field-key">
              {f.key} <span className="uuid-field-bits">({f.bits})</span>
            </span>
            <code
              className={cx(
                'font-mono whitespace-nowrap rounded px-1.5 py-0.5 bg-default border border-default caption',
                f.className
              )}
            >
              {f.value}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UuidV7GeneratorTool() {
  const [rows, setRows] = useState<UuidRow[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { quoteStyle, setQuoteStyle, formatId, formatAll } = useQuoteStyle();

  const allUuids = formatAll(rows.map((r) => r.id));

  const columns: TableColumn<UuidRow>[] = [
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
      key: 'uuid',
      header: 'UUID',
      render: (row) => <ColoredUuid uuid={row.id} quoteStyle={quoteStyle} />,
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
        id="uuid-count"
        defaultValue={10}
        onGenerate={(count) => {
          const newRows = generateRows(count);
          setRows(newRows);
          setSelectedIndex(newRows.length > 0 ? 0 : null);
        }}
      />

      {rows.length > 0 && (
        <div className="space-y-3" role="status" aria-live="polite">
          <ResultTable
            rows={rows}
            columns={columns}
            getKey={(row) => row.id}
            minWidth="42rem"
            selectedIndex={selectedIndex}
            onRowClick={setSelectedIndex}
            renderHeader={() => (
              <>
                <span className="body-emphasis text-default">{rows.length} 件生成</span>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="shrink-0">
                    <ToggleGroup<QuoteStyle>
                      options={QUOTE_OPTIONS}
                      value={quoteStyle}
                      onChange={setQuoteStyle}
                      ariaLabel="クォートスタイル"
                      size="sm"
                    />
                  </div>
                  <div className="shrink-0">
                    <CopyButton text={allUuids} label="すべてコピー" />
                  </div>
                  <ClearButton
                    onClick={() => {
                      setRows([]);
                      setSelectedIndex(null);
                    }}
                  />
                </div>
              </>
            )}
          />

          {selectedIndex !== null && rows[selectedIndex] && (
            <FieldBreakdownPanel uuid={rows[selectedIndex].id} />
          )}
        </div>
      )}
    </div>
  );
}
