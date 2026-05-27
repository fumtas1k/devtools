import { parseToRegExpTree } from './parse';
import {
  measureTerminal,
  measureSequence,
  measureGroup,
  measureFallback,
  type RailNode,
} from './railroad-layout';

interface TreeNode {
  type: string;
  loc?: { start: { offset: number }; end: { offset: number } };
  [key: string]: unknown;
}

/** /pattern/ リテラル基準 offset を pattern 基準へ（先頭 '/' 分 -1）。 */
function locOf(node: TreeNode): { start: number; end: number } | undefined {
  return node.loc ? { start: node.loc.start.offset - 1, end: node.loc.end.offset - 1 } : undefined;
}

/** 元の正規表現文字列から node の該当部分を切り出してラベルにする。 */
function sliceLabel(node: TreeNode, pattern: string): string {
  const loc = locOf(node);
  return loc ? pattern.slice(loc.start, loc.end) : (node.type as string);
}

function groupTitle(node: TreeNode): string {
  if (!node.capturing) return '(?:)';
  if (typeof node.name === 'string' && node.name) return node.name;
  return `#${node.number}`;
}

function build(node: TreeNode, pattern: string): RailNode {
  switch (node.type) {
    case 'Char':
    case 'CharacterClass':
      return measureTerminal(sliceLabel(node, pattern), locOf(node));
    case 'Alternative':
      return measureSequence(
        ((node.expressions as TreeNode[]) ?? []).map((n) => build(n, pattern)),
        locOf(node)
      );
    case 'Group':
      // regexp-tree は空グループ () / (?:) の expression を null で返すため null ガードする。
      // 空式は measureSequence([]) の「（空）」フォールバック枠へ流す（クラッシュ回避）。
      return measureGroup(
        node.expression
          ? build(node.expression as TreeNode, pattern)
          : measureSequence([], locOf(node)),
        groupTitle(node),
        locOf(node)
      );
    default:
      // Disjunction / Repetition / Assertion / Backreference は PR2b/2c で本実装。
      // それまでは source 文字列のフォールバック枠で壊さず描画。
      return measureFallback(sliceLabel(node, pattern), locOf(node));
  }
}

/**
 * pattern + flags から鉄道図のレイアウトツリー（RailNode）を組む。
 * regexp-tree（CJS）を使うため client 専用（RegexVisualizer の動的 import 経由）。
 */
export function buildRailroad(pattern: string, flags: string): RailNode {
  const ast = parseToRegExpTree(pattern, flags) as unknown as { body: TreeNode };
  return build(ast.body, pattern);
}
