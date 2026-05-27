# 正規表現 鉄道図 PR2b 実装計画（選択肢＋アサーション）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 鉄道図に選択肢（`a|b|c` の縦分岐）とアサーション（`^ $ \b \B` のアンカー、先読み/後読み）の描画を追加し、それぞれフォールバック枠から本実装へ置換する。

**Architecture:** PR2a の構成を踏襲。pure な `railroad-layout.ts` に `choice` / `assertion` の measure を追加、`railroad.ts` に `Disjunction`（二分木を平坦化）・`Assertion`（単純アンカー / 先読み後読み）の build を追加、`RegexRailroad.tsx` に `choice`（split/merge の SVG path）・`assertion`（pill）の描画を追加する。SSR 安全境界（pure layout 静的 import / builder は動的 import 経由）は不変。

**Tech Stack:** Astro + React (TSX) / 既存 `regexp-tree` / SVG / Vitest / Playwright

**設計スペック:** `docs/superpowers/specs/2026-05-27-regex-railroad-design.md` 4 章 PR2b

**範囲:** PR2b のみ。量指定子・後方参照・hotspot ハイライトは PR2c（別計画）。

---

## 前提知識（実装者向け）

- **SSR 安全境界（厳守）**: `railroad-layout.ts` は import ゼロの pure モジュール。`RegexRailroad.tsx` は `railroad-layout` からのみ import（型 + 定数）。`buildRailroad`（`railroad.ts`・regexp-tree CJS 依存）は `RegexVisualizer` の動的 import `mod` 経由でのみ呼ぶ。今回 RegexVisualizer は変更不要。
- **既存 measure（PR2a・`railroad-layout.ts`）**: `measureTerminal` / `measureFallback` / `measureSequence`（空は「（空）」fallback）/ `measureGroup(inner,title,loc)`。`RailKind = 'terminal'|'sequence'|'group'|'fallback'`。定数 `CHAR_W=8.5` `BOX_PAD_X=10` `BOX_H=34` `MIN_BOX_W=26` `H_GAP=22` `GROUP_PAD_*`。
- **既存 build（`railroad.ts`）**: `Char`/`CharacterClass`→terminal、`Alternative`→sequence、`Group`→group（空式 null ガード済み）、その他→`measureFallback(sliceLabel)`。ヘルパー `locOf`（offset-1）/ `sliceLabel`（pattern.slice）/ `groupTitle`。
- **regexp-tree 形状（実機確認済み）**:
  - `Disjunction`: `{ type:'Disjunction', left, right, loc }` — **二分木・左ネスト**。`a|b|c` = `Disjunction{ left: Disjunction{left:a,right:b}, right:c }`。`left`/`right` は空 alternative で `null` になり得る。
  - 単純アンカー: `{ type:'Assertion', kind:'^'|'$'|'\\b'|'\\B', loc }`（inner 無し）。
  - 先読み/後読み: `{ type:'Assertion', kind:'Lookahead'|'Lookbehind', negative?:true, assertion:<inner Node>, loc }`。inner は `node.assertion`。`negative:true` が `(?!`/`(?<!`。
- **既存描画（`RegexRailroad.tsx`）**: `renderNode(node,x,y,key)` の switch（terminal/fallback/sequence/group）。rail は `y+node.connectY` を通る。定数は `railroad-layout` から import。
- **色 / §7.1**: `@layer components` に `rr-*` を追加し CSS 変数で着色。手書き class に variant prefix を付けない。
- **テスト**: `getByRole`/`getByText`/`getByLabel`。E2E は `withProductionCsp`。`npx vitest run <path>` で個別実行。
- **動作確認用ポート**: dev は 4321（`npm run pretest:e2e` で kill 後に使用）。4322 は使わない。

---

## File Structure

| ファイル                                                                            | 変更                                                                                                          |
| :---------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| `src/utils/regex-visualizer/railroad-layout.ts`                                     | `RailKind` に `'choice'`/`'assertion'` 追加、定数 `V_GAP`/`CHOICE_LEAD`、`measureChoice` / `measureAssertion` |
| `src/utils/regex-visualizer/railroad.ts`                                            | `flattenDisjunction` / `lookaroundTitle`、`Disjunction`・`Assertion` の build case                            |
| `src/components/tools/RegexRailroad.tsx`                                            | `renderNode` に `choice`（split/merge path）・`assertion`（pill）case、`CHOICE_LEAD` import                   |
| `src/styles/global.css`                                                             | `.rr-assertion`                                                                                               |
| `__tests__/railroad-layout.test.ts` / `railroad.test.ts` / `RegexRailroad.test.tsx` | 単体・コンポーネント                                                                                          |
| `tests/e2e/regex-visualizer.spec.ts`                                                | 選択肢の E2E                                                                                                  |
| `SPEC.md` / `docs/decisions.md`                                                     | ドキュメント                                                                                                  |

---

## Task 1: railroad-layout.ts に choice / assertion measure を追加

**Files:**

- Modify: `src/utils/regex-visualizer/railroad-layout.ts`
- Test: `src/utils/regex-visualizer/__tests__/railroad-layout.test.ts`

- [ ] **Step 1: 失敗するテストを追記**

```ts
import { measureChoice, measureAssertion, V_GAP, CHOICE_LEAD } from '../railroad-layout';

describe('measureChoice', () => {
  it('分岐の最大幅 + lead*2 を幅とし、高さは分岐高さ合計 + V_GAP', () => {
    const a = measureTerminal('a', undefined);
    const bb = measureTerminal('bbbb', undefined);
    const c = measureChoice([a, bb], undefined);
    expect(c.kind).toBe('choice');
    expect(c.width).toBe(bb.width + CHOICE_LEAD * 2);
    expect(c.height).toBe(a.height + bb.height + V_GAP);
    expect(c.connectY).toBe(a.connectY); // 先頭分岐を本線に乗せる
    expect(c.children).toHaveLength(2);
  });

  it('分岐が 1 つなら分岐表現せずその子をそのまま返す', () => {
    const a = measureTerminal('a', undefined);
    expect(measureChoice([a], undefined)).toBe(a);
  });

  it('分岐が空なら fallback', () => {
    expect(measureChoice([], undefined).kind).toBe('fallback');
  });
});

describe('measureAssertion', () => {
  it('ラベル付きの assertion ノードを返す', () => {
    const node = measureAssertion('^', { start: 0, end: 1 });
    expect(node.kind).toBe('assertion');
    expect(node.label).toBe('^');
    expect(node.connectY).toBe(node.height / 2);
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/railroad-layout.test.ts`
Expected: FAIL（`measureChoice` / `measureAssertion` 未定義）

- [ ] **Step 3: railroad-layout.ts を変更**

`RailKind` を拡張:

```ts
export type RailKind = 'terminal' | 'sequence' | 'group' | 'fallback' | 'choice' | 'assertion';
```

定数を追加（既存定数群の末尾に）:

```ts
export const V_GAP = 14; // choice の分岐間の縦間隔
export const CHOICE_LEAD = 22; // choice の split/merge 用の左右リード長
```

measure を追加（ファイル末尾）:

```ts
/**
 * 選択肢（a|b|c）。分岐を縦に積み、先頭分岐を本線（connectY）に乗せる。
 * width = 最大分岐幅 + リード*2、height = 分岐高さ合計 + 分岐間 V_GAP。
 */
export function measureChoice(branches: RailNode[], loc: Loc): RailNode {
  if (branches.length === 0) return measureFallback('（空）', loc);
  if (branches.length === 1) return branches[0];
  const maxBW = Math.max(...branches.map((b) => b.width));
  const width = maxBW + CHOICE_LEAD * 2;
  const height = branches.reduce((s, b) => s + b.height, 0) + V_GAP * (branches.length - 1);
  return { kind: 'choice', width, height, connectY: branches[0].connectY, children: branches, loc };
}

/** アサーション（^ $ \b \B 等のアンカー）。ゼロ幅マーカーをラベル付き pill で示す。 */
export function measureAssertion(label: string, loc: Loc): RailNode {
  const width = Math.max(label.length * CHAR_W + BOX_PAD_X * 2, MIN_BOX_W);
  return { kind: 'assertion', width, height: BOX_H, connectY: BOX_H / 2, label, children: [], loc };
}
```

- [ ] **Step 4: 実行して PASS を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/railroad-layout.test.ts`
Expected: 全 PASS

- [ ] **Step 5: 型チェック & Commit**

```bash
node_modules/.bin/astro check
git add src/utils/regex-visualizer/railroad-layout.ts src/utils/regex-visualizer/__tests__/railroad-layout.test.ts
git commit -m "feat: 鉄道図レイアウトに choice / assertion の measure を追加"
```

## Task 2: railroad.ts に Disjunction / Assertion の build を追加

**Files:**

- Modify: `src/utils/regex-visualizer/railroad.ts`
- Test: `src/utils/regex-visualizer/__tests__/railroad.test.ts`

- [ ] **Step 1: 失敗するテストを追記**

```ts
describe('buildRailroad（選択肢・アサーション）', () => {
  it('a|b|c を平坦化して 3 分岐の choice にする', () => {
    const root = buildRailroad('a|b|c', '');
    expect(root.kind).toBe('choice');
    expect(root.children.map((c) => c.label)).toEqual(['a', 'b', 'c']);
  });

  it('^ $ は assertion ノードになる', () => {
    const root = buildRailroad('^a$', ''); // Alternative[^, a, $]
    expect(root.kind).toBe('sequence');
    expect(root.children[0].kind).toBe('assertion');
    expect(root.children[0].label).toBe('^');
    expect(root.children[2].kind).toBe('assertion');
    expect(root.children[2].label).toBe('$');
  });

  it('\\b は assertion ノードになる', () => {
    const root = buildRailroad('\\bx', '');
    expect(root.children[0].kind).toBe('assertion');
    expect(root.children[0].label).toBe('\\b');
  });

  it('先読み (?=foo) は group としてタイトル (?=) で内部式を内包', () => {
    const root = buildRailroad('(?=foo)', '');
    expect(root.kind).toBe('group');
    expect(root.title).toBe('(?=)');
    expect(root.children[0].kind).toBe('sequence'); // foo
  });

  it('否定後読み (?<!bar) は group タイトル (?<!)', () => {
    const root = buildRailroad('(?<!bar)', '');
    expect(root.kind).toBe('group');
    expect(root.title).toBe('(?<!)');
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/railroad.test.ts`
Expected: 新規 FAIL（Disjunction/Assertion がまだ fallback）

- [ ] **Step 3: railroad.ts を変更**

import に `measureChoice` / `measureAssertion` を追加:

```ts
import {
  measureTerminal,
  measureSequence,
  measureGroup,
  measureFallback,
  measureChoice,
  measureAssertion,
  type RailNode,
} from './railroad-layout';
```

ヘルパーを追加（`groupTitle` の近くに）:

```ts
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
```

`build` の switch に case を追加（`default` の前）:

```ts
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
```

- [ ] **Step 4: 実行して PASS を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/railroad.test.ts`
Expected: 全 PASS

- [ ] **Step 5: 型チェック & Commit**

```bash
node_modules/.bin/astro check
git add src/utils/regex-visualizer/railroad.ts src/utils/regex-visualizer/__tests__/railroad.test.ts
git commit -m "feat: 鉄道図で選択肢（Disjunction）とアサーションを本実装"
```

## Task 3: RegexRailroad.tsx に choice / assertion 描画を追加

**Files:**

- Modify: `src/components/tools/RegexRailroad.tsx`
- Modify: `src/styles/global.css`
- Test: `src/components/tools/__tests__/RegexRailroad.test.tsx`

- [ ] **Step 1: 失敗するテストを追記**

```ts
import { measureChoice, measureAssertion } from '@/utils/regex-visualizer/railroad-layout';

it('choice は各分岐の rect と分岐パスを描画する', () => {
  const node = measureChoice(
    [measureTerminal('a', undefined), measureTerminal('b', undefined)],
    undefined
  );
  const { container } = render(<RegexRailroad node={node} />);
  expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(2);
  expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2); // split/merge
});

it('assertion は pill（rect）+ ラベルを描画する', () => {
  const node = measureAssertion('^', { start: 0, end: 1 });
  const { container } = render(<RegexRailroad node={node} />);
  expect(container.querySelector('rect')).toBeTruthy();
  expect(container.textContent).toContain('^');
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/components/tools/__tests__/RegexRailroad.test.tsx`
Expected: 新規 FAIL（choice/assertion 未描画）

- [ ] **Step 3: RegexRailroad.tsx を変更**

import 行を変更（`CHOICE_LEAD` と `V_GAP` を追加。`V_GAP` は measure と座標を一致させるため render 側でも同じ値を使う）:

```tsx
import {
  H_GAP,
  GROUP_PAD_X,
  GROUP_PAD_TOP,
  CHOICE_LEAD,
  V_GAP,
} from '@/utils/regex-visualizer/railroad-layout';
```

`renderNode` の switch に case を追加（`group` case の後）:

```tsx
    case 'choice': {
      const lead = CHOICE_LEAD;
      const innerLeft = x + lead;
      const maxBW = Math.max(...node.children.map((c) => c.width));
      const innerRight = innerLeft + maxBW;
      const entryY = y + node.connectY; // 先頭分岐の rail（本線）
      const exitX = x + node.width;
      const els: React.ReactNode[] = [];
      let by = y;
      node.children.forEach((branch, i) => {
        const bRailY = by + branch.connectY;
        els.push(renderNode(branch, innerLeft, by, `${key}-b${i}`));
        // 入口: (x,entryY) → (innerLeft,bRailY) を S 字 bezier で接続（i=0 は直線になる）
        els.push(
          <path
            key={`ei${i}`}
            d={`M ${x} ${entryY} C ${x + lead / 2} ${entryY}, ${innerLeft - lead / 2} ${bRailY}, ${innerLeft} ${bRailY}`}
            className="rr-rail"
          />
        );
        // 分岐が最大幅より狭ければ出口まで水平延長
        if (branch.width < maxBW) {
          els.push(
            <line
              key={`ext${i}`}
              x1={innerLeft + branch.width}
              y1={bRailY}
              x2={innerRight}
              y2={bRailY}
              className="rr-rail"
            />
          );
        }
        // 出口: (innerRight,bRailY) → (exitX,entryY)
        els.push(
          <path
            key={`eo${i}`}
            d={`M ${innerRight} ${bRailY} C ${innerRight + lead / 2} ${bRailY}, ${exitX - lead / 2} ${entryY}, ${exitX} ${entryY}`}
            className="rr-rail"
          />
        );
        by += branch.height + V_GAP;
      });
      return <g key={key}>{els}</g>;
    }
    case 'assertion':
      return (
        <g key={key}>
          <rect
            x={x}
            y={y}
            width={node.width}
            height={node.height}
            rx={node.height / 2}
            className="rr-assertion"
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
```

- [ ] **Step 4: `.rr-assertion` を global.css の `@layer components` に追加**

`.rr-box-fallback` 等の近くに（CSS 変数名は実定義に合わせる）:

```css
.rr-assertion {
  fill: var(--color-bg-subtle);
  stroke: var(--color-border-input);
  stroke-width: 1;
}
```

- [ ] **Step 5: 実行して PASS + ビルド確認**

Run: `npx vitest run src/components/tools/__tests__/RegexRailroad.test.tsx && node_modules/.bin/astro check && npm run build`
Expected: テスト PASS、型 0、build 成功。`grep -r "rr-assertion" dist/_astro/*.css` でルール生成確認。

- [ ] **Step 6: Commit**

```bash
git add src/components/tools/RegexRailroad.tsx src/styles/global.css src/components/tools/__tests__/RegexRailroad.test.tsx
git commit -m "feat: 鉄道図に選択肢の分岐描画とアサーション pill を追加"
```

## Task 4: dev 目視 + E2E（本番 CSP 下）

**Files:** Modify `tests/e2e/regex-visualizer.spec.ts`

- [ ] **Step 1: dev で目視**

Run: `npm run pretest:e2e && npm run dev`（4321）→ `http://localhost:4321/tools/regex-visualizer` で鉄道図タブを開き、`a|b|c`（3 分岐が縦に積まれ split/merge で接続）、`^a$`（^ と $ が pill）、`(?=foo)`（(?=) タイトルのコンテナ）を確認。確認後 `npm run pretest:e2e` で dev を停止。別ターミナルで `node_modules/.bin/astro check`（0）。

- [ ] **Step 2: E2E を追記**

```ts
test('選択肢 a|b|c が鉄道図で分岐表示される', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
    await page.getByLabel('正規表現').fill('a|b|c');
    await expect(page.getByText('選択肢 (|)')).toBeVisible(); // 構造ツリー側で解析完了を待つ
    await page.getByRole('button', { name: '鉄道図' }).click();
    await expect(page.getByRole('img', { name: '正規表現の鉄道図' })).toBeVisible();
  });
});
```

> `選択肢 (|)` は `RegexAstTree` が Disjunction に付けるラベル（`parse.ts` の `labelFor`）。実際の文字列が異なる場合は `parse.ts` を確認して合わせる。

- [ ] **Step 3: E2E 実行**

Run: `npm run test:e2e -- regex-visualizer`
Expected: 全 PASS（CSP 違反 0）

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/regex-visualizer.spec.ts
git commit -m "test: 鉄道図の選択肢分岐 E2E を追加"
```

## Task 5: ドキュメント更新

**Files:** Modify `SPEC.md` / `docs/decisions.md`

- [ ] **Step 1: decisions.md の [089]（鉄道図）に PR2b 完了を追記** — 選択肢（二分木平坦化 + 縦分岐 split/merge）・アサーション（単純アンカー pill / 先読み後読みは group 風コンテナ）を実装。SPEC.md 9 章チェックリストがあれば更新。

- [ ] **Step 2: 整形 & Commit**

```bash
npm run format
git add SPEC.md docs/decisions.md
git commit -m "docs: 鉄道図 PR2b（選択肢・アサーション）の追加を記録"
```

## Task 6: 最終検証（push 前必須）

- [ ] **Step 1: unit 全実行**

Run: `npm run test 2>&1 | grep -E "Test Files|Tests "`
Expected: fail 0。

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: 0 errors。

- [ ] **Step 3: E2E**

Run: `npm run test:e2e -- regex-visualizer`
Expected: 全 PASS。

- [ ] **Step 4: UI 目視（PC 1280x800 / スマホ 390x844）**

Playwright MCP で `a|b|c`（分岐）・`^a$`（アンカー）・`(a|bb|ccc)`（グループ内分岐・幅違い）を鉄道図タブで撮影。分岐の split/merge・pill・横スクロールを確認。

- [ ] **Step 5: VRT baseline 要否判断**

デフォルトタブ（構造ツリー・空入力）の初期描画は不変のため baseline 再生成は原則不要。

> push / PR は `--base develop`。

---

## Self-Review（計画 vs スペック）

- **PR2b スコープ（選択肢＋アサーション）**: choice = Task 1/2/3 ✅ ／ assertion（単純 + 先読み後読み）= Task 2/3 ✅
- **Disjunction 平坦化（二分木→分岐リスト）**: `flattenDisjunction`（Task 2）✅。空 alternative の null は空 sequence fallback ✅
- **先読み/後読みは内部式を内包**: group 風コンテナ再利用（measureGroup）+ `lookaroundTitle`（Task 2）✅
- **SSR 安全境界不変**: railroad-layout は pure のまま（Task 1 は measure 追加のみ）、RegexRailroad は railroad-layout のみ import（Task 3）✅。RegexVisualizer 変更なし ✅
- **縦分岐の本線**: choice.connectY = 先頭分岐（measure）/ entryY 経由で接続（render）。measure と render で同じ `V_GAP` を共有し座標一致 ✅
- **テスト**: layout（choice/assertion 寸法）/ build（平坦化・アンカー・先読み後読み）/ renderer（path/pill）/ E2E 本番 CSP ✅
- **placeholder スキャン**: TODO/TBD 無し。各コード step に実コードあり ✅
- **型整合**: `RailKind` 拡張（choice/assertion）を measure/build/render で一貫使用。定数 `V_GAP`/`CHOICE_LEAD` を railroad-layout から render が import し measure と一致 ✅
