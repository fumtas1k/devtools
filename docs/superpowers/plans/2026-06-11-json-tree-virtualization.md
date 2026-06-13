# json-formatter ツリー仮想化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** json-formatter のツリー表示を行数閾値（2,000 行超）で仮想化し、巨大 JSON でも可視範囲のみ DOM 化してフリーズを解消する（issue #512 残スコープ①）。

**Architecture:** ツリーを「デフォルト開閉からの反転 path 集合（XOR）」で flatten した平坦行配列に変換し、`scrollTop ÷ 行高` の純粋関数で可視範囲を計算して slice 描画する自前 windowing。範囲外の高さは SVG `height` 属性の spacer（CSP `style-src` 対象外、decisions [098] 方式）で保つ。閾値以下は現行の再帰ツリーのまま（DOM・VRT 不変）。

**Tech Stack:** React 19 / TypeScript / Vitest / Playwright。依存追加なし。

**Spec:** `docs/superpowers/specs/2026-06-11-json-tree-virtualization-design.md`

**禁止事項（プロジェクト規約）:**

- JSX の `style={{}}` / `style` 属性 / `el.style` mutation は CSP 違反（issue #176）。SVG presentation attribute（`width`/`height`）のみ可。
- Tailwind primitive カラークラス（`text-blue-500` 等）禁止。レイアウトクラス（`block` / `flex` 等）は可。
- `aria-*` / `role` 属性の削除禁止。
- E2E ロケーターは `getByRole` / `getByText` / `getByLabel`。`locator('[role="X"]')` 禁止（行数カウント用の `locator('li.json-row')` のような class セレクタは可）。
- コミットメッセージは日本語 Conventional Commits。
- 一時ファイルは `/tmp/claude/` 配下のみ。削除は `bash scripts/rm-tmp.sh <path>`。

---

## ファイル構成

| ファイル                                                     | 役割                                                 |
| :----------------------------------------------------------- | :--------------------------------------------------- |
| `src/utils/json-formatter/flatten.ts`（新規）                | flattenTree / countRows / computeWindow（純粋関数）  |
| `src/utils/json-formatter/__tests__/flatten.test.ts`（新規） | 上記の unit test                                     |
| `src/utils/json-formatter/index.ts`（変更）                  | `export * from './flatten';` 追加                    |
| `src/components/tools/JsonTreeRowParts.tsx`（新規）          | KeyPart / RowActions / VALUE_CLASS（両ツリーで共用） |
| `src/components/tools/JsonTreeView.tsx`（変更）              | 共用部品を JsonTreeRowParts から import              |
| `src/components/tools/JsonTreeViewVirtual.tsx`（新規）       | 仮想化ツリービュー                                   |
| `src/components/tools/JsonTreeResult.tsx`（変更）            | 行数閾値で 2 ビューを出し分け                        |
| `tests/e2e/json-formatter-tree-virtual.spec.ts`（新規）      | 仮想化 E2E（陽性対照 + 陰性対照 + CSP）              |
| `docs/decisions.md`（変更）                                  | 新エントリ（計測値・採用理由）                       |
| `docs/tools.md`（変更）                                      | json-formatter 節に仮想化の挙動・制限を追記          |

---

### Task 1: 計測（before）

実装前のベースライン計測。数値は Task 9 の decisions エントリに使う。

**Files:**

- Create: `/tmp/claude/measure-tree.mjs`（一時スクリプト。リポジトリにはコミットしない）

- [ ] **Step 1: 計測スクリプトを作成**

```js
// /tmp/claude/measure-tree.mjs — issue #512 ツリー描画計測（before/after 共通）
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
// 約 55,000 行相当・整形済み 500KB 超 → ガード発動 →「ツリーを表示」で強制構築する経路
const data = JSON.stringify(
  Array.from({ length: 5000 }, (_, i) => ({
    id: i,
    name: `item-${i}`,
    tags: ['alpha', 'beta'],
    meta: { even: i % 2 === 0, score: i * 1.5 },
  }))
);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/tools/json-formatter`);
await page.getByLabel('入力').fill(data);
await page.getByRole('button', { name: 'ツリー', exact: true }).click();
await page.getByRole('button', { name: 'ツリーを表示' }).waitFor();

const t0 = Date.now();
await page.getByRole('button', { name: 'ツリーを表示' }).click();
await page.getByRole('group', { name: 'JSON ツリー' }).waitFor();
const renderMs = Date.now() - t0;
const liCount = await page.locator('li.json-row').count();

// 全折りたたみの応答時間（操作フリーズの指標）
const t1 = Date.now();
await page.getByRole('button', { name: '全折りたたみ' }).click();
await page.getByText('5000 項目').waitFor();
const collapseMs = Date.now() - t1;

console.log(JSON.stringify({ renderMs, liCount, collapseMs }));
await browser.close();
```

- [ ] **Step 2: preview サーバーを起動して計測を実行**

```bash
npm run build
npm run preview &   # 4321 で起動（バックグラウンド）
node /tmp/claude/measure-tree.mjs
```

Expected: `{"renderMs": <数千ms 規模>, "liCount": <55,000 前後>, "collapseMs": <数百〜数千ms>}` が出力される。**数値を記録しておく**（Task 9 で使用）。実行後 preview プロセスを停止する。

- [ ] **Step 3: 計測値が十分軽い場合は停止**

renderMs が 500ms 未満など「問題が再現しない」場合は実装に進まず親に報告する（measure-first / YAGNI）。

---

### Task 2: flatten ユーティリティ（flattenTree / countRows）

**Files:**

- Create: `src/utils/json-formatter/flatten.ts`
- Create: `src/utils/json-formatter/__tests__/flatten.test.ts`
- Modify: `src/utils/json-formatter/index.ts:1-7`（export 追加）

- [ ] **Step 1: 失敗するテストを書く**

```ts
// src/utils/json-formatter/__tests__/flatten.test.ts
import { describe, it, expect } from 'vitest';
import { flattenTree, countRows } from '../flatten';
import { parseJson } from '../parse';
import { buildTree } from '../tree';
import type { TreeNode } from '../tree';

function treeOf(text: string): TreeNode {
  const r = parseJson(text);
  if (!r.ok) throw new Error('fixture の JSON が不正');
  return buildTree(r.root, text);
}

describe('flattenTree', () => {
  // 全展開 8 行: root open / a / b open / true / null / b close / c / root close
  const FIXTURE = '{"a": 1, "b": [true, null], "c": "x"}';

  it('全展開で value/open/close を文書順に列挙し depth を付与する', () => {
    const rows = flattenTree(treeOf(FIXTURE), new Set(), true);
    expect(rows.map((r) => r.kind)).toEqual([
      'open',
      'value',
      'open',
      'value',
      'value',
      'close',
      'value',
      'close',
    ]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 2, 2, 1, 1, 0]);
  });

  it('toggled の path を折りたたみ、子孫と close 行を出力しない（defaultOpen=true の XOR）', () => {
    const rows = flattenTree(treeOf(FIXTURE), new Set(['$.b']), true);
    expect(rows.map((r) => r.key)).toEqual(['$', '$.a', '$.b', '$.c', '$:close']);
    const b = rows.find((r) => r.key === '$.b');
    expect(b?.kind).toBe('open');
    expect(b?.collapsed).toBe(true);
  });

  it('defaultOpen=false では toggled の path だけが開く', () => {
    const rows = flattenTree(treeOf(FIXTURE), new Set(['$']), false);
    expect(rows.map((r) => r.key)).toEqual(['$', '$.a', '$.b', '$.c', '$:close']);
    expect(rows.find((r) => r.key === '$.b')?.collapsed).toBe(true);
  });

  it('defaultOpen=false かつ toggled 空ではルート 1 行だけになる', () => {
    const rows = flattenTree(treeOf(FIXTURE), new Set(), false);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('open');
    expect(rows[0].collapsed).toBe(true);
  });

  it('行キーは全行で一意になる（close 行は path + ":close"）', () => {
    const rows = flattenTree(treeOf(FIXTURE), new Set(), true);
    const keys = rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('プリミティブのみのルートは value 1 行', () => {
    const rows = flattenTree(treeOf('42'), new Set(), true);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('value');
    expect(rows[0].node.raw).toBe('42');
  });
});

describe('countRows', () => {
  it('flattenTree 全展開の行数と一致する', () => {
    const tree = treeOf('{"a": 1, "b": [true, null], "c": "x"}');
    expect(countRows(tree)).toBe(flattenTree(tree, new Set(), true).length);
  });

  it('プリミティブのみのルートは 1', () => {
    expect(countRows(treeOf('"s"'))).toBe(1);
  });

  it('空オブジェクトは open + close の 2', () => {
    expect(countRows(treeOf('{}'))).toBe(2);
  });
});
```

- [ ] **Step 2: テストが fail することを確認**

Run: `npx vitest run src/utils/json-formatter/__tests__/flatten.test.ts`
Expected: FAIL（`Cannot find module '../flatten'` など）

- [ ] **Step 3: flatten.ts を実装**

```ts
// src/utils/json-formatter/flatten.ts
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
```

- [ ] **Step 4: テストが pass することを確認**

Run: `npx vitest run src/utils/json-formatter/__tests__/flatten.test.ts`
Expected: PASS（flattenTree 6 件 + countRows 3 件）

- [ ] **Step 5: index.ts に export を追加**

`src/utils/json-formatter/index.ts` の export 群（1〜7 行目)に追加:

```ts
export * from './flatten';
```

- [ ] **Step 6: 型チェックとコミット**

```bash
node_modules/.bin/astro check
git add src/utils/json-formatter/flatten.ts src/utils/json-formatter/__tests__/flatten.test.ts src/utils/json-formatter/index.ts
git commit -m "feat: json ツリーの flatten ユーティリティを追加 (#512)"
```

---

### Task 3: 可視範囲計算（computeWindow）

**Files:**

- Modify: `src/utils/json-formatter/flatten.ts`（末尾に追加）
- Modify: `src/utils/json-formatter/__tests__/flatten.test.ts`（describe 追加）

- [ ] **Step 1: 失敗するテストを追加**

`flatten.test.ts` の import に `computeWindow` を追加し、末尾に describe を追加:

```ts
describe('computeWindow', () => {
  it('スクロール位置から可視範囲 + overscan を返す', () => {
    // 100 行 × 行高 20px、viewport 200px、scrollTop 400 → 可視 20〜30 行目 ± overscan 5
    expect(computeWindow(400, 200, 20, 100, 5)).toEqual({ start: 15, end: 35 });
  });

  it('先頭で start を 0 に clamp する', () => {
    expect(computeWindow(0, 200, 20, 100, 5)).toEqual({ start: 0, end: 15 });
  });

  it('末尾（実スクロール上限）で end を totalRows に clamp する', () => {
    // contentH 2000 - viewport 200 = scrollTop 上限 1800
    expect(computeWindow(1800, 200, 20, 100, 5)).toEqual({ start: 85, end: 100 });
  });

  it('行数縮小直後の過大な scrollTop でも範囲が破綻しない', () => {
    const w = computeWindow(10_000, 200, 20, 100, 5);
    expect(w.start).toBeLessThan(w.end);
    expect(w.end).toBe(100);
  });

  it('totalRows=0 は空範囲を返す', () => {
    expect(computeWindow(0, 200, 20, 0, 5)).toEqual({ start: 0, end: 0 });
  });

  it('rowH 未確定（<=0）では先頭から overscan ぶんだけ描画する', () => {
    expect(computeWindow(0, 200, 0, 100, 5)).toEqual({ start: 0, end: 5 });
  });

  it('負の scrollTop（バウンススクロール）は 0 として扱う', () => {
    expect(computeWindow(-50, 200, 20, 100, 5)).toEqual({ start: 0, end: 15 });
  });
});
```

- [ ] **Step 2: fail を確認**

Run: `npx vitest run src/utils/json-formatter/__tests__/flatten.test.ts`
Expected: FAIL（`computeWindow` 未定義）

- [ ] **Step 3: computeWindow を実装**

`flatten.ts` 末尾に追加:

```ts
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
```

- [ ] **Step 4: pass を確認**

Run: `npx vitest run src/utils/json-formatter/__tests__/flatten.test.ts`
Expected: PASS（全 describe）

- [ ] **Step 5: 型チェックとコミット**

```bash
node_modules/.bin/astro check
git add src/utils/json-formatter/flatten.ts src/utils/json-formatter/__tests__/flatten.test.ts
git commit -m "feat: 等高行 windowing の可視範囲計算 computeWindow を追加 (#512)"
```

---

### Task 4: 行部品の共用化（KeyPart / RowActions / VALUE_CLASS の抽出）

挙動変更なしの refactor。`JsonTreeView.tsx` のモジュール内 private な 3 定義を新ファイルへ移し、両ツリービューから import できるようにする。

**Files:**

- Create: `src/components/tools/JsonTreeRowParts.tsx`
- Modify: `src/components/tools/JsonTreeView.tsx:1-34`（定義を削除し import に置換）

- [ ] **Step 1: JsonTreeRowParts.tsx を作成**

```tsx
// src/components/tools/JsonTreeRowParts.tsx
import { CopyButton } from '@/components/ui/CopyButton';
import type { TreeNode } from '@/utils/json-formatter';

/** JSON 値型 → 構文色 class（JsonTreeView / JsonTreeViewVirtual 共用）。 */
export const VALUE_CLASS: Record<string, string> = {
  string: 'json-string',
  number: 'json-number',
  boolean: 'json-boolean',
  null: 'json-null',
};

/** キー名（または配列インデックス）部分。ルート（key=null）は何も描画しない。 */
export function KeyPart({ node }: { node: TreeNode }) {
  if (node.key === null) return null;
  if (typeof node.key === 'number') {
    return <span className="json-index">{node.key}: </span>;
  }
  return (
    <>
      <span className="json-key">&quot;{node.key}&quot;</span>
      <span className="json-punct">: </span>
    </>
  );
}

/** 行末のコピー操作（パスコピー + プリミティブの値コピー）。 */
export function RowActions({ node }: { node: TreeNode }) {
  return (
    <span className="json-row-actions">
      <CopyButton compact text={node.path} ariaLabel={`パスをコピー (${node.path})`} />
      {node.raw !== undefined && (
        <CopyButton compact text={node.raw} ariaLabel={`値をコピー (${node.path})`} />
      )}
    </span>
  );
}
```

- [ ] **Step 2: JsonTreeView.tsx から定義を削除して import に置換**

`JsonTreeView.tsx` の先頭（1〜34 行目: import 2 行 + `VALUE_CLASS` + `KeyPart` + `RowActions` の定義）を以下に置換する。`TreeRow` 以降は変更しない:

```tsx
import { useState } from 'react';
import { KeyPart, RowActions, VALUE_CLASS } from '@/components/tools/JsonTreeRowParts';
import type { TreeNode } from '@/utils/json-formatter';
```

（`CopyButton` の import は RowActions と共に移動したため削除する）

- [ ] **Step 3: 既存テストが green のままであることを確認**

```bash
node_modules/.bin/astro check
npm run test
```

Expected: 型エラーなし、`Test Files N passed` / `Tests M passed`（集計行を必ず確認）

- [ ] **Step 4: コミット**

```bash
git add src/components/tools/JsonTreeRowParts.tsx src/components/tools/JsonTreeView.tsx
git commit -m "refactor: JSON ツリーの行部品を JsonTreeRowParts へ抽出 (#512)"
```

---

### Task 5: 仮想化ツリービュー（JsonTreeViewVirtual）

**Files:**

- Create: `src/components/tools/JsonTreeViewVirtual.tsx`

- [ ] **Step 1: コンポーネントを実装**

```tsx
// src/components/tools/JsonTreeViewVirtual.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { KeyPart, RowActions, VALUE_CLASS } from '@/components/tools/JsonTreeRowParts';
import { flattenTree, computeWindow } from '@/utils/json-formatter';
import type { FlatRow, TreeNode } from '@/utils/json-formatter';

/** 実測前に使う行高の推定値（caption 0.875rem × line-height 1.6 + padding ≒ 24px）。 */
const ESTIMATED_ROW_H = 24;
/** 可視範囲の上下に余分に描画する行数（スクロール時の白抜け防止）。 */
const OVERSCAN = 20;

interface Props {
  node: TreeNode;
  /** 各コンテナの初期開閉状態（全展開 / 全折りたたみは親が key 再マウントで反映）。 */
  defaultOpen: boolean;
  /** スクロールコンテナ（.json-tree-box）への ref。親（JsonTreeResult）が所有する。 */
  scrollRef: RefObject<HTMLDivElement | null>;
}

interface RowProps {
  row: FlatRow;
  onToggle: (path: string) => void;
  /** 行高実測用 callback ref（可視 slice の先頭行のみに付与）。 */
  measureRef?: (el: HTMLLIElement | null) => void;
}

function VirtualRow({ row, onToggle, measureRef }: RowProps) {
  const { node, depth, kind } = row;
  // 現行ツリーの入れ子 ul（padding-left: 1.1rem）と同じ幅のインデントを
  // depth 個のスペーサで表現する（フラット構造のため。罫線は仮想パスでは省略）。
  const indent = Array.from({ length: depth }, (_, i) => (
    <span key={i} className="json-toggle-spacer" aria-hidden="true" />
  ));

  if (kind === 'close') {
    return (
      <li className="json-row" ref={measureRef}>
        <span className="json-line">
          {indent}
          <span className="json-toggle-spacer" aria-hidden="true" />
          <span className="json-punct">{node.type === 'array' ? ']' : '}'}</span>
        </span>
      </li>
    );
  }

  if (kind === 'value') {
    return (
      <li className="json-row" ref={measureRef}>
        <span className="json-line">
          {indent}
          <span className="json-toggle-spacer" aria-hidden="true" />
          <KeyPart node={node} />
          <span className={VALUE_CLASS[node.type] ?? ''}>{node.raw}</span>
          <RowActions node={node} />
        </span>
      </li>
    );
  }

  // kind === 'open'
  const openBracket = node.type === 'array' ? '[' : '{';
  const closeBracket = node.type === 'array' ? ']' : '}';
  const count = node.children?.length ?? 0;
  const open = !row.collapsed;
  return (
    <li className="json-row" ref={measureRef}>
      <span className="json-line">
        {indent}
        <button
          type="button"
          className="json-toggle"
          aria-expanded={open}
          aria-label={open ? '折りたたむ' : '展開する'}
          onClick={() => onToggle(node.path)}
        >
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
        <KeyPart node={node} />
        <span className="json-punct">{openBracket}</span>
        {!open && (
          <>
            <span className="json-collapsed">…</span>
            <span className="json-punct">{closeBracket}</span>
            <span className="json-count">{count} 項目</span>
          </>
        )}
        <RowActions node={node} />
      </span>
    </li>
  );
}

/**
 * 大規模 JSON 用の仮想化ツリービュー（issue #512）。
 * 可視範囲の行だけを DOM 化し、範囲外の高さは上下の spacer で保つ。
 *
 * - 開閉状態は「デフォルトからの反転 path 集合」で集中管理（flattenTree の XOR 設計）。
 *   全展開 / 全折りたたみは親の key 再マウント + defaultOpen で state ごとリセットされる
 *   （JsonTreeView と同じ流儀）。
 * - spacer の高さは SVG の height 属性（presentation attribute）で表現する。
 *   CSS inline style ではないため CSP style-src の対象外（decisions [098] と同方式）。
 *   inline style / el.style mutation は一切使わない（issue #176 B 案準拠）。
 * - 行高は等高前提（1 行固定・nowrap）。可視 slice の先頭行を描画のたびに実測し、
 *   ズーム / フォント変化に追従する。
 */
export function JsonTreeViewVirtual({ node, defaultOpen, scrollRef }: Props) {
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [rowH, setRowH] = useState(0); // 0 = 未実測（推定値で描画）

  const rows = useMemo(() => flattenTree(node, toggled, defaultOpen), [node, toggled, defaultOpen]);

  // スクロール位置（rAF throttle）とビューポート高（ResizeObserver）を追跡する。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportH(el.clientHeight);
    setScrollTop(el.scrollTop);
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrollTop(el.scrollTop));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [scrollRef]);

  // 行高の実測（callback ref）。0.5px 未満の揺らぎでは更新せず実測→再描画のループを防ぐ。
  const measureRef = useCallback((el: HTMLLIElement | null) => {
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    if (h > 0) setRowH((prev) => (Math.abs(prev - h) > 0.5 ? h : prev));
  }, []);

  const onToggle = useCallback((path: string) => {
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const effectiveRowH = rowH > 0 ? rowH : ESTIMATED_ROW_H;
  const { start, end } = computeWindow(scrollTop, viewportH, effectiveRowH, rows.length, OVERSCAN);
  const topH = Math.round(start * effectiveRowH);
  const bottomH = Math.round((rows.length - end) * effectiveRowH);

  return (
    <div className="json-tree-root caption font-mono" role="group" aria-label="JSON ツリー">
      <ul className="json-tree json-tree--root">
        {topH > 0 && (
          <li aria-hidden="true">
            <svg className="block" width="1" height={topH} />
          </li>
        )}
        {rows.slice(start, end).map((row, i) => (
          <VirtualRow
            key={row.key}
            row={row}
            onToggle={onToggle}
            measureRef={i === 0 ? measureRef : undefined}
          />
        ))}
        {bottomH > 0 && (
          <li aria-hidden="true">
            <svg className="block" width="1" height={bottomH} />
          </li>
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

```bash
node_modules/.bin/astro check
```

Expected: エラーなし（まだどこからも参照されていないが単体で型が通ること）

- [ ] **Step 3: コミット**

```bash
git add src/components/tools/JsonTreeViewVirtual.tsx
git commit -m "feat: 仮想化 JSON ツリービュー JsonTreeViewVirtual を追加 (#512)"
```

---

### Task 6: E2E テストを先に書き、旧実装で fail することを確認（陽性対照の証明）

test-gates 準拠: 「DOM 行数 < 総行数」assert は仮想化が空回りすると fail する陽性対照。**配線前（= 旧実装相当）に実行して fail を実機確認**し、Task 7 の配線で pass に変わることで検知能力を証明する。

**Files:**

- Create: `tests/e2e/json-formatter-tree-virtual.spec.ts`

- [ ] **Step 1: E2E spec を作成**

```ts
// tests/e2e/json-formatter-tree-virtual.spec.ts
import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

// 1500 要素 × 4 行（open/close + id/name）+ ルート 2 行 = 6002 行 > TREE_VIRTUALIZE_THRESHOLD(2000)
// 入力は約 45KB で 500KB ガードには掛からない（自動構築 → 仮想化経路のみを検証する）
const bigJson = () =>
  JSON.stringify(Array.from({ length: 1500 }, (_, i) => ({ id: i, name: `item-${i}` })));

test.describe('JSON ツリー仮想化（production CSP 適用）', () => {
  // 陽性対照: 仮想化が機能しなければ（全行 DOM 化なら）この assert は fail する。
  // 旧実装に当てて fail することを確認済み（Task 6）。
  test('閾値超の JSON で可視範囲のみ DOM 化される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill(bigJson());
      await page.getByRole('button', { name: 'ツリー', exact: true }).click();
      const tree = page.getByRole('group', { name: 'JSON ツリー' });
      await expect(tree).toBeVisible();
      await expect(tree.getByText('"id"').first()).toBeVisible();
      const liCount = await tree.locator('li.json-row').count();
      expect(liCount).toBeGreaterThan(0);
      expect(liCount).toBeLessThan(500); // 総行数 6002 に対し可視範囲 + overscan のみ
    });
  });

  test('スクロールで末尾付近の行が描画される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill(bigJson());
      await page.getByRole('button', { name: 'ツリー', exact: true }).click();
      const tree = page.getByRole('group', { name: 'JSON ツリー' });
      await expect(tree.getByText('"id"').first()).toBeVisible();
      await tree.hover();
      await page.mouse.wheel(0, 10_000_000); // コンテナ最下部まで一気にスクロール
      await expect(tree.getByText('item-1499')).toBeVisible();
    });
  });

  test('仮想ビューでも開閉・全展開/全折りたたみが機能する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByLabel('入力').fill(bigJson());
      await page.getByRole('button', { name: 'ツリー', exact: true }).click();
      const tree = page.getByRole('group', { name: 'JSON ツリー' });
      await expect(tree.getByText('"id"').first()).toBeVisible();

      // 全折りたたみ → ルートの折りたたみ行 1 行だけになる
      await page.getByRole('button', { name: '全折りたたみ' }).click();
      await expect(tree.getByText('1500 項目')).toBeVisible();
      expect(await tree.locator('li.json-row').count()).toBe(1);

      // ルートを展開 → 子コンテナの折りたたみ行（2 項目）が見える
      await tree.getByRole('button', { name: '展開する' }).first().click();
      await expect(tree.getByText('2 項目').first()).toBeVisible();

      // 全展開へ戻すとプリミティブ行が見える
      await page.getByRole('button', { name: '全展開' }).click();
      await expect(tree.getByText('"id"').first()).toBeVisible();
    });
  });

  // 陰性対照（陽性対照とは別 test）: 閾値未満の入力は従来の入れ子ツリーのまま。
  // 仮想化の適用条件が壊れて常時仮想化になると fail する。
  test('閾値未満の入力では従来の入れ子ツリーのまま（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/json-formatter', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await page.getByRole('button', { name: 'ツリー', exact: true }).click();
      const tree = page.getByRole('group', { name: 'JSON ツリー' });
      await expect(tree.getByText('"name"')).toBeVisible();
      // 従来パスの目印: 入れ子 ul（仮想パスはフラット ul 1 つで入れ子なし）
      expect(await tree.locator('ul ul').count()).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: 旧実装（未配線）で陽性対照が fail することを確認**

```bash
npm run pretest:e2e
npx playwright test tests/e2e/json-formatter-tree-virtual.spec.ts
```

Expected:

- 「閾値超の JSON で可視範囲のみ DOM 化される」が **FAIL**（liCount が 6002 で 500 未満にならない）→ これが陽性対照の実機証明。出力を記録する。
- 「閾値未満の入力では従来の入れ子ツリーのまま」は PASS（現状も入れ子 ul）。
- スクロール / 開閉テストは旧実装でも PASS し得る（仮想化の有無に依存しない機能パリティ確認のため問題ない）。

- [ ] **Step 3: spec だけ先にコミット**

```bash
git add tests/e2e/json-formatter-tree-virtual.spec.ts
git commit -m "test(e2e): ツリー仮想化の陽性対照・陰性対照 E2E を追加 (#512)"
```

（この時点で E2E は red。次タスクの配線で green になる）

---

### Task 7: JsonTreeResult の出し分け配線 → E2E green

**Files:**

- Modify: `src/components/tools/JsonTreeResult.tsx`

- [ ] **Step 1: JsonTreeResult.tsx を変更**

ファイル全体を以下へ書き換える（import 追加・`TREE_VIRTUALIZE_THRESHOLD` 追加・`boxRef` / `virtualize` 追加・ツリー描画分岐の変更。それ以外の構造は現行を維持）:

```tsx
// src/components/tools/JsonTreeResult.tsx
import { useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { JsonTreeView } from '@/components/tools/JsonTreeView';
import { JsonTreeViewVirtual } from '@/components/tools/JsonTreeViewVirtual';
import { countRows } from '@/utils/json-formatter';
import type { TreeNode } from '@/utils/json-formatter';

/**
 * 全展開換算の総行数がこの値を超えたら仮想化ビューへ切り替える（issue #512）。
 * 以下では従来の入れ子ツリー（DOM・見た目とも不変）、超えたら可視範囲のみ DOM 化する。
 */
export const TREE_VIRTUALIZE_THRESHOLD = 2_000;

interface Props {
  /** 表示するツリー。null のときは案内文を出す。 */
  tree: TreeNode | null;
  /** このモードの実効出力（整形テキスト）。コピー対象・結果有無判定に使う。 */
  output: string;
  /** key を変えて全行の開閉状態をリセットするための再マウントキー。 */
  treeKey: number;
  /** 各行の初期開閉状態（全展開/全折りたたみ）。 */
  defaultOpen: boolean;
  /** ラベル右に並べる要素（ダウンロードボタン）。 */
  rightSlot: ReactNode;
  /** 大入力ガード発動中（ツリーを自動構築せず案内を出す）。 */
  tooLarge?: boolean;
  /** 「ツリーを表示」押下時（ガードを解除して構築させる）。 */
  onForceRender?: () => void;
}

/**
 * ツリーモードの結果パネル。ヘッダ（ラベル＋DL＋コピー）＋折りたたみツリーを描画する。
 * 総行数が TREE_VIRTUALIZE_THRESHOLD を超える場合は仮想化ビューに切り替える。
 */
export function JsonTreeResult({
  tree,
  output,
  treeKey,
  defaultOpen,
  rightSlot,
  tooLarge,
  onForceRender,
}: Props) {
  const hasResult = output !== '';
  const boxRef = useRef<HTMLDivElement>(null);
  // 仮想化判定は tree ごとに 1 回。開閉状態に依存しないため経路がフリッカしない。
  const virtualize = useMemo(
    () => (tree ? countRows(tree) > TREE_VIRTUALIZE_THRESHOLD : false),
    [tree]
  );
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 min-h-8 gap-2">
        <span className="body-emphasis text-default">結果</span>
        {hasResult && (
          <div className="flex items-center gap-2">
            {rightSlot}
            <CopyButton text={output} ariaLabel="整形結果をコピー" />
          </div>
        )}
      </div>
      <div
        ref={boxRef}
        className="json-tree-box rounded-lg border border-default bg-subtle px-3 py-2"
      >
        {tooLarge ? (
          <div className="space-y-2" role="status" aria-live="polite">
            <p className="caption text-muted">
              JSON が大きいため、ツリー描画を保留しています（重い処理を避けるため）。
            </p>
            <button
              type="button"
              className="caption text-link-plain btn-link-plain"
              onClick={onForceRender}
            >
              ツリーを表示
            </button>
          </div>
        ) : tree ? (
          virtualize ? (
            <JsonTreeViewVirtual
              key={treeKey}
              node={tree}
              defaultOpen={defaultOpen}
              scrollRef={boxRef}
            />
          ) : (
            <JsonTreeView key={treeKey} node={tree} defaultOpen={defaultOpen} />
          )
        ) : (
          <p className="caption text-muted">有効な JSON を入力するとツリーが表示されます。</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック + unit テスト**

```bash
node_modules/.bin/astro check
npm run test
```

Expected: 型エラーなし、`Test Files N passed` / `Tests M passed`（集計行を必ず確認）

- [ ] **Step 3: 新規 E2E が green になることを確認（陽性対照が fail → pass に転じた証明）**

```bash
npm run pretest:e2e
npx playwright test tests/e2e/json-formatter-tree-virtual.spec.ts
```

Expected: 4 テスト全て PASS（Task 6 Step 2 の FAIL と対で、検知能力が証明された）

- [ ] **Step 4: 既存 json-formatter E2E の回帰確認**

```bash
npx playwright test tests/e2e/json-formatter.spec.ts
```

Expected: 全て PASS（小入力は従来パスのままなので影響なし）

- [ ] **Step 5: コミット**

```bash
git add src/components/tools/JsonTreeResult.tsx
git commit -m "feat: JSON ツリーを行数閾値で仮想化ビューへ切り替え (#512)"
```

---

### Task 8: 計測（after）

- [ ] **Step 1: Task 1 と同一スクリプト・同一条件で再計測**

```bash
npm run build
npm run preview &
node /tmp/claude/measure-tree.mjs
```

Expected: `liCount` が数十〜200 程度に減少、`renderMs` / `collapseMs` が大幅短縮。**数値を記録する**（Task 9 で使用）。実行後 preview プロセスを停止し、`bash scripts/rm-tmp.sh /tmp/claude/measure-tree.mjs` で一時スクリプトを削除する。

---

### Task 9: ドキュメント更新

**Files:**

- Modify: `docs/decisions.md`（末尾に新エントリ追加。直前エントリの番号 +1 を採番）
- Modify: `docs/tools.md`（json-formatter 節）

- [ ] **Step 1: decisions.md に新エントリを追加**

以下のテンプレートに **Task 1 / Task 8 の実測値を埋めて** 追記する（`NNN` は既存最終エントリ +1、`X/Y/Z` は実測値）:

```markdown
## [NNN] 2026-06-11 — json-formatter ツリーの行数閾値仮想化（#512 残スコープ①）

**2026-06-11 | ステータス: 採用**

### 背景

decisions [096] のツリー遅延構築 + 500KB ガード後も、ガードを明示解除した巨大ツリーは全ノード再帰 DOM 化で重く、ガード未満（数百 KB）でも数万ノードで描画・操作が重い（issue #512 残スコープ）。

### 計測（measure-first）

5000 要素の配列（全展開換算 約 55,000 行・整形済み 500KB 超）での実測:

| 指標                       | before（全行 DOM 化） | after（仮想化） |
| -------------------------- | --------------------- | --------------- |
| 強制表示 → ツリー出現 (ms) | X                     | X'              |
| DOM 行数 (li.json-row)     | Y (≒ 全行)            | Y' (可視のみ)   |
| 全折りたたみ応答 (ms)      | Z                     | Z'              |

### 決断

- **行数閾値で仮想化**: 全展開換算の総行数（`countRows`）が `TREE_VIRTUALIZE_THRESHOLD = 2_000` 超のとき `JsonTreeViewVirtual`（自前 windowing）へ切替。以下は従来の再帰ツリーのまま（DOM・見た目・VRT 不変）。
- **自前 windowing 採用**: 行は等高（1 行固定・nowrap）・固定高コンテナ（28rem）という最も単純なケースで、可視範囲計算は純粋関数 `computeWindow` 1 つ。`@tanstack/react-virtual` は公式パターンが全可視行の inline style（transform/height）前提で CSP `style-src 'unsafe-inline'` 撤去（#176）と衝突し、依存 2 パッケージ追加の割に提供価値が薄いため不採用。
- **spacer は SVG height 属性**: 範囲外の高さは aria-hidden な li 内の SVG presentation attribute で表現（decisions [098] と同方式・CSP 対象外）。`useDynamicStyleSheet` は `useEffect` 経由で描画より 1 フレーム遅れスクロールジッターが出るため不採用。
- **開閉状態の XOR 集中管理**: 「デフォルト開閉からの反転 path 集合」で保持し、全折りたたみ時の全 path 列挙を回避。全展開/全折りたたみは既存の key 再マウント方式を踏襲。
- **500KB ガードは維持**: ツリー構築（makeTree）自体のメインスレッド同期コストは仮想化では解消しない。Worker オフロードと `getNodeValue` 遅延化は #512 残スコープとして継続。

### 結果・トレードオフ

- ✅ 閾値以下の通常入力は DOM・見た目とも完全不変（VRT baseline 更新不要）。
- ✅ 陽性対照 E2E（DOM 行数 < 総行数）を配線前に実行して fail を実機確認済み（test-gates 準拠）。
- ⚠️ 仮想パスでは入れ子 ul の罫線（インデントガイド）を省略し depth ベースの spacer で代替。
- ⚠️ 仮想パスは可視行のみ DOM 化するため、ブラウザのページ内検索（Ctrl+F）は画面外の行にヒットしない。
```

- [ ] **Step 2: docs/tools.md の json-formatter 節に追記**

json-formatter 節の適切な箇所（ツリー表示 / 大入力ガードの説明付近）へ以下を追記する:

```markdown
- **ツリー仮想化**: 全展開換算 2,000 行超のツリーは可視範囲のみを DOM 化する仮想スクロールに自動で切り替わる（自前 windowing・依存なし）。仮想表示では入れ子の罫線（インデントガイド）は省略され、深さはインデント幅で表現される。画面外の行はブラウザのページ内検索にヒットしない。2,000 行以下は従来どおり全行を描画する。
```

- [ ] **Step 3: 整形・コミット**

```bash
npm run format
git add docs/decisions.md docs/tools.md
git commit -m "docs: ツリー仮想化の decisions エントリと tools.md 追記 (#512)"
```

---

### Task 10: 総合検証

- [ ] **Step 1: 全 unit テスト**

Run: `npm run test`
Expected: `Test Files N passed` / `Tests M passed`（**集計行を必ず確認**。Duration 行だけ見て pass と判断しない）

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors

- [ ] **Step 3: E2E 全体**

```bash
npm run pretest:e2e
npm run test:e2e
```

Expected: 全 PASS（CSP 違反ゼロ含む）

- [ ] **Step 4: フォーマットチェック**

Run: `npm run format:check`
Expected: 警告なし

- [ ] **Step 5: 完了報告**

親へ、スコープ項目ごとに「実装 / 既存で十分 / スキップ理由」を明示したチェックリスト形式で報告する。Task 1 / Task 8 の計測値と、Task 6 Step 2 の陽性対照 fail 出力を必ず含める。

---

## 自己レビュー記録（writing-plans Self-Review）

- **Spec coverage**: 計測 before/after（Task 1, 8）、flatten/XOR（Task 2）、computeWindow（Task 3）、仮想ビュー + SVG spacer + 行高実測 + rAF（Task 5）、閾値出し分け + 500KB ガード維持（Task 7）、E2E 陽性/陰性/CSP（Task 6, 7）、VRT 不変（陰性対照 + 既存 E2E 回帰）、decisions/tools.md（Task 9）— spec 全要件にタスク対応あり。
- **Placeholder**: decisions テンプレートの X/Y/Z は実測値の挿入指示であり手順として完結。それ以外なし。
- **型整合**: `FlatRow.key` / `flattenTree(root, toggled, defaultOpen)` / `countRows(root)` / `computeWindow(scrollTop, viewportH, rowH, totalRows, overscan)` / `TREE_VIRTUALIZE_THRESHOLD` の名称・シグネチャは全タスクで一致。
