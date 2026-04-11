import { useState, useCallback, useEffect, type CSSProperties } from 'react';
import { ulid } from 'ulidx';
import { CopyButton } from '../ui/CopyButton';

const bodyEmphasis: CSSProperties = { fontSize: '1.06rem', fontWeight: 600, lineHeight: 1.24, letterSpacing: '-0.374px' };
const caption: CSSProperties = { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.29, letterSpacing: '-0.224px' };
const micro: CSSProperties = { fontSize: '0.75rem', fontWeight: 400, lineHeight: 1.33, letterSpacing: '-0.12px' };

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

export function UlidGenerator() {
  const [count, setCount] = useState(10);
  const [countInput, setCountInput] = useState('10');
  const [rows, setRows] = useState<UlidRow[]>([]);

  const generate = useCallback(() => {
    const n = Math.min(100, Math.max(1, count));
    setRows(generateRows(n));
  }, [count]);

  // ページロード時に自動生成
  useEffect(() => {
    generate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCountChange = (value: string) => {
    setCountInput(value);
    const n = parseInt(value, 10);
    if (!isNaN(n) && n >= 1 && n <= 100) {
      setCount(n);
    }
  };

  const handleCountBlur = () => {
    const n = parseInt(countInput, 10);
    if (isNaN(n) || n < 1) {
      setCount(1);
      setCountInput('1');
    } else if (n > 100) {
      setCount(100);
      setCountInput('100');
    } else {
      setCount(n);
      setCountInput(String(n));
    }
  };

  const allUlids = rows.map((r) => r.id).join('\n');

  return (
    <div className="space-y-4">
      {/* コントロール */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="ulid-count"
            style={{ ...bodyEmphasis, color: '#1d1d1f', display: 'block', marginBottom: '0.25rem' }}
          >
            生成数
          </label>
          <input
            id="ulid-count"
            type="number"
            min={1}
            max={100}
            value={countInput}
            onChange={(e) => handleCountChange(e.target.value)}
            onBlur={handleCountBlur}
            className="rounded-lg px-3 py-2"
            style={{
              ...caption,
              width: '6rem',
              border: '1px solid rgba(0,0,0,0.2)',
              outline: 'none',
              background: '#ffffff',
              color: '#1d1d1f',
            }}
            onFocus={(e) => {
              e.target.style.outline = '2px solid #0071e3';
              e.target.style.outlineOffset = '2px';
            }}
            onBlurCapture={(e) => {
              e.target.style.outline = 'none';
            }}
            aria-describedby="ulid-count-hint"
          />
          <p id="ulid-count-hint" style={{ ...micro, color: 'rgba(0,0,0,0.48)', marginTop: '0.25rem' }}>
            1〜100
          </p>
        </div>
        <button
          onClick={generate}
          className="rounded-lg px-4 py-2 transition-colors"
          style={{
            ...caption,
            fontWeight: 600,
            background: '#0071e3',
            color: '#ffffff',
            border: 'none',
          }}
          onFocus={(e) => {
            (e.target as HTMLButtonElement).style.outline = '2px solid #0071e3';
            (e.target as HTMLButtonElement).style.outlineOffset = '2px';
          }}
          onBlur={(e) => {
            (e.target as HTMLButtonElement).style.outline = 'none';
          }}
        >
          生成
        </button>
      </div>

      {/* 結果テーブル */}
      {rows.length > 0 && (
        <div className="rounded-lg" style={{ border: '1px solid rgba(0,0,0,0.12)', overflow: 'hidden' }}>
          {/* テーブルヘッダー + 操作ボタン */}
          <div
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            style={{ background: '#f5f5f7', borderBottom: '1px solid rgba(0,0,0,0.1)' }}
          >
            <span style={{ ...bodyEmphasis, color: '#1d1d1f' }}>
              {rows.length} 件生成
            </span>
            <div className="flex items-center gap-2">
              <CopyButton text={allUlids} label="すべてコピー" />
              <button
                onClick={() => setRows([])}
                className="rounded-lg px-3 py-1.5 transition-colors hover:bg-apple-light"
                style={{ ...caption, color: 'rgba(0,0,0,0.48)' }}
              >
                クリア
              </button>
            </div>
          </div>

          {/* スクロール対応テーブル */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                  <th
                    scope="col"
                    style={{
                      ...micro,
                      color: 'rgba(0,0,0,0.48)',
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
                      color: 'rgba(0,0,0,0.48)',
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
                      color: 'rgba(0,0,0,0.48)',
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
                      color: 'rgba(0,0,0,0.48)',
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
                      borderBottom: i < rows.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                      background: i % 2 === 0 ? '#ffffff' : '#fafafa',
                    }}
                  >
                    <td
                      style={{
                        ...micro,
                        color: 'rgba(0,0,0,0.48)',
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
                        color: '#1d1d1f',
                        padding: '0.5rem 0.75rem',
                        whiteSpace: 'nowrap',
                        letterSpacing: '0.02em',
                      }}
                    >
                      <span style={{ color: '#0071e3' }}>{row.id.slice(0, 10)}</span>
                      <span>{row.id.slice(10)}</span>
                    </td>
                    <td
                      className="font-mono"
                      style={{
                        ...micro,
                        color: 'rgba(0,0,0,0.64)',
                        padding: '0.5rem 0.75rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.timestamp}
                    </td>
                    <td style={{ padding: '0.25rem 0.75rem', textAlign: 'center' }}>
                      <CopyButton text={row.id} label="コピー" />
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
