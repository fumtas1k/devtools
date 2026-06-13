import type { TreeNode } from './tree';

/** 仮想ツリー表示の 1 行。コンテナは開き行（open）と閉じ括弧行（close）に分かれる。 */
export interface FlatRow {
  node: TreeNode;
  /** ルートを 0 とするネスト深さ（インデント単位数）。 */
  depth: number;
  /** value: プリミティブ行 / open: コンテナ開き行 / close: 閉じ括弧行。 */
  kind: 'value' | 'open' | 'close';
  /**
   * 行の一意キー（React key 兼トグル識別子）。「親の行キー + 相対セグメント + 兄弟内
   * 出現回数 `#n`（2 つ目以降のみ）」で構成し、重複キーがなければ path と一致する。
   * close 行は ':close' 付き。
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
  const visit = (node: TreeNode, depth: number, key: string): void => {
    if (node.type !== 'object' && node.type !== 'array') {
      rows.push({ node, depth, kind: 'value', key });
      return;
    }
    const closed = isClosed(key, toggled, defaultOpen);
    rows.push({ node, depth, kind: 'open', key, collapsed: closed });
    if (closed) return;
    // 重複キー JSON（strict パースでも構文エラーにならない）では兄弟や cousin の path が
    // 衝突する。行キーは「親の行キー + 相対セグメント + 兄弟内出現回数 #n」で構成する:
    // - 兄弟内の採番は親ごとの局所 Map で行うため、他 subtree の開閉に影響されず安定。
    // - cousin は親の行キー連鎖（例: $.a.b と $.a#1.b）で自動的に区別される。
    // - `#` は識別子形式のセグメントに現れず、# を含むキー名は $["..."] 形式の path に
    //   なるため、#n サフィックスが正規の path と衝突することはない。
    const seen = new Map<string, number>();
    for (const child of node.children ?? []) {
      const seg = child.path.slice(node.path.length);
      const n = seen.get(seg) ?? 0;
      seen.set(seg, n + 1);
      visit(child, depth + 1, n === 0 ? `${key}${seg}` : `${key}${seg}#${n}`);
    }
    rows.push({ node, depth, kind: 'close', key: `${key}:close` });
  };
  visit(root, 0, root.path);
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
