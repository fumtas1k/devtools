import { useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { CopyButton } from '@/components/ui/CopyButton';
import { bodyEmphasis, caption, colors } from '@/utils/styles';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { CountInput } from '@/components/ui/CountInput';
import { ClearButton } from '@/components/ui/ClearButton';
import { ResultTable } from '@/components/ui/ResultTable';
import type { TableColumn } from '@/components/ui/ResultTable';
import { parseUuidV7Fields, extractUuidV7Timestamp } from '@/utils/uuid-v7';

interface UuidRow {
  id: string;
  timestamp: string;
}

/** フィールド分解パネル用の色定義 */
const FIELD_COLORS = {
  unixTsMs: colors.primary,
  ver: '#7C3AED',
  randA: '#059669',
  varNibble: '#D97706',
  randB: '#0891B2',
} as const;

function generateRows(count: number): UuidRow[] {
  return Array.from({ length: count }, () => {
    const id = uuidv7();
    return { id, timestamp: extractUuidV7Timestamp(id) };
  });
}

type QuoteStyle = 'none' | 'single' | 'double';

/** UUID 文字列を色分けして表示する */
function ColoredUuid({ uuid }: { uuid: string }) {
  const parts = uuid.split('-');
  return (
    <span className="font-mono" style={{ ...caption, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
      <span style={{ color: FIELD_COLORS.unixTsMs }}>{parts[0]}</span>
      <span style={{ color: colors.muted }}>-</span>
      <span style={{ color: FIELD_COLORS.unixTsMs }}>{parts[1]}</span>
      <span style={{ color: colors.muted }}>-</span>
      <span style={{ color: FIELD_COLORS.ver }}>{parts[2][0]}</span>
      <span style={{ color: FIELD_COLORS.randA }}>{parts[2].substring(1)}</span>
      <span style={{ color: colors.muted }}>-</span>
      <span style={{ color: FIELD_COLORS.varNibble }}>{parts[3][0]}</span>
      <span style={{ color: FIELD_COLORS.randB }}>{parts[3].substring(1)}</span>
      <span style={{ color: colors.muted }}>-</span>
      <span style={{ color: FIELD_COLORS.randB }}>{parts[4]}</span>
    </span>
  );
}

/** フィールド分解パネル */
function FieldBreakdownPanel({ uuid }: { uuid: string }) {
  const fields = parseUuidV7Fields(uuid);

  const fieldDefs = [
    { key: 'unix_ts_ms', bits: '48bit', value: fields.unixTsMs, color: FIELD_COLORS.unixTsMs },
    { key: 'ver', bits: '4bit', value: fields.ver, color: FIELD_COLORS.ver },
    { key: 'rand_a', bits: '12bit', value: fields.randA, color: FIELD_COLORS.randA },
    { key: 'var', bits: '2bit', value: fields.varNibble, color: FIELD_COLORS.varNibble },
    { key: 'rand_b', bits: '62bit', value: fields.randB, color: FIELD_COLORS.randB },
  ] as const;

  return (
    <div
      className="rounded-lg p-3"
      style={{ background: colors.bgSubtle, border: `1px solid ${colors.border}` }}
    >
      <p style={{ ...caption, color: colors.muted, marginBottom: '0.5rem' }}>フィールド分解</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {fieldDefs.map((f) => (
          <div key={f.key} className="flex flex-col gap-0.5">
            <span style={{ ...caption, color: colors.muted, fontSize: '0.75rem' }}>
              {f.key}{' '}
              <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>({f.bits})</span>
            </span>
            <code
              className="rounded px-1.5 py-0.5"
              style={{
                ...caption,
                fontFamily: 'monospace',
                color: f.color,
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                whiteSpace: 'nowrap',
              }}
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
  const [quoteStyle, setQuoteStyle] = useState<QuoteStyle>('none');

  const formatId = (id: string) => {
    if (quoteStyle === 'double') return `"${id}"`;
    if (quoteStyle === 'single') return `'${id}'`;
    return id;
  };

  const allUuids = rows
    .map((r, i) => {
      const isLast = i === rows.length - 1;
      if (quoteStyle === 'double') return `"${r.id}"${isLast ? '' : ','}`;
      if (quoteStyle === 'single') return `'${r.id}'${isLast ? '' : ','}`;
      return r.id;
    })
    .join('\n');

  const columns: TableColumn<UuidRow>[] = [
    {
      key: 'no',
      header: 'No.',
      headerAlign: 'right',
      cellAlign: 'right',
      width: '3.5rem',
      cellStyle: { ...caption, color: colors.muted, padding: '0.5rem 0.75rem', fontVariantNumeric: 'tabular-nums' },
      render: (_, i) => i + 1,
    },
    {
      key: 'uuid',
      header: 'UUID',
      cellStyle: { padding: '0.5rem 0.75rem' },
      render: (row) => <ColoredUuid uuid={row.id} />,
    },
    {
      key: 'timestamp',
      header: 'タイムスタンプ（ISO 8601）',
      className: 'font-mono',
      cellStyle: { ...caption, color: colors.muted, padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' },
      render: (row) => row.timestamp,
    },
    {
      key: 'copy',
      header: 'コピー',
      headerAlign: 'center',
      cellAlign: 'center',
      width: '6rem',
      cellStyle: { padding: '0.25rem 0.5rem', whiteSpace: 'nowrap' },
      render: (row) => <CopyButton text={formatId(row.id)} compact />,
    },
  ];

  return (
    <div className="space-y-4">
      <CountInput
        id="uuid-count"
        defaultValue={1}
        onGenerate={(count) => {
          const newRows = generateRows(count);
          setRows(newRows);
          setSelectedIndex(newRows.length > 0 ? 0 : null);
        }}
      />

      {rows.length > 0 && (
        <div className="space-y-3">
          <ResultTable
            rows={rows}
            columns={columns}
            getKey={(row) => row.id}
            minWidth="42rem"
            selectedIndex={selectedIndex}
            onRowClick={setSelectedIndex}
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
                    <CopyButton text={allUuids} label="すべてコピー" />
                  </div>
                  <ClearButton onClick={() => { setRows([]); setSelectedIndex(null); }} />
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
