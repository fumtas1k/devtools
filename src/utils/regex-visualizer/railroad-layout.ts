// 鉄道図のレイアウト計算（pure / CJS 非依存 / SSR 安全 / 静的 import 可）。
// pixel-perfect は狙わず、固定幅フォント前提の概算で寸法を出す。描画は RegexRailroad.tsx。

export type RailKind = 'terminal' | 'sequence' | 'group' | 'fallback';

export interface RailNode {
  kind: RailKind;
  /** bounding box 幅 */
  width: number;
  /** bounding box 高さ */
  height: number;
  /** rail 線が通る y（node 上端からの相対） */
  connectY: number;
  /** terminal / fallback の表示文字列 */
  label?: string;
  /** group のタイトル（例 "#1" / "name" / "(?:)"） */
  title?: string;
  /** sequence: 順序付き子 / group: [inner] */
  children: RailNode[];
  /** pattern 基準の位置（hotspot 突き合わせ用・PR2c で使用） */
  loc?: { start: number; end: number };
}

// レイアウト定数（RegexRailroad.tsx と共有するため必ずここから import すること）
export const CHAR_W = 8.5; // monospace 1 文字の概算幅(px)
export const BOX_PAD_X = 10;
export const BOX_H = 34;
export const MIN_BOX_W = 26;
export const H_GAP = 22; // sequence 要素間の接続線長
export const GROUP_PAD_X = 12;
export const GROUP_PAD_TOP = 22; // タイトル領域
export const GROUP_PAD_BOTTOM = 10;

type Loc = { start: number; end: number } | undefined;

export function measureTerminal(label: string, loc: Loc): RailNode {
  const width = Math.max(label.length * CHAR_W + BOX_PAD_X * 2, MIN_BOX_W);
  return { kind: 'terminal', width, height: BOX_H, connectY: BOX_H / 2, label, children: [], loc };
}

export function measureFallback(label: string, loc: Loc): RailNode {
  const width = Math.max(label.length * CHAR_W + BOX_PAD_X * 2, MIN_BOX_W);
  return { kind: 'fallback', width, height: BOX_H, connectY: BOX_H / 2, label, children: [], loc };
}

export function measureSequence(items: RailNode[], loc: Loc): RailNode {
  if (items.length === 0) {
    // 空連結（例: 空グループ）は壊さずフォールバック枠で示す
    return measureFallback('（空）', loc);
  }
  const rail = Math.max(...items.map((i) => i.connectY));
  const height = Math.max(...items.map((i) => rail - i.connectY + i.height));
  const width = items.reduce((s, i) => s + i.width, 0) + H_GAP * (items.length - 1);
  return { kind: 'sequence', width, height, connectY: rail, children: items, loc };
}

export function measureGroup(inner: RailNode, title: string, loc: Loc): RailNode {
  const width = inner.width + GROUP_PAD_X * 2;
  const height = inner.height + GROUP_PAD_TOP + GROUP_PAD_BOTTOM;
  const connectY = GROUP_PAD_TOP + inner.connectY;
  return { kind: 'group', width, height, connectY, title, children: [inner], loc };
}
