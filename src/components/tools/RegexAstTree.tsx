import type { RegexAstNode } from '@/utils/regex-visualizer';

interface Props {
  node: RegexAstNode;
  /** 危険箇所の pattern オフセット範囲（ReDoS hotspot）。最深の重なりノードのみ強調する。 */
  hotspot?: { start: number; end: number }[];
}

function overlaps(node: RegexAstNode, hotspot?: { start: number; end: number }[]): boolean {
  if (!hotspot || !node.loc) return false;
  return hotspot.some((h) => node.loc!.start < h.end && h.start < node.loc!.end);
}

export function RegexAstTree({ node, hotspot }: Props) {
  // hotspot に重なる「最深」ノードのみ強調する。子ノードの範囲は親に内包されるため、
  // 自身が重なり かつ どの子も重ならない ＝ 最深の重なりノード。これで祖先（Group・外側
  // Repetition 等）まで点灯する視覚ノイズを避ける。
  // 表示専用ツリーのため role="tree"/"treeitem" は付けない（キーボード操作未実装で
  // WAI-ARIA tree パターンを満たさないため、素の入れ子リストの意味論に留める）。
  const hot = overlaps(node, hotspot) && !node.children.some((c) => overlaps(c, hotspot));
  return (
    <ul className="regex-ast-tree">
      <li>
        <span className={hot ? 'regex-ast-node regex-ast-node-hot' : 'regex-ast-node'}>
          {node.label}
          {hot && <span className="caption text-warning"> ⚠ ReDoS 危険箇所</span>}
        </span>
        {node.children.map((child, i) => (
          <RegexAstTree key={i} node={child} hotspot={hotspot} />
        ))}
      </li>
    </ul>
  );
}
