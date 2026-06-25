/**
 * コントラスト比マトリクス。
 * N 色の全組合せ（行=前景, 列=背景）について WCAG コントラスト比（AA/AAA 合否）と
 * APCA Lc を併記する。計算はすべてブラウザ内で完結し外部送信しない。
 *
 * CSP 対応: style-src 'unsafe-inline' 撤去済みのため inline style は使用不可。
 * セルのプレビュー色（ユーザー入力の任意色）は useDynamicStyleSheet で
 * per-instance scoped な CSS ルール（.cell-fg / .cell-bg への color / background）を
 * 注入して適用する。
 * 淡色化フィルタは .cell-dimmed class（opacity: 0.3）で表現する。
 */
import { useMemo, useState } from 'react';
import { InputField } from '@/components/ui/InputField';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { NotificationBanner } from '@/components/ui/NotificationBanner';
import { useDynamicStyleSheet } from '@/hooks/useDynamicStyleSheet';
import { parseColor, buildMatrix, rgbToCss } from '@/utils/contrast';
import type { ColorEntry } from '@/utils/contrast';

type FilterMode = 'all' | 'aa' | 'aaa';

const FILTER_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'aa', label: 'AA 以上' },
  { value: 'aaa', label: 'AAA 以上' },
];

/** 入力行（HEX 文字列とラベルを保持。RGB はパース結果） */
interface ColorRow {
  id: string;
  label: string;
  hex: string;
}

const INITIAL_ROWS: ColorRow[] = [
  { id: 'c1', label: 'テキスト', hex: '#1a1a1a' },
  { id: 'c2', label: '背景', hex: '#ffffff' },
  { id: 'c3', label: 'プライマリ', hex: '#0017c1' },
  { id: 'c4', label: 'アクセント', hex: '#d32f2f' },
];

let idCounter = 0;
const nextId = () => `c-${++idCounter}`;

/** color input には #rrggbb が必要。#rgb / rgb() を #rrggbb に正規化する。 */
function toHex(input: string): string {
  const rgb = parseColor(input);
  if (!rgb) return '#000000';
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
}

/**
 * マトリクスのセルプレビュー色を CSS 変数として注入するコンポーネント。
 * CSP 制約により inline style は使用できないため、useDynamicStyleSheet で
 * per-instance scoped CSS rule を生成し .cell-fg / .cell-bg class に適用する。
 */
interface CellPreviewProps {
  fgCss: string;
  bgCss: string;
}

function CellPreview({ fgCss, bgCss }: CellPreviewProps) {
  const dynClass = useDynamicStyleSheet(
    (cls) => `.${cls} .cell-fg { color: ${fgCss}; }` + `.${cls} .cell-bg { background: ${bgCss}; }`
  );

  return (
    <div className={`rounded p-2 cell-preview-wrap ${dynClass}`} data-cell-preview>
      <span className="cell-fg">
        <span className="cell-bg rounded px-1">サンプル</span>
      </span>
    </div>
  );
}

export function ContrastMatrixTool() {
  const [rows, setRows] = useState<ColorRow[]>(INITIAL_ROWS);
  const [filter, setFilter] = useState<FilterMode>('all');

  const updateRow = (id: string, patch: Partial<ColorRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { id: nextId(), label: '', hex: '#000000' }]);
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  // パース済みの有効色のみマトリクス対象にする
  const validColors = useMemo<ColorEntry[]>(
    () =>
      rows
        .map((r) => {
          const rgb = parseColor(r.hex);
          return rgb ? { id: r.id, label: r.label || r.hex, rgb } : null;
        })
        .filter((x): x is ColorEntry => x !== null),
    [rows]
  );

  const matrix = useMemo(() => buildMatrix(validColors), [validColors]);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="body-emphasis text-default">色の一覧</h2>
        {rows.map((row, rowIdx) => {
          const invalid = parseColor(row.hex) === null;
          // 見出し（色 / ラベル）は先頭行のみ視覚表示し、2 行目以降は sr-only 化して
          // 重複を避ける（各入力のアクセシブル名は label で維持される）。
          const showLabels = rowIdx === 0;
          return (
            <div key={row.id} className="flex items-end gap-2">
              <input
                type="color"
                aria-label={`${row.label || '色'}のカラーピッカー`}
                value={parseColor(row.hex) ? toHex(row.hex) : '#000000'}
                onChange={(e) => updateRow(row.id, { hex: e.target.value })}
                className="h-10 w-12 shrink-0 rounded border border-input"
              />
              <div className="min-w-0 max-w-32 flex-1">
                <InputField
                  id={`hex-${row.id}`}
                  label="色"
                  labelVisible={showLabels}
                  value={row.hex}
                  onChange={(v) => updateRow(row.id, { hex: v })}
                  error={invalid ? '不正な色' : undefined}
                  mono
                />
              </div>
              <div className="min-w-0 max-w-40 flex-1">
                <InputField
                  id={`label-${row.id}`}
                  label="ラベル"
                  labelVisible={showLabels}
                  value={row.label}
                  onChange={(v) => updateRow(row.id, { label: v })}
                  placeholder="任意"
                />
              </div>
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={rows.length <= 2}
                className="caption btn-remove-card shrink-0 rounded px-3 py-2"
              >
                削除
              </button>
            </div>
          );
        })}
        <button type="button" onClick={addRow} className="caption text-link-plain btn-link-plain">
          ＋ 色を追加
        </button>
      </section>

      <NotificationBanner variant="info" title="不透明色のみ対応">
        アルファ付き（半透明）の色は v1 では非対応です。HEX（#rgb / #rrggbb）と rgb()
        を入力できます。
      </NotificationBanner>

      <ToggleGroup
        options={FILTER_OPTIONS}
        value={filter}
        onChange={setFilter}
        ariaLabel="合否フィルタ"
      />

      {validColors.length < 2 ? (
        <p className="caption text-muted">
          有効な色を 2 つ以上入力するとマトリクスが表示されます。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <caption className="sr-only">行が前景色、列が背景色のコントラスト比マトリクス</caption>
            <thead>
              <tr>
                <th className="caption text-muted p-2 text-left">前景 ＼ 背景</th>
                {validColors.map((bg) => (
                  <th key={bg.id} className="caption p-2 text-left">
                    {bg.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {validColors.map((fg, rowIdx) => (
                <tr key={fg.id}>
                  <th scope="row" className="caption p-2 text-left whitespace-nowrap">
                    {fg.label}
                  </th>
                  {validColors.map((bg, colIdx) => {
                    const cell = matrix[rowIdx][colIdx];
                    const dimmed =
                      (filter === 'aa' && !cell.levels.aaNormal) ||
                      (filter === 'aaa' && !cell.levels.aaaNormal);
                    if (cell.sameColor) {
                      return <td key={bg.id} className="bg-subtle p-2" aria-hidden="true" />;
                    }
                    return (
                      <td
                        key={bg.id}
                        className={`p-2 align-top border border-input${dimmed ? ' cell-dimmed' : ''}`}
                      >
                        <CellPreview fgCss={rgbToCss(fg.rgb)} bgCss={rgbToCss(bg.rgb)} />
                        <div className="caption font-mono mt-1">{cell.ratio.toFixed(2)}:1</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <StatusBadge tone={cell.levels.aaNormal ? 'success' : 'error'}>
                            AA {cell.levels.aaNormal ? '○' : '×'}
                          </StatusBadge>
                          <StatusBadge tone={cell.levels.aaaNormal ? 'success' : 'error'}>
                            AAA {cell.levels.aaaNormal ? '○' : '×'}
                          </StatusBadge>
                        </div>
                        <div className="caption text-muted mt-1">Lc {cell.apca.toFixed(1)}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
