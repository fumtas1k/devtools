import { useState, useCallback } from 'react';
import { ulid } from 'ulidx';
import { CopyButton } from '../ui/CopyButton';
import { bodyEmphasis, caption, micro, colors, onFocusRing, onBlurRing } from '../../utils/styles';
import { useClampedInput } from '../../hooks/useClampedInput';

interface UlidRow {
  id: string;
  timestamp: string;
}

function generateRows(count: number): UlidRow[] {
  return Array.from({ length: count }, () => {
    const id = ulid();
    // ULIDの最初の10文字はタイムスタンプ (48bit, Crockford Base32)
    // ulidx はミリ秒精度なので Date.now() で近似値を取得
    const timestamp = new Date().toISOString();
    return { id, timestamp };
  });
}

type QuoteStyle = 'none' | 'single' | 'double';

export function UlidGeneratorTool() {
  const {
    value: count,
    inputStr: countInput,
    handleChange: handleCountChange,
    handleBlur: handleCountBlur,
  } = useClampedInput(10, 1, 100);
  const [rows, setRows] = useState<UlidRow[]>([]);
  const [quoteStyle, setQuoteStyle] = useState<QuoteStyle>('none');

  const generate = useCallback(() => {
    setRows(generateRows(count));
  }, [count]);

  const allUlids = rows
    .map((r, i) => {
      const isLast = i === rows.length - 1;
      if (quoteStyle === 'double') return `"${r.id}"${isLast ? '' : ','}`;
      if (quoteStyle === 'single') return `'${r.id}'${isLast ? '' : ','}`;
      return r.id;
    })
    .join('\n');

  return (
    <div className="space-y-4">
      {/* コントロール */}
      <div>
        <label
          htmlFor="ulid-count"
          style={{ ...bodyEmphasis, color: colors.text, display: 'block', marginBottom: '0.25rem' }}
        >
          生成数
        </label>
        <div className="flex items-center gap-3">
          <input
            id="ulid-count"
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
            aria-describedby="ulid-count-hint"
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
        <p id="ulid-count-hint" style={{ ...micro, color: colors.muted, marginTop: '0.25rem' }}>
          1〜100
        </p>
      </div>

      {/* 結果テーブル */}
      {rows.length > 0 && (
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
                <CopyButton text={allUlids} label="すべてコピー" />
              </div>
              <button
                onClick={() => setRows([])}
                className="rounded-lg px-3 py-1.5 transition-colors shrink-0"
                style={{ ...caption, color: colors.muted, whiteSpace: 'nowrap' }}
              >
                クリア
              </button>
            </div>
          </div>

          {/* スクロール対応テーブル */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '36rem', borderCollapse: 'collapse' }}>
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
                    ULID
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
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: i < rows.length - 1 ? `1px solid ${colors.border}` : 'none',
                      background: i % 2 === 0 ? colors.bg : colors.bgSurface,
                    }}
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
                    <td
                      className="font-mono"
                      style={{
                        ...micro,
                        color: colors.text,
                        padding: '0.5rem 0.75rem',
                        whiteSpace: 'nowrap',
                        letterSpacing: '0.02em',
                      }}
                    >
                      <span style={{ color: colors.primary }}>{row.id.slice(0, 10)}</span>
                      <span>{row.id.slice(10)}</span>
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
                      <CopyButton
                        text={
                          quoteStyle === 'double'
                            ? `"${row.id}"`
                            : quoteStyle === 'single'
                              ? `'${row.id}'`
                              : row.id
                        }
                        compact
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
