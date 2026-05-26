import type { RegexAstNode } from '@/utils/regex-visualizer';

interface Props {
  node: RegexAstNode;
  /** 危険箇所の pattern オフセット範囲（ReDoS hotspot）。重なるノードを強調する。 */
  hotspot?: { start: number; end: number }[];
}

function isHot(node: RegexAstNode, hotspot?: { start: number; end: number }[]): boolean {
  if (!hotspot || !node.loc) return false;
  return hotspot.some((h) => node.loc!.start < h.end && h.start < node.loc!.end);
}

export function RegexAstTree({ node, hotspot }: Props) {
  const hot = isHot(node, hotspot);
  return (
    <ul className="regex-ast-tree" role={node.type === 'Root' ? 'tree' : 'group'}>
      <li role="treeitem">
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
