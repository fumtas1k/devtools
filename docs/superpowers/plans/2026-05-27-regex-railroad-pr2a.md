# 正規表現 鉄道図 PR2a 実装計画（基盤＋連結/終端/グループ＋タブ）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 正規表現の鉄道図レンダラの基盤を作り、終端（文字・文字クラス）・連結（Sequence）・グループを描画して `/tools/regex-visualizer` に「鉄道図」タブを追加する（未対応構文はフォールバック枠で描画継続）。

**Architecture:** レイアウトは純粋モジュール `railroad-layout.ts`（型・定数・measure 関数、CJS 非依存・SSR 安全）と、regexp-tree でパースして組む `railroad.ts`（client 専用・既存の動的 import 経由）に分離。SVG レンダラ `RegexRailroad.tsx` は組み上がった `RailNode` を prop で受け取り React の `<svg>` 要素として描画する（CJS を import しないので SSR 安全、`dangerouslySetInnerHTML` 不使用で XSS なし）。

**Tech Stack:** Astro + React (TSX) / 既存 `regexp-tree`（パース）/ SVG（React 要素）/ Vitest / Playwright

**設計スペック:** `docs/superpowers/specs/2026-05-27-regex-railroad-design.md`

**範囲:** PR2a のみ。PR2b（選択肢＋アサーション）・PR2c（量指定子＋後方参照＋hotspot）は着手時に別計画。

---

## 前提知識（実装者向け）

- **PR1 の SSR 制約**: `recheck`/`regexp-tree` は CJS。これらを import するモジュールを React コンポーネントから**静的 import すると Astro dev SSR が `module is not defined` で落ちる**。よって解析系は `RegexVisualizer` の `useEffect` 内 `import('@/utils/regex-visualizer')`（動的 import、`mod`）経由でのみ使う。**新規の `RegexRailroad.tsx` は CJS を含むモジュール（`railroad.ts` / `parse.ts`）を静的 import してはならない** — pure な `railroad-layout.ts` から型と定数のみ取る。
- **既存 `parse.ts`**: `import { parse as parseRegExpTree } from 'regexp-tree'`。`RegexAstNode` 表示ツリーは温存。`loc` は `/pattern/` リテラル基準のため **offset-1** で pattern 基準に補正する（既存実装と同じ）。
- **regexp-tree ノード形状（PR2a 対象）**:
  - `Char`: `{ type:'Char', value, kind, loc }`
  - `CharacterClass`: `{ type:'CharacterClass', negative, expressions, loc }`
  - `Alternative`（連結）: `{ type:'Alternative', expressions: Node[], loc }`
  - `Group`: `{ type:'Group', capturing:boolean, number?, name?, expression: Node, loc }`
  - それ以外（`Disjunction` / `Repetition` / `Assertion` / `Backreference`）は PR2a ではフォールバック枠。
  - ルートは `parse(re).body`（多くは `Alternative`、単一要素なら `Char`/`Group` 等）。
- **終端ラベルは source slice で得る**: `pattern.slice(loc.start, loc.end)`（offset-1 補正後）で元の正規表現の該当部分文字列をそのままラベルにする。`[a-z]` や `\d` を再構築せず正確。
- **共通 UI**: `ToggleGroup`（`src/components/ui/ToggleGroup`）。使用例 `src/components/tools/SqlFormatter.tsx`: `<ToggleGroup options={[{value,label}]} value={v} onChange={(x)=>setV(x as T)} ariaLabel="…" />`。
- **色**: primitive 直書き禁止。`@layer components` に `rr-*` 意味クラスを追加し CSS 変数（`--color-border-input` / `--color-bg-subtle` / `--color-text-default` / `--color-warning` 等、`src/styles/global.css` の実名を確認）で着色。変数 prefix（`hover:` 等）は手書きクラスに付けない（§7.1）。
- **テストロケータ**: `getByRole`/`getByText`/`getByLabel`。`locator('[role=…]')` 禁止。E2E は `withProductionCsp`（`tests/e2e/config-converter.spec.ts` が例）。

---

## File Structure

| ファイル                                                                                                                 | 責務                                                                                                                   |
| :----------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| `src/utils/regex-visualizer/railroad-layout.ts`（新規・pure）                                                            | `RailNode` 型・レイアウト定数・measure 関数（terminal/sequence/group/fallback）。CJS 非依存で SSR 安全・静的 import 可 |
| `src/utils/regex-visualizer/railroad.ts`（新規）                                                                         | `buildRailroad(pattern, flags): RailNode`。regexp-tree でパースし measure 関数で組む（client 専用）                    |
| `src/utils/regex-visualizer/parse.ts`（改修）                                                                            | `parseToRegExpTree(pattern, flags)` を export（railroad と parse で共有）                                              |
| `src/utils/regex-visualizer/index.ts`（改修）                                                                            | `buildRailroad` / `RailNode` を re-export                                                                              |
| `src/components/tools/RegexRailroad.tsx`（新規）                                                                         | `RailNode` を `<svg>` で再帰描画（pure layout のみ import）                                                            |
| `src/components/tools/RegexVisualizer.tsx`（改修）                                                                       | `ToggleGroup`「構造ツリー / 鉄道図」を追加。鉄道図タブで `mod.buildRailroad` の結果を `RegexRailroad` に渡す           |
| `src/styles/global.css`（改修）                                                                                          | `rr-*` 意味クラス                                                                                                      |
| `tests/.../railroad-layout.test.ts` / `railroad.test.ts` / `RegexRailroad.test.tsx` / `RegexVisualizer.test.tsx`（改修） | 単体・コンポーネント                                                                                                   |
| `tests/e2e/regex-visualizer.spec.ts`（改修）                                                                             | タブ切替 E2E                                                                                                           |
| `SPEC.md` / `docs/decisions.md`                                                                                          | ドキュメント                                                                                                           |

---

## Task 1: parse.ts に生 AST ヘルパーを切り出す

**Files:**

- Modify: `src/utils/regex-visualizer/parse.ts`
- Test: `src/utils/regex-visualizer/__tests__/parse.test.ts`

- [ ] **Step 1: 失敗するテストを追記**

`parse.test.ts` の `describe('parseRegex', ...)` の後に追記:

```ts
import { parseToRegExpTree } from '../parse';

describe('parseToRegExpTree', () => {
  it('captureLocations 付きの生 AST を返す', () => {
    const ast = parseToRegExpTree('a+', '');
    expect(ast.type).toBe('RegExp');
    expect(ast.body).toBeTruthy();
    // loc.start.offset が付く（/a+/ の body は offset 1..3）
    expect((ast.body as { loc: { start: { offset: number } } }).loc.start.offset).toBe(1);
  });

  it('不正な正規表現で例外を投げる', () => {
    expect(() => parseToRegExpTree('(', '')).toThrow();
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/parse.test.ts`
Expected: FAIL（`parseToRegExpTree` 未定義）

- [ ] **Step 3: parse.ts に追加**

ファイル冒頭の import はそのまま。`parseRegex` の定義の前後どちらでもよいので以下を追加し、`parseRegex` からも再利用する。

```ts
/**
 * railroad など他モジュールと regexp-tree parse を共有するためのヘルパー。
 * native `new RegExp` で構文・フラグを検証（不正なら throw）し、captureLocations 付き AST を返す。
 */
export function parseToRegExpTree(pattern: string, flags: string) {
  const re = new RegExp(pattern, flags);
  return parseRegExpTree(re, { captureLocations: true });
}
```

既存 `parseRegex` の本体先頭 2 行（`const re = new RegExp(...)` と `const ast = parseRegExpTree(...)`）を `const ast = parseToRegExpTree(pattern, flags);` に置き換える（重複排除）。`ast.body` 以降の処理は変更しない。

- [ ] **Step 4: 実行して PASS を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/parse.test.ts`
Expected: 全 PASS（既存 parseRegex のテストも維持）

- [ ] **Step 5: 型チェック & Commit**

```bash
node_modules/.bin/astro check
git add src/utils/regex-visualizer/parse.ts src/utils/regex-visualizer/__tests__/parse.test.ts
git commit -m "refactor: regexp-tree parse を parseToRegExpTree に切り出す"
```

## Task 2: railroad-layout.ts（pure・型/定数/measure）

**Files:**

- Create: `src/utils/regex-visualizer/railroad-layout.ts`
- Test: `src/utils/regex-visualizer/__tests__/railroad-layout.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, it, expect } from 'vitest';
import {
  measureTerminal,
  measureSequence,
  measureGroup,
  measureFallback,
  CHAR_W,
  BOX_H,
  H_GAP,
} from '../railroad-layout';

describe('railroad-layout measure', () => {
  it('terminal は文字数で幅が決まり connectY は中央', () => {
    const t = measureTerminal('ab', undefined);
    expect(t.kind).toBe('terminal');
    expect(t.height).toBe(BOX_H);
    expect(t.connectY).toBe(BOX_H / 2);
    expect(t.width).toBeGreaterThanOrEqual(2 * CHAR_W);
    expect(t.label).toBe('ab');
  });

  it('sequence は子幅の合計 + gap、rail は子 connectY の最大', () => {
    const a = measureTerminal('a', undefined);
    const b = measureTerminal('b', undefined);
    const seq = measureSequence([a, b], undefined);
    expect(seq.kind).toBe('sequence');
    expect(seq.width).toBe(a.width + b.width + H_GAP);
    expect(seq.connectY).toBe(BOX_H / 2);
    expect(seq.children).toHaveLength(2);
  });

  it('空の sequence はフォールバック扱い（空ラベル枠）', () => {
    const seq = measureSequence([], undefined);
    expect(seq.kind).toBe('fallback');
  });

  it('group は inner を内包し幅/高さが pad 分増える', () => {
    const inner = measureTerminal('a', undefined);
    const g = measureGroup(inner, '#1', undefined);
    expect(g.kind).toBe('group');
    expect(g.title).toBe('#1');
    expect(g.width).toBeGreaterThan(inner.width);
    expect(g.height).toBeGreaterThan(inner.height);
    expect(g.children[0]).toBe(inner);
  });

  it('fallback は破線枠用の kind を持つ', () => {
    const f = measureFallback('(?=x)', undefined);
    expect(f.kind).toBe('fallback');
    expect(f.label).toBe('(?=x)');
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/railroad-layout.test.ts`
Expected: FAIL（モジュール未作成）

- [ ] **Step 3: railroad-layout.ts を実装**

```ts
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
```

- [ ] **Step 4: 実行して PASS を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/railroad-layout.test.ts`
Expected: 全 PASS

- [ ] **Step 5: 型チェック & Commit**

```bash
node_modules/.bin/astro check
git add src/utils/regex-visualizer/railroad-layout.ts src/utils/regex-visualizer/__tests__/railroad-layout.test.ts
git commit -m "feat: 鉄道図のレイアウト計算モジュール（pure）を追加"
```

## Task 3: railroad.ts（regexp-tree → RailNode）

**Files:**

- Create: `src/utils/regex-visualizer/railroad.ts`
- Modify: `src/utils/regex-visualizer/index.ts`
- Test: `src/utils/regex-visualizer/__tests__/railroad.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, it, expect } from 'vitest';
import { buildRailroad } from '../railroad';

describe('buildRailroad', () => {
  it('連結 abc を sequence にし、各終端ラベルは source 由来', () => {
    const root = buildRailroad('abc', '');
    expect(root.kind).toBe('sequence');
    expect(root.children.map((c) => c.label)).toEqual(['a', 'b', 'c']);
  });

  it('文字クラスは source 文字列をラベルにする', () => {
    const root = buildRailroad('[a-z]', '');
    // 単一要素なので sequence ではなく terminal
    expect(root.kind).toBe('terminal');
    expect(root.label).toBe('[a-z]');
  });

  it('グループは group ノードになり inner を内包', () => {
    const root = buildRailroad('(ab)', '');
    expect(root.kind).toBe('group');
    expect(root.title).toBe('#1');
    expect(root.children[0].kind).toBe('sequence');
  });

  it('非キャプチャグループのタイトルは (?:)', () => {
    const root = buildRailroad('(?:a)', '');
    expect(root.kind).toBe('group');
    expect(root.title).toBe('(?:)');
  });

  it('未対応構文（量指定子）はフォールバック枠', () => {
    const root = buildRailroad('a+', '');
    // a+ は Repetition（PR2a 未対応）→ fallback。ラベルは source 'a+'
    expect(root.kind).toBe('fallback');
    expect(root.label).toBe('a+');
  });

  it('各ノードに pattern 基準 loc（offset-1）が付く', () => {
    const root = buildRailroad('ab', '');
    expect(root.children[0].loc).toEqual({ start: 0, end: 1 });
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/railroad.test.ts`
Expected: FAIL（`buildRailroad` 未定義）

- [ ] **Step 3: railroad.ts を実装**

```ts
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
      return measureGroup(
        build(node.expression as TreeNode, pattern),
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
```

- [ ] **Step 4: index.ts に re-export を追加**

`src/utils/regex-visualizer/index.ts` に追記:

```ts
export { buildRailroad } from './railroad';
export type { RailNode } from './railroad-layout';
```

- [ ] **Step 5: 実行して PASS を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/railroad.test.ts`
Expected: 全 PASS

- [ ] **Step 6: 型チェック & Commit**

```bash
node_modules/.bin/astro check
git add src/utils/regex-visualizer/railroad.ts src/utils/regex-visualizer/index.ts src/utils/regex-visualizer/__tests__/railroad.test.ts
git commit -m "feat: regexp-tree AST から鉄道図レイアウトを組む buildRailroad を追加"
```

## Task 4: RegexRailroad.tsx（SVG レンダラ）

**Files:**

- Create: `src/components/tools/RegexRailroad.tsx`
- Modify: `src/styles/global.css`
- Test: `src/components/tools/__tests__/RegexRailroad.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { RegexRailroad } from '../RegexRailroad';
import {
  measureSequence,
  measureTerminal,
  measureGroup,
} from '@/utils/regex-visualizer/railroad-layout';

afterEach(() => cleanup());

describe('RegexRailroad', () => {
  it('terminal を rect + text で描画する', () => {
    const node = measureTerminal('a', { start: 0, end: 1 });
    const { container } = render(<RegexRailroad node={node} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).toContain('a');
  });

  it('sequence は子ごとに rect を描画する', () => {
    const node = measureSequence(
      [measureTerminal('a', undefined), measureTerminal('b', undefined)],
      undefined
    );
    const { container } = render(<RegexRailroad node={node} />);
    expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(2);
  });

  it('group はタイトルを描画する', () => {
    const node = measureGroup(measureTerminal('a', undefined), '#1', undefined);
    const { container } = render(<RegexRailroad node={node} />);
    expect(container.textContent).toContain('#1');
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/components/tools/__tests__/RegexRailroad.test.tsx`
Expected: FAIL（`RegexRailroad` 未定義）

- [ ] **Step 3: RegexRailroad.tsx を実装**

```tsx
import {
  type RailNode,
  H_GAP,
  GROUP_PAD_X,
  GROUP_PAD_TOP,
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
          {/* group 枠の入口/出口から inner へ rail を渡す */}
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
```

- [ ] **Step 4: rr-\* 意味クラスを global.css の `@layer components` に追加**

`src/styles/global.css` で CSS 変数の実名を確認のうえ追記（例。変数名は実定義に合わせる）:

```css
.rr-svg {
  max-width: 100%;
}
.rr-rail {
  stroke: var(--color-border-input);
  stroke-width: 1.5;
  fill: none;
}
.rr-marker {
  fill: var(--color-border-input);
}
.rr-box {
  fill: var(--color-bg-subtle);
  stroke: var(--color-border-input);
  stroke-width: 1;
}
.rr-box-fallback {
  stroke-dasharray: 4 3;
}
.rr-text {
  fill: var(--color-text-default);
  font-family: var(--font-mono, monospace);
  font-size: 13px;
}
.rr-group {
  fill: none;
  stroke: var(--color-border);
  stroke-width: 1;
  stroke-dasharray: 2 2;
}
.rr-group-title {
  fill: var(--color-text-muted);
  font-size: 11px;
}
```

- [ ] **Step 5: 実行して PASS を確認 + ビルドで CSS 生成確認**

Run: `npx vitest run src/components/tools/__tests__/RegexRailroad.test.tsx && node_modules/.bin/astro check && npm run build`
Expected: テスト全 PASS、型 0、build 成功。`grep -r "rr-box" dist/_astro/*.css` でルール生成を確認。

- [ ] **Step 6: Commit**

```bash
git add src/components/tools/RegexRailroad.tsx src/styles/global.css src/components/tools/__tests__/RegexRailroad.test.tsx
git commit -m "feat: 鉄道図 SVG レンダラ RegexRailroad を追加"
```

## Task 5: RegexVisualizer にタブを追加

**Files:**

- Modify: `src/components/tools/RegexVisualizer.tsx`
- Modify: `src/components/tools/__tests__/RegexVisualizer.test.tsx`

- [ ] **Step 1: 失敗するテストを追記**

`RegexVisualizer.test.tsx` に追記（既存テストは維持）:

```tsx
it('鉄道図タブに切り替えると SVG が表示される', async () => {
  render(<RegexVisualizer />);
  setPattern('abc');
  // まず構造ツリーに結果が出るのを待つ（動的 import + debounce 完了の目印）
  await screen.findByText(/連結|文字 "a"/, undefined, FIND);
  fireEvent.click(screen.getByRole('button', { name: '鉄道図' }));
  const svg = await screen.findByRole('img', { name: '正規表現の鉄道図' }, FIND);
  expect(svg).toBeTruthy();
});
```

> 既存テスト先頭の import に `fireEvent` が無ければ追加（既に使用中なら不要）。

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/components/tools/__tests__/RegexVisualizer.test.tsx`
Expected: 新規テストが FAIL（タブ未実装）

- [ ] **Step 3: RegexVisualizer.tsx を改修**

import に追加:

```tsx
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { RegexRailroad } from './RegexRailroad';
import type { RailNode } from '@/utils/regex-visualizer';
```

`Analysis` インターフェースに鉄道図ノードを追加（`mod.buildRailroad` は client 専用なので analysis transform 内で呼ぶ）:

```tsx
interface Analysis {
  ast: RegexAstNode;
  redos: RedosResult;
  rail: RailNode;
}
```

view state を追加（`const [pattern...]` 付近）:

```tsx
const [view, setView] = useState<'tree' | 'railroad'>('tree');
```

debounce transform を拡張（`ast` / `redos` に加え `rail` を組む）:

```tsx
const analysis = useDebouncedTransform<string, Analysis | null>(
  mod && pattern.trim() ? pattern : null,
  (p) => ({
    ast: mod!.parseRegex(p, flags),
    redos: mod!.analyzeRedos(p, flags),
    rail: mod!.buildRailroad(p, flags),
  }),
  EMPTY,
  [mod, flags],
  { fallbackError: '正規表現が不正です' }
);
```

`const ast = ...` の付近に追加:

```tsx
const rail = analysis.result?.rail ?? null;
```

「構造ツリー」`<section>` を ToggleGroup + 切替表示に置き換える（ReDoS パネルはそのまま上に残す）。既存の構造ツリー section を以下に差し替え:

```tsx
<section aria-label="可視化">
  <div className="mb-3">
    <ToggleGroup
      options={[
        { value: 'tree', label: '構造ツリー' },
        { value: 'railroad', label: '鉄道図' },
      ]}
      value={view}
      onChange={(v) => setView(v as 'tree' | 'railroad')}
      ariaLabel="表示形式"
    />
  </div>
  {analysis.error ? (
    <ErrorMessage message={analysis.error} variant="block" />
  ) : view === 'tree' ? (
    ast ? (
      <RegexAstTree node={ast} hotspot={redos?.hotspot} />
    ) : (
      <p className="caption text-subtle">正規表現を入力すると構造が表示されます。</p>
    )
  ) : rail ? (
    <RegexRailroad node={rail} />
  ) : (
    <p className="caption text-subtle">正規表現を入力すると鉄道図が表示されます。</p>
  )}
</section>
```

> `RegexRailroad` は pure layout のみ import するため静的 import で SSR 安全。`RailNode` は `import type`（実行時消去）。`buildRailroad` は `mod` 経由（client 専用）。

- [ ] **Step 4: 実行して PASS を確認**

Run: `npx vitest run src/components/tools/__tests__/RegexVisualizer.test.tsx`
Expected: 全 PASS

- [ ] **Step 5: dev で目視 + 型チェック**

Run: `npm run pretest:e2e && npm run dev`（4321）→ `http://localhost:4321/tools/regex-visualizer` で `(abc)` 入力 → 「鉄道図」タブで図が出ること、`a+`（未対応）でフォールバック破線枠が出ることを確認。別ターミナルで `node_modules/.bin/astro check`（0 errors）。

- [ ] **Step 6: Commit**

```bash
node_modules/.bin/astro check
git add src/components/tools/RegexVisualizer.tsx src/components/tools/__tests__/RegexVisualizer.test.tsx
git commit -m "feat: 正規表現ビジュアライザに鉄道図タブを追加"
```

## Task 6: E2E（本番 CSP 下・タブ切替）

**Files:** Modify `tests/e2e/regex-visualizer.spec.ts`

- [ ] **Step 1: テストを追記**

```ts
test('鉄道図タブに切り替えると SVG が表示される', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
    await page.getByLabel('正規表現').fill('(abc)');
    await expect(page.getByText('キャプチャグループ #1')).toBeVisible(); // 構造ツリー側で解析完了を待つ
    await page.getByRole('button', { name: '鉄道図' }).click();
    await expect(page.getByRole('img', { name: '正規表現の鉄道図' })).toBeVisible();
  });
});
```

- [ ] **Step 2: E2E 実行**

Run: `npm run test:e2e -- regex-visualizer`
Expected: 全 PASS（CSP 違反 0）

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/regex-visualizer.spec.ts
git commit -m "test: 鉄道図タブの E2E を追加"
```

## Task 7: ドキュメント更新

**Files:** Modify `SPEC.md` / `docs/decisions.md`

- [ ] **Step 1: SPEC.md 2.4 章にファイル追加**

`src/utils/regex-visualizer/`（`railroad-layout.ts` / `railroad.ts`）と `src/components/tools/RegexRailroad.tsx` を構成に追記。

- [ ] **Step 2: decisions.md に追記**

鉄道図の自前 React SVG 採用（railroad-diagrams/regexper 却下理由）、SSR 安全のため pure layout 分離 + builder は動的 import 経由、PR2a/2b/2c 分割方針。

- [ ] **Step 3: 整形 & Commit**

```bash
npm run format
git add SPEC.md docs/decisions.md
git commit -m "docs: 鉄道図レンダラ（PR2a）の追加に伴うドキュメント更新"
```

## Task 8: 最終検証（push 前必須）

- [ ] **Step 1: unit 全実行（集計行確認）**

Run: `npm run test 2>&1 | grep -E "Test Files|Tests "`
Expected: fail 0。

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors。

- [ ] **Step 3: E2E**

Run: `npm run test:e2e -- regex-visualizer`
Expected: 全 PASS。

- [ ] **Step 4: UI 目視（PC 1280x800 / スマホ 390x844）**

Playwright MCP で `(abc)` / `a\dc`（直列・グループ）と `a+`（フォールバック）を入力し鉄道図タブを撮影。タブ切替・横スクロール・レスポンシブを目視確認。デフォルトタブ（構造ツリー・空入力）が不変のため VRT baseline は原則再生成不要。

> push / PR は `--base develop`。

---

## Self-Review（計画 vs スペック）

- **スペック方式（自前 React SVG）**: Task 4（RegexRailroad SVG・React 要素）✅／`dangerouslySetInnerHTML` 不使用 ✅
- **アーキ（pure layout 分離 + builder 動的 import）**: railroad-layout.ts（Task 2・pure）/ railroad.ts（Task 3・client 専用）/ RegexRailroad は layout のみ import（Task 4）✅／SSR 安全維持 ✅
- **PR2a スコープ（終端/連結/グループ/タブ/フォールバック）**: Task 2–5 ✅。Disjunction/Repetition/Assertion/Backreference は fallback（Task 3 default 分岐）✅
- **hotspot は PR2c**: 本計画では loc を載せるのみ（Task 3）。ハイライト描画は PR2c ✅（スコープ整合）
- **タブ既定=構造ツリー / VRT 不変**: Task 5（`view` 初期値 'tree'）✅
- **テスト**: layout 単体（Task 2）/ builder 単体（Task 3）/ renderer 単体（Task 4）/ タブ component（Task 5）/ E2E 本番 CSP（Task 6）✅
- **型整合**: `RailNode`（railroad-layout.ts 定義）を railroad.ts / RegexRailroad / RegexVisualizer で一貫使用。定数（H*GAP / GROUP_PAD*\*）は railroad-layout.ts から両所が import し measure と render で一致 ✅
- **placeholder スキャン**: TODO/TBD 無し・各コード step に実コードあり ✅
