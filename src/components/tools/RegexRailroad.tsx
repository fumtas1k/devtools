// 鉄道図を SVG で描画する純粋プレゼンテーションコンポーネント（CJS 非依存・SSR 安全）。
// レイアウト計算は railroad-layout.ts（pure）から取得した RailNode を prop で受け取る。
import type { RailNode } from '@/utils/regex-visualizer/railroad-layout';
import {
  H_GAP,
  GROUP_PAD_X,
  GROUP_PAD_TOP,
  CHOICE_LEAD,
  V_GAP,
  REP_LEAD,
  ARC_H,
} from '@/utils/regex-visualizer/railroad-layout';

const MARKER_LEAD = 22; // start/end マーカーと本体の間の rail 長
const MARKER_R = 5;

type Hotspot = { start: number; end: number }[];

function overlaps(node: RailNode, hotspot?: Hotspot): boolean {
  if (!hotspot || !node.loc) return false;
  return hotspot.some((h) => node.loc!.start < h.end && h.start < node.loc!.end);
}

/** 自身が重なり かつ どの子も重ならない＝最深の重なりノード（AST ツリーと同じ規則）。 */
function isHot(node: RailNode, hotspot?: Hotspot): boolean {
  return overlaps(node, hotspot) && !node.children.some((c) => overlaps(c, hotspot));
}

// 原点 (x,y) に node を配置して SVG 要素を返す。rail は y + node.connectY を通る。
function renderNode(
  node: RailNode,
  x: number,
  y: number,
  key: string,
  hotspot?: Hotspot
): React.ReactNode {
  const hot = isHot(node, hotspot);
  const boxClass = (base: string) => (hot ? `${base} rr-box-hot` : base);
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
            className={boxClass(node.kind === 'fallback' ? 'rr-box rr-box-fallback' : 'rr-box')}
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
    case 'backreference':
      return (
        <g key={key}>
          <rect
            x={x}
            y={y}
            width={node.width}
            height={node.height}
            rx={6}
            className={boxClass('rr-box rr-backref')}
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
    case 'assertion':
      return (
        <g key={key}>
          <rect
            x={x}
            y={y}
            width={node.width}
            height={node.height}
            rx={node.height / 2}
            className={boxClass('rr-assertion')}
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
        els.push(renderNode(child, cx, cy, `${key}-${i}`, hotspot));
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
          {renderNode(inner, innerX, innerY, `${key}-g`, hotspot)}
        </g>
      );
    }
    case 'choice': {
      const lead = CHOICE_LEAD;
      const innerLeft = x + lead;
      const maxBW = Math.max(...node.children.map((c) => c.width));
      const innerRight = innerLeft + maxBW;
      const entryY = y + node.connectY;
      const exitX = x + node.width;
      const els: React.ReactNode[] = [];
      let by = y;
      node.children.forEach((branch, i) => {
        const bRailY = by + branch.connectY;
        els.push(renderNode(branch, innerLeft, by, `${key}-b${i}`, hotspot));
        els.push(
          <path
            key={`ei${i}`}
            d={`M ${x} ${entryY} C ${x + lead / 2} ${entryY}, ${innerLeft - lead / 2} ${bRailY}, ${innerLeft} ${bRailY}`}
            className="rr-rail"
          />
        );
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
    case 'repetition': {
      const inner = node.children[0];
      const innerX = x + REP_LEAD;
      const innerY = node.skip ? y + ARC_H : y;
      const railY = y + node.connectY; // = innerY + inner.connectY
      const exitX = x + node.width;
      const innerRight = innerX + inner.width;
      const els: React.ReactNode[] = [];
      // 本線リード（左右）
      els.push(<line key="ll" x1={x} y1={railY} x2={innerX} y2={railY} className="rr-rail" />);
      els.push(
        <line key="lr" x1={innerRight} y1={railY} x2={exitX} y2={railY} className="rr-rail" />
      );
      els.push(renderNode(inner, innerX, innerY, `${key}-r`, hotspot));
      // 弧・ラベルは inner の実下端/上端基準で配置する。terminal の connectY===height/2 を
      // 暗黙前提にすると group/choice 等の tall inner でラベルが svg 外にクリップされ、
      // ループ弧が枠を貫通する（PR #493 レビュー指摘）。
      const r = 6;
      const loopY = innerY + inner.height + ARC_H / 2; // inner の下（bottom band）
      const skipY = innerY - ARC_H / 2; // inner の上（top band）
      // ループ弧（下）: ノード両端から inner の下を回って入口へ戻る（rounded U）
      if (node.loop) {
        els.push(
          <path
            key="loop"
            d={`M ${exitX} ${railY} L ${exitX} ${loopY - r} Q ${exitX} ${loopY} ${exitX - r} ${loopY} L ${x + r} ${loopY} Q ${x} ${loopY} ${x} ${loopY - r} L ${x} ${railY}`}
            className="rr-rail"
          />
        );
      }
      // スキップ弧（上）: ノード両端から inner の上をバイパス（rounded）
      if (node.skip) {
        els.push(
          <path
            key="skip"
            d={`M ${x} ${railY} L ${x} ${skipY + r} Q ${x} ${skipY} ${x + r} ${skipY} L ${exitX - r} ${skipY} Q ${exitX} ${skipY} ${exitX} ${skipY + r} L ${exitX} ${railY}`}
            className="rr-rail"
          />
        );
      }
      // 量指定子ラベル（ノード下端・常に svg 内に収まる）
      els.push(
        <text
          key="ql"
          x={x + node.width / 2}
          y={y + node.height - 2}
          textAnchor="middle"
          className="rr-quant"
        >
          {node.label}
        </text>
      );
      return <g key={key}>{els}</g>;
    }
  }
}

interface Props {
  node: RailNode;
  hotspot?: { start: number; end: number }[];
}

/** RailNode を SVG で描画する純粋プレゼンテーションコンポーネント（CJS 非依存・SSR 安全）。 */
export function RegexRailroad({ node, hotspot }: Props) {
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
        {renderNode(node, MARKER_LEAD, 0, 'root', hotspot)}
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
