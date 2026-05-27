// 鉄道図を SVG で描画する純粋プレゼンテーションコンポーネント（CJS 非依存・SSR 安全）。
// レイアウト計算は railroad-layout.ts（pure）から取得した RailNode を prop で受け取る。
import type { RailNode } from '@/utils/regex-visualizer/railroad-layout';
import {
  H_GAP,
  GROUP_PAD_X,
  GROUP_PAD_TOP,
  CHOICE_LEAD,
  V_GAP,
} from '@/utils/regex-visualizer/railroad-layout';

const MARKER_LEAD = 22; // start/end マーカーと本体の間の rail 長
const MARKER_R = 5;

// 原点 (x,y) に node を配置して SVG 要素を返す。rail は y + node.connectY を通る。
function renderNode(node: RailNode, x: number, y: number, key: string): React.ReactNode {
  switch (node.kind) {
    case 'terminal':
    case 'fallback':
      return (
        <g key={key}>
          <rect
            x={x}
            y={y}
            width={node.width}
            height={node.height}
            rx={6}
            className={node.kind === 'fallback' ? 'rr-box rr-box-fallback' : 'rr-box'}
          />
          <text
            x={x + node.width / 2}
            y={y + node.height / 2}
            textAnchor="middle"
            dominantBaseline="central"
            className="rr-text"
          >
            {node.label}
          </text>
        </g>
      );
    case 'sequence': {
      const rail = node.connectY;
      const els: React.ReactNode[] = [];
      let cx = x;
      node.children.forEach((child, i) => {
        const cy = y + rail - child.connectY;
        if (i > 0) {
          els.push(
            <line
              key={`l${i}`}
              x1={cx - H_GAP}
              y1={y + rail}
              x2={cx}
              y2={y + rail}
              className="rr-rail"
            />
          );
        }
        els.push(renderNode(child, cx, cy, `${key}-${i}`));
        cx += child.width + H_GAP;
      });
      return <g key={key}>{els}</g>;
    }
    case 'group': {
      const inner = node.children[0];
      const innerX = x + GROUP_PAD_X;
      const innerY = y + GROUP_PAD_TOP;
      return (
        <g key={key}>
          <rect x={x} y={y} width={node.width} height={node.height} rx={8} className="rr-group" />
          {node.title && (
            <text x={x + 8} y={y + 14} className="rr-group-title">
              {node.title}
            </text>
          )}
          {/* グループ枠の入口/出口から inner へ rail を渡す */}
          <line
            x1={x}
            y1={y + node.connectY}
            x2={innerX}
            y2={y + node.connectY}
            className="rr-rail"
          />
          <line
            x1={innerX + inner.width}
            y1={y + node.connectY}
            x2={x + node.width}
            y2={y + node.connectY}
            className="rr-rail"
          />
          {renderNode(inner, innerX, innerY, `${key}-g`)}
        </g>
      );
    }
    case 'choice': {
      const lead = CHOICE_LEAD;
      const innerLeft = x + lead;
      const maxBW = Math.max(...node.children.map((c) => c.width));
      const innerRight = innerLeft + maxBW;
      const entryY = y + node.connectY; // 先頭分岐の rail（本線）
      const exitX = x + node.width;
      const els: React.ReactNode[] = [];
      let by = y;
      node.children.forEach((branch, i) => {
        const bRailY = by + branch.connectY;
        els.push(renderNode(branch, innerLeft, by, `${key}-b${i}`));
        // 入口: (x,entryY) → (innerLeft,bRailY) を S 字 bezier で接続（i=0 は直線になる）
        els.push(
          <path
            key={`ei${i}`}
            d={`M ${x} ${entryY} C ${x + lead / 2} ${entryY}, ${innerLeft - lead / 2} ${bRailY}, ${innerLeft} ${bRailY}`}
            className="rr-rail"
          />
        );
        // 分岐が最大幅より狭ければ出口まで水平延長
        if (branch.width < maxBW) {
          els.push(
            <line
              key={`ext${i}`}
              x1={innerLeft + branch.width}
              y1={bRailY}
              x2={innerRight}
              y2={bRailY}
              className="rr-rail"
            />
          );
        }
        // 出口: (innerRight,bRailY) → (exitX,entryY)
        els.push(
          <path
            key={`eo${i}`}
            d={`M ${innerRight} ${bRailY} C ${innerRight + lead / 2} ${bRailY}, ${exitX - lead / 2} ${entryY}, ${exitX} ${entryY}`}
            className="rr-rail"
          />
        );
        by += branch.height + V_GAP;
      });
      return <g key={key}>{els}</g>;
    }
    case 'assertion':
      return (
        <g key={key}>
          <rect
            x={x}
            y={y}
            width={node.width}
            height={node.height}
            rx={node.height / 2}
            className="rr-assertion"
          />
          <text
            x={x + node.width / 2}
            y={y + node.height / 2}
            textAnchor="middle"
            dominantBaseline="central"
            className="rr-text"
          >
            {node.label}
          </text>
        </g>
      );
  }
}

interface Props {
  node: RailNode;
}

/** RailNode を SVG で描画する純粋プレゼンテーションコンポーネント（CJS 非依存・SSR 安全）。 */
export function RegexRailroad({ node }: Props) {
  const totalW = node.width + MARKER_LEAD * 2;
  const totalH = node.height;
  const railY = node.connectY;
  return (
    <div className="overflow-x-auto">
      <svg
        width={totalW}
        height={totalH}
        viewBox={`0 0 ${totalW} ${totalH}`}
        role="img"
        aria-label="正規表現の鉄道図"
        className="rr-svg"
      >
        <circle cx={MARKER_R + 1} cy={railY} r={MARKER_R} className="rr-marker" />
        <line x1={MARKER_R + 1} y1={railY} x2={MARKER_LEAD} y2={railY} className="rr-rail" />
        {renderNode(node, MARKER_LEAD, 0, 'root')}
        <line
          x1={MARKER_LEAD + node.width}
          y1={railY}
          x2={totalW - MARKER_R - 1}
          y2={railY}
          className="rr-rail"
        />
        <circle cx={totalW - MARKER_R - 1} cy={railY} r={MARKER_R} className="rr-marker" />
      </svg>
    </div>
  );
}
