import type { TreeNode } from './tree';

/** 仮想ツリー表示の 1 行。コンテナは開き行（open）と閉じ括弧行（close）に分かれる。 */
export interface FlatRow {
  node: TreeNode;
  /** ルートを 0 とするネスト深さ（インデント単位数）。 */
  depth: number;
  /** value: プリミティブ行 / open: コンテナ開き行 / close: 閉じ括弧行。 */
  kind: 'value' | 'open' | 'close';
  /** React key 用の一意キー（close 行は path + ':close'）。 */
  key: string;
  /** open 行のみ: 折りたたみ中なら true（`{ … } N 項目` 表記で描画する）。 */
  collapsed?: boolean;
}

/**
 * 開閉判定。`toggled` は「デフォルト開閉状態から反転された path の集合」（XOR 設計）。
 * defaultOpen=true なら toggled に含まれる path が閉じている。
 * 全折りたたみ時に全 path を列挙せずに済む。
 */
function isClosed(path: string, toggled: ReadonlySet<string>, defaultOpen: boolean): boolean {
  return defaultOpen ? toggled.has(path) : !toggled.has(path);
}

/** ツリーを可視行の平坦配列へ変換する（折りたたみ中コンテナの子孫は出力しない）。 */
export function flattenTree(
  root: TreeNode,
  toggled: ReadonlySet<string>,
  defaultOpen: boolean
): FlatRow[] {
  const rows: FlatRow[] = [];
  const visit = (node: TreeNode, depth: number): void => {
    if (node.type !== 'object' && node.type !== 'array') {
      rows.push({ node, depth, kind: 'value', key: node.path });
      return;
    }
    const closed = isClosed(node.path, toggled, defaultOpen);
    rows.push({ node, depth, kind: 'open', key: node.path, collapsed: closed });
    if (closed) return;
    for (const child of node.children ?? []) visit(child, depth + 1);
    rows.push({ node, depth, kind: 'close', key: `${node.path}:close` });
  };
  visit(root, 0);
  return rows;
}

/**
 * 全展開換算の総行数（プリミティブ 1 行・コンテナ open/close の 2 行）。
 * `flattenTree(root, new Set(), true).length` と一致する値を配列を作らずに数える。
 * 仮想化経路の判定（TREE_VIRTUALIZE_THRESHOLD との比較）に使う。
 */
export function countRows(root: TreeNode): number {
  if (root.type !== 'object' && root.type !== 'array') return 1;
  let count = 2; // open + close
  for (const child of root.children ?? []) count += countRows(child);
  return count;
}
