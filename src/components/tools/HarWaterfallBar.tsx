import type { WaterfallRow } from '@/utils/har';

interface Props {
  row: WaterfallRow;
  /** 親が生成する動的 stylesheet と対応付ける行 index。 */
  rowIndex: number;
}

/** フェーズ→色クラスの対応。色は CSS クラス経由（色値直書き禁止）。 */
const PHASE_CLASS: Record<string, string> = {
  blocked: 'har-phase-blocked',
  dns: 'har-phase-dns',
  connect: 'har-phase-connect',
  ssl: 'har-phase-ssl',
  send: 'har-phase-send',
  wait: 'har-phase-wait',
  receive: 'har-phase-receive',
};

/**
 * 一覧テーブル用のタイミング横棒（表示専用）。
 * 幅・オフセットは親の useDynamicStyleSheet が `[data-har-bar]` / `[data-har-seg]`
 * 属性経由で当てる（inline style は CSP style-src 制約により使用しない）。
 */
export function HarWaterfallBar({ row, rowIndex }: Props) {
  if (!row.hasTimeline || row.segments.length === 0) {
    return <span className="text-muted">—</span>;
  }
  const label =
    row.segments.map((s) => `${s.phase} ${Math.round(s.ms)}ms`).join(', ') +
    `, 合計 ${Math.round(row.totalMs)}ms`;
  return (
    <div className="har-track">
      <div className="har-bar" data-har-bar={rowIndex} role="img" aria-label={label} title={label}>
        {row.segments.map((s, j) => (
          <span
            key={j}
            className={`har-seg ${PHASE_CLASS[s.phase] ?? ''}`}
            data-har-seg={`${rowIndex}-${j}`}
          />
        ))}
      </div>
    </div>
  );
}
