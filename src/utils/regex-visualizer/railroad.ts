import { parseToRegExpTree } from './parse';
import {
  measureTerminal,
  measureCharClass,
  measureSequence,
  measureGroup,
  measureFallback,
  measureChoice,
  measureAssertion,
  measureRepetition,
  measureBackreference,
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

/** Disjunction は二分木・左ネスト。a|b|c を [a,b,c] へ平坦化（空 alternative は null）。 */
function flattenDisjunction(node: TreeNode): (TreeNode | null)[] {
  const out: (TreeNode | null)[] = [];
  const walk = (n: TreeNode | null) => {
    if (n && n.type === 'Disjunction') {
      walk((n.left as TreeNode | null) ?? null);
      walk((n.right as TreeNode | null) ?? null);
    } else {
      out.push(n);
    }
  };
  walk(node);
  return out;
}

/** 先読み/後読みのタイトル文字列。 */
function lookaroundTitle(node: TreeNode): string {
  const neg = node.negative === true;
  if (node.kind === 'Lookahead') return neg ? '(?!)' : '(?=)';
  return neg ? '(?<!)' : '(?<=)'; // Lookbehind
}

interface Quantifier {
  kind: string;
  from?: number;
  to?: number;
  greedy?: boolean;
}

/** 量指定子の表示ラベル（'+' '*?' '{2,5}' 等）。lazy は末尾に ? を付ける。 */
function quantifierLabel(q: Quantifier): string {
  let base: string;
  switch (q.kind) {
    case '+':
    case '*':
    case '?':
      base = q.kind;
      break;
    case 'Range':
      base =
        q.to == null ? `{${q.from},}` : q.to === q.from ? `{${q.from}}` : `{${q.from},${q.to}}`;
      break;
    default:
      base = '';
  }
  return q.greedy === false ? `${base}?` : base;
}

/** スキップ弧（0 回可）・ループ弧（2 回以上可）の有無を量指定子から判定。 */
function quantifierFlags(q: Quantifier): { skip: boolean; loop: boolean } {
  switch (q.kind) {
    case '?':
      return { skip: true, loop: false };
    case '*':
      return { skip: true, loop: true };
    case '+':
      return { skip: false, loop: true };
    case 'Range': {
      const skip = q.from === 0;
      const loop = q.to == null || q.to > 1;
      return { skip, loop };
    }
    default:
      return { skip: false, loop: false };
  }
}

function build(node: TreeNode, pattern: string): RailNode {
  switch (node.type) {
    case 'Char':
      // regexp-tree では . \d \w \s \n \t 等が kind:'meta'。これらは文字クラス・メタ文字として扱う。
      return node.kind === 'meta'
        ? measureCharClass(sliceLabel(node, pattern), locOf(node))
        : measureTerminal(sliceLabel(node, pattern), locOf(node));
    case 'CharacterClass':
      return measureCharClass(sliceLabel(node, pattern), locOf(node));
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
    case 'Disjunction':
      return measureChoice(
        flattenDisjunction(node).map((n) =>
          n ? build(n, pattern) : measureSequence([], undefined)
        ),
        locOf(node)
      );
    case 'Assertion': {
      const kind = node.kind as string;
      if (kind === 'Lookahead' || kind === 'Lookbehind') {
        // 先読み/後読みは内部式を持つ → group 風コンテナで内包（空式は null ガード）。
        return measureGroup(
          node.assertion
            ? build(node.assertion as TreeNode, pattern)
            : measureSequence([], locOf(node)),
          lookaroundTitle(node),
          locOf(node)
        );
      }
      // 単純アンカー ^ $ \b \B
      return measureAssertion(sliceLabel(node, pattern), locOf(node));
    }
    case 'Repetition': {
      const q = (node.quantifier as Quantifier) ?? { kind: '' };
      const flags = quantifierFlags(q);
      return measureRepetition(
        build(node.expression as TreeNode, pattern),
        { ...flags, label: quantifierLabel(q) },
        locOf(node)
      );
    }
    case 'Backreference':
      return measureBackreference(sliceLabel(node, pattern), locOf(node));
    default:
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
