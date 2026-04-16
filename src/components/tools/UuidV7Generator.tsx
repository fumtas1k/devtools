import { useState, useCallback } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { CopyButton } from '@/components/ui/CopyButton';
import { bodyEmphasis, caption, micro, colors, onFocusRing, onBlurRing } from '@/utils/styles';
import { useClampedInput } from '@/hooks/useClampedInput';
import { parseUuidV7Fields, extractUuidV7Timestamp } from '@/utils/uuid-v7';

interface UuidRow {
  id: string;
  timestamp: string;
}

/** フィールド分解パネル用の色定義 */
const FIELD_COLORS = {
  unixTsMs: '#1A56DB', // primary blue
  ver: '#7C3AED',      // purple
  randA: '#059669',    // green
  varNibble: '#D97706', // amber
  randB: '#0891B2',    // cyan
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
  // tttttttt-tttt-7rrr-Vrrr-rrrrrrrrrrrr
  const parts = uuid.split('-');
  return (
    <span className="font-mono" style={{ ...micro, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
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
      <p style={{ ...micro, color: colors.muted, marginBottom: '0.5rem' }}>フィールド分解</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {fieldDefs.map((f) => (
          <div key={f.key} className="flex flex-col gap-0.5">
            <span style={{ ...micro, color: colors.muted, fontSize: '0.75rem' }}>
              {f.key}{' '}
              <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>({f.bits})</span>
            </span>
            <code
              className="rounded px-1.5 py-0.5"
              style={{
                ...micro,
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
  const {
    value: count,
    inputStr: countInput,
    handleChange: handleCountChange,
    handleBlur: handleCountBlur,
  } = useClampedInput(1, 1, 100);
  const [rows, setRows] = useState<UuidRow[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [quoteStyle, setQuoteStyle] = useState<QuoteStyle>('none');

  const generate = useCallback(() => {
    const newRows = generateRows(count);
    setRows(newRows);
    setSelectedIndex(newRows.length > 0 ? 0 : null);
  }, [count]);

  const allUuids = rows
    .map((r, i) => {
      const isLast = i === rows.length - 1;
      if (quoteStyle === 'double') return `"${r.id}"${isLast ? '' : ','}`;
      if (quoteStyle === 'single') return `'${r.id}'${isLast ? '' : ','}`;
      return r.id;
    })
    .join('\n');

  const formatId = (id: string) => {
    if (quoteStyle === 'double') return `"${id}"`;
    if (quoteStyle === 'single') return `'${id}'`;
    return id;
  };

  return (
    <div className="space-y-4">
      {/* コントロール */}
      <div>
        <label
          htmlFor="uuid-count"
          style={{ ...bodyEmphasis, color: colors.text, display: 'block', marginBottom: '0.25rem' }}
        >
          生成数
        </label>
        <div className="flex items-center gap-3">
          <input
            id="uuid-count"
            type="number"
            min={1}
            max={100}
            value={countInput}
            onChange={(e) => handleCountChange(e.target.value)}
            onBlur={handleCountBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCountBlur();
                generate();
              }
            }}
            className="rounded-lg px-3 py-2"
            style={{
              ...caption,
              width: '6rem',
              border: `1px solid ${colors.borderInput}`,
              outline: 'none',
              background: colors.bg,
              color: colors.text,
            }}
            onFocus={onFocusRing}
            onBlurCapture={onBlurRing}
            aria-describedby="uuid-count-hint"
          />
          <button
            onClick={generate}
            className="rounded-lg px-4 py-2 transition-colors"
            style={{
              ...caption,
              fontWeight: 600,
              background: colors.primary,
              color: '#ffffff',
              border: 'none',
            }}
            onFocus={onFocusRing}
            onBlur={onBlurRing}
          >
            生成
          </button>
        </div>
        <p id="uuid-count-hint" style={{ ...micro, color: colors.muted, marginTop: '0.25rem' }}>
          1〜100
        </p>
      </div>

      {/* 結果テーブル */}
      {rows.length > 0 && (
        <div className="space-y-3">
          <div
            className="rounded-lg"
            style={{ border: `1px solid ${colors.border}`, overflow: 'hidden' }}
          >
            {/* テーブルヘッダー + 操作ボタン */}
            <div
              className="flex flex-col gap-2 px-4 py-3"
              style={{ background: colors.bgSubtle, borderBottom: `1px solid ${colors.border}` }}
            >
              <span style={{ ...bodyEmphasis, color: colors.text }}>{rows.length} 件生成</span>
              <div className="flex flex-wrap items-center gap-2">
                {/* クォートスタイル選択 */}
                <div
                  className="flex items-center rounded-lg overflow-hidden shrink-0"
                  style={{ border: `1px solid ${colors.borderInput}` }}
                  role="group"
                  aria-label="クォートスタイル"
                >
                  {(
                    [
                      ['none', 'なし'],
                      ['double', '"..."'],
                      ['single', "'...'"],
                    ] as [QuoteStyle, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setQuoteStyle(value)}
                      style={{
                        ...micro,
                        padding: '0.25rem 0.625rem',
                        background: quoteStyle === value ? colors.primary : colors.bg,
                        color: quoteStyle === value ? '#ffffff' : colors.muted,
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        fontFamily: value !== 'none' ? 'monospace' : 'inherit',
                        borderRight: value !== 'single' ? `1px solid ${colors.borderInput}` : 'none',
                      }}
                      aria-pressed={quoteStyle === value}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="shrink-0">
                  <CopyButton text={allUuids} label="すべてコピー" />
                </div>
                <button
                  onClick={() => { setRows([]); setSelectedIndex(null); }}
                  className="rounded-lg px-3 py-1.5 transition-colors shrink-0"
                  style={{ ...caption, color: colors.muted, whiteSpace: 'nowrap' }}
                >
                  クリア
                </button>
              </div>
            </div>

            {/* スクロール対応テーブル */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '42rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr
                    style={{
                      background: colors.bgSurface,
                      borderBottom: `1px solid ${colors.border}`,
                    }}
                  >
                    <th
                      scope="col"
                      style={{
                        ...micro,
                        color: colors.muted,
                        textAlign: 'right',
                        padding: '0.5rem 0.75rem',
                        whiteSpace: 'nowrap',
                        fontWeight: 600,
                        width: '3.5rem',
                      }}
                    >
                      No.
                    </th>
                    <th
                      scope="col"
                      style={{
                        ...micro,
                        color: colors.muted,
                        textAlign: 'left',
                        padding: '0.5rem 0.75rem',
                        whiteSpace: 'nowrap',
                        fontWeight: 600,
                      }}
                    >
                      UUID
                    </th>
                    <th
                      scope="col"
                      style={{
                        ...micro,
                        color: colors.muted,
                        textAlign: 'left',
                        padding: '0.5rem 0.75rem',
                        whiteSpace: 'nowrap',
                        fontWeight: 600,
                      }}
                    >
                      タイムスタンプ（ISO 8601）
                    </th>
                    <th
                      scope="col"
                      style={{
                        ...micro,
                        color: colors.muted,
                        textAlign: 'center',
                        padding: '0.5rem 0.75rem',
                        whiteSpace: 'nowrap',
                        fontWeight: 600,
                        width: '6rem',
                      }}
                    >
                      コピー
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const isSelected = selectedIndex === i;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedIndex(i)}
                        style={{
                          borderBottom: i < rows.length - 1 ? `1px solid ${colors.border}` : 'none',
                          background: isSelected
                            ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-bg))'
                            : i % 2 === 0
                              ? colors.bg
                              : colors.bgSurface,
                          cursor: 'pointer',
                          outline: isSelected ? `2px solid ${colors.primary}` : 'none',
                          outlineOffset: '-2px',
                        }}
                        aria-selected={isSelected}
                      >
                        <td
                          style={{
                            ...micro,
                            color: colors.muted,
                            textAlign: 'right',
                            padding: '0.5rem 0.75rem',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {i + 1}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <ColoredUuid uuid={row.id} />
                        </td>
                        <td
                          className="font-mono"
                          style={{
                            ...micro,
                            color: colors.muted,
                            padding: '0.5rem 0.75rem',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.timestamp}
                        </td>
                        <td
                          style={{
                            padding: '0.25rem 0.5rem',
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <CopyButton text={formatId(row.id)} compact />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* フィールド分解パネル */}
          {selectedIndex !== null && rows[selectedIndex] && (
            <FieldBreakdownPanel uuid={rows[selectedIndex].id} />
          )}
        </div>
      )}
    </div>
  );
}
