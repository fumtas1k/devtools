import type { TreeNode } from './tree';

/** 仮想ツリー表示の 1 行。コンテナは開き行（open）と閉じ括弧行（close）に分かれる。 */
export interface FlatRow {
  node: TreeNode;
  /** ルートを 0 とするネスト深さ（インデント単位数）。 */
  depth: number;
  /** value: プリミティブ行 / open: コンテナ開き行 / close: 閉じ括弧行。 */
  kind: 'value' | 'open' | 'close';
  /**
   * 行の一意キー（React key 兼トグル識別子）。基本は path。重複キー JSON では
   * 兄弟の path が衝突するため 2 つ目以降に `#n` を付与する（close 行は ':close' 付き）。
   */
  key: string;
  /** open 行のみ: 折りたたみ中なら true（`{ … } N 項目` 表記で描画する）。 */
  collapsed?: boolean;
}

/**
 * 開閉判定。`toggled` は「デフォルト開閉状態から反転された行キーの集合」（XOR 設計）。
 * defaultOpen=true なら toggled に含まれるキーが閉じている。
 * 全折りたたみ時に全キーを列挙せずに済む。
 */
function isClosed(key: string, toggled: ReadonlySet<string>, defaultOpen: boolean): boolean {
  return defaultOpen ? toggled.has(key) : !toggled.has(key);
}

/** ツリーを可視行の平坦配列へ変換する（折りたたみ中コンテナの子孫は出力しない）。 */
export function flattenTree(
  root: TreeNode,
  toggled: ReadonlySet<string>,
  defaultOpen: boolean
): FlatRow[] {
  const rows: FlatRow[] = [];
  // 重複キー JSON（strict パースでも構文エラーにならない）では兄弟の path が衝突する。
  // 文書順の出現回数で `#n` を付与して一意化する。重複は同一親の兄弟に限られ、兄弟は
  // 親の開閉で常に一括表示/非表示になるため、開閉状態が変わっても採番は安定する。
  const seen = new Map<string, number>();
  const uniqueKey = (path: string): string => {
    const n = seen.get(path) ?? 0;
    seen.set(path, n + 1);
    return n === 0 ? path : `${path}#${n}`;
  };
  const visit = (node: TreeNode, depth: number): void => {
    const key = uniqueKey(node.path);
    if (node.type !== 'object' && node.type !== 'array') {
      rows.push({ node, depth, kind: 'value', key });
      return;
    }
    const closed = isClosed(key, toggled, defaultOpen);
    rows.push({ node, depth, kind: 'open', key, collapsed: closed });
    if (closed) return;
    for (const child of node.children ?? []) visit(child, depth + 1);
    rows.push({ node, depth, kind: 'close', key: `${key}:close` });
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

/** computeWindow の戻り値。start は inclusive、end は exclusive。 */
export interface WindowRange {
  start: number;
  end: number;
}

/**
 * スクロール位置から描画すべき行範囲を計算する（等高行前提の windowing）。
 * - rowH が未確定（<= 0）の場合は先頭から overscan 行だけ描画して実測を促す。
 * - 折りたたみで行数が縮んだ直後など、過大な scrollTop でも範囲が破綻しないよう clamp する
 *   （ブラウザ側の scrollTop 自動 clamp で次のイベントから正常値に戻る）。
 */
export function computeWindow(
  scrollTop: number,
  viewportH: number,
  rowH: number,
  totalRows: number,
  overscan: number
): WindowRange {
  if (totalRows <= 0) return { start: 0, end: 0 };
  if (rowH <= 0) return { start: 0, end: Math.min(totalRows, Math.max(1, overscan)) };
  const top = Math.max(0, scrollTop);
  const rawStart = Math.floor(top / rowH) - overscan;
  const rawEnd = Math.ceil((top + Math.max(0, viewportH)) / rowH) + overscan;
  const end = Math.min(totalRows, Math.max(1, rawEnd));
  const start = Math.min(Math.max(0, rawStart), end - 1);
  return { start, end };
}
