# 正規表現 鉄道図 PR2c 実装計画（量指定子＋後方参照＋hotspot）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 鉄道図に量指定子（`+ * ? {n,m}` のループバック/スキップ弧）と後方参照を描画し、ReDoS hotspot ハイライトを追加して鉄道図シリーズ（PR2）を完了する。

**Architecture:** PR2a/2b の構成を踏襲。pure `railroad-layout.ts` に `repetition`/`backreference` の measure を追加、`railroad.ts` に build を追加、`RegexRailroad.tsx` に弧の描画と hotspot ハイライトを追加。hotspot は AST ツリーと同じく「最深の重なりノードのみ」強調。SSR 安全境界は不変。

**Tech Stack:** Astro + React (TSX) / 既存 `regexp-tree` / SVG / Vitest / Playwright

**設計スペック:** `docs/superpowers/specs/2026-05-27-regex-railroad-design.md` 4 章 PR2c

**範囲:** PR2c（鉄道図最終）。

---

## 前提知識（実装者向け）

- **SSR 安全境界（厳守）**: `railroad-layout.ts` は import ゼロの pure。`RegexRailroad.tsx` は `railroad-layout` からのみ import。`buildRailroad` は `RegexVisualizer` の動的 import `mod` 経由のみ。
- **既存 measure（railroad-layout.ts）**: terminal/fallback/sequence/group/choice/assertion。定数 `CHAR_W=8.5` `BOX_PAD_X=10` `BOX_H=34` `MIN_BOX_W=26` `H_GAP=22` `GROUP_PAD_*` `V_GAP=14` `CHOICE_LEAD=22`。
- **既存 build（railroad.ts）**: Char/CharacterClass→terminal、Alternative→sequence、Group→group、Disjunction→choice、Assertion→assertion/group(lookaround)、その他→fallback。ヘルパー `locOf`（offset-1）/`sliceLabel`。
- **既存描画（RegexRailroad.tsx）**: `renderNode(node,x,y,key)` の switch。`hotspot` prop は未対応（本 PR で追加）。
- **regexp-tree 形状（実機確認済み）**:
  - `Repetition`: `{ type:'Repetition', expression:<inner>, quantifier:{ kind:'+'|'*'|'?'|'Range', from?, to?, greedy:boolean } }`。`Range`: `from`（必須）、`to`（`{n,}` は undefined、`{n}` は `to===from`）。lazy は `greedy:false`。
  - `Backreference`: `{ type:'Backreference', kind:'number'|'name', number, reference }`。source slice（`\1` / `\k<n>`）がラベルに使える。
- **hotspot**: `RedosResult.hotspot: {start,end}[]`（pattern 基準オフセット、PR1）。各 RailNode の `loc`（offset-1 補正済み）と突き合わせ、AST ツリーの `RegexAstTree` と同じく「自身が重なり かつ どの子も重ならない＝最深」ノードのみ強調。
- **色 / §7.1**: `@layer components` に `rr-*` を追加し CSS 変数で着色。手書き class に variant prefix 不可。hotspot 強調は警告色（`--color-warning` / `--color-warning-bg`、AST ツリーの `.regex-ast-node-hot` と同系）。
- **テスト**: `getByRole`/`getByText`/`getByLabel`。E2E は `withProductionCsp`。dev は 4321（4322 不使用）。**Playwright 目視前に SW unregister + caches.delete + localStorage.clear**（caches.delete だけだと SW が旧 JS を配信し stale 描画になる）。

---

## File Structure

| ファイル                                                                            | 変更                                                                                                                |
| :---------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| `src/utils/regex-visualizer/railroad-layout.ts`                                     | `RailKind` に `'repetition'`/`'backreference'`、定数 `REP_LEAD`/`ARC_H`、`measureRepetition`/`measureBackreference` |
| `src/utils/regex-visualizer/railroad.ts`                                            | `quantifierLabel`/`quantifierFlags`、`Repetition`・`Backreference` の build case                                    |
| `src/components/tools/RegexRailroad.tsx`                                            | `renderNode` に `repetition`（弧）・`backreference` case、`hotspot` prop + 最深ノード強調を全 case に適用           |
| `src/components/tools/RegexVisualizer.tsx`                                          | `RegexRailroad` に `hotspot={redos?.hotspot}` を渡す                                                                |
| `src/styles/global.css`                                                             | `.rr-...-hot` / repetition ラベル / backreference                                                                   |
| `__tests__/railroad-layout.test.ts` / `railroad.test.ts` / `RegexRailroad.test.tsx` | 単体・コンポーネント                                                                                                |
| `tests/e2e/regex-visualizer.spec.ts`                                                | 量指定子・hotspot の E2E                                                                                            |
| `docs/decisions.md`                                                                 | PR2c 完了記録                                                                                                       |

---

## Task 1: railroad-layout.ts に repetition / backreference measure を追加

**Files:**

- Modify: `src/utils/regex-visualizer/railroad-layout.ts`
- Test: `src/utils/regex-visualizer/__tests__/railroad-layout.test.ts`

- [ ] **Step 1: 失敗するテストを追記**

```ts
import { measureRepetition, measureBackreference, REP_LEAD, ARC_H } from '../railroad-layout';

describe('measureRepetition', () => {
  it('loop ありで下に ARC_H 分高くなり connectY は inner 基準', () => {
    const inner = measureTerminal('a', undefined);
    const rep = measureRepetition(inner, { skip: false, loop: true, label: '+' }, undefined);
    expect(rep.kind).toBe('repetition');
    expect(rep.width).toBe(inner.width + REP_LEAD * 2);
    expect(rep.height).toBe(inner.height + ARC_H); // loop 下のみ
    expect(rep.connectY).toBe(inner.connectY); // skip 無 → 上余白なし
    expect(rep.children[0]).toBe(inner);
    expect(rep.label).toBe('+');
  });

  it('skip ありで上に ARC_H 分の余白ができ connectY が下がる', () => {
    const inner = measureTerminal('a', undefined);
    const rep = measureRepetition(inner, { skip: true, loop: true, label: '*' }, undefined);
    expect(rep.height).toBe(inner.height + ARC_H * 2); // skip 上 + loop 下
    expect(rep.connectY).toBe(ARC_H + inner.connectY);
  });
});

describe('measureBackreference', () => {
  it('ラベル付き backreference ノードを返す', () => {
    const n = measureBackreference('\\1', { start: 3, end: 5 });
    expect(n.kind).toBe('backreference');
    expect(n.label).toBe('\\1');
    expect(n.connectY).toBe(n.height / 2);
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/railroad-layout.test.ts`
Expected: FAIL（未定義）

- [ ] **Step 3: railroad-layout.ts を変更**

`RailKind` を拡張:

```ts
export type RailKind =
  | 'terminal'
  | 'sequence'
  | 'group'
  | 'fallback'
  | 'choice'
  | 'assertion'
  | 'repetition'
  | 'backreference';
```

`RailNode` に量指定子フラグ用の任意フィールドを追加（既存 interface に追記）:

```ts
  /** repetition のときの弧の有無（skip=スキップ弧/上, loop=ループ弧/下） */
  skip?: boolean;
  loop?: boolean;
```

定数を追加:

```ts
export const REP_LEAD = 18; // repetition の弧が左右へ膨らむリード
export const ARC_H = 16; // skip/loop 弧の高さ
```

measure を追加（ファイル末尾）:

```ts
/**
 * 量指定子（+ * ? {n,m}）。inner を本線に通し、skip=上のスキップ弧 / loop=下のループ弧を付ける。
 * label は量指定子の表示（'+' '*?' '{2,5}' 等）。
 */
export function measureRepetition(
  inner: RailNode,
  opts: { skip: boolean; loop: boolean; label: string },
  loc: Loc
): RailNode {
  const top = opts.skip ? ARC_H : 0;
  const bottom = opts.loop ? ARC_H : 0;
  return {
    kind: 'repetition',
    width: inner.width + REP_LEAD * 2,
    height: inner.height + top + bottom,
    connectY: top + inner.connectY,
    label: opts.label,
    skip: opts.skip,
    loop: opts.loop,
    children: [inner],
    loc,
  };
}

/** 後方参照（\1 / \k<name>）。ラベル付きノード。 */
export function measureBackreference(label: string, loc: Loc): RailNode {
  const width = Math.max(label.length * CHAR_W + BOX_PAD_X * 2, MIN_BOX_W);
  return {
    kind: 'backreference',
    width,
    height: BOX_H,
    connectY: BOX_H / 2,
    label,
    children: [],
    loc,
  };
}
```

- [ ] **Step 4: 実行して PASS を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/railroad-layout.test.ts`
Expected: 全 PASS

- [ ] **Step 5: 型チェック & Commit**

```bash
node_modules/.bin/astro check
git add src/utils/regex-visualizer/railroad-layout.ts src/utils/regex-visualizer/__tests__/railroad-layout.test.ts
git commit -m "feat: 鉄道図レイアウトに repetition / backreference の measure を追加"
```

## Task 2: railroad.ts に Repetition / Backreference の build を追加

**Files:**

- Modify: `src/utils/regex-visualizer/railroad.ts`
- Test: `src/utils/regex-visualizer/__tests__/railroad.test.ts`

- [ ] **Step 1: 失敗するテストを追記**

```ts
describe('buildRailroad（量指定子・後方参照）', () => {
  it('a+ は loop あり skip なしの repetition', () => {
    const r = buildRailroad('a+', '');
    expect(r.kind).toBe('repetition');
    expect(r.loop).toBe(true);
    expect(r.skip).toBe(false);
    expect(r.label).toBe('+');
    expect(r.children[0].kind).toBe('terminal');
  });

  it('a* は skip も loop もある', () => {
    const r = buildRailroad('a*', '');
    expect(r.skip).toBe(true);
    expect(r.loop).toBe(true);
  });

  it('a? は skip のみ', () => {
    const r = buildRailroad('a?', '');
    expect(r.skip).toBe(true);
    expect(r.loop).toBe(false);
  });

  it('lazy a*? はラベルに ? が付く', () => {
    const r = buildRailroad('a*?', '');
    expect(r.label).toBe('*?');
  });

  it('a{2,5} は Range ラベル', () => {
    const r = buildRailroad('a{2,5}', '');
    expect(r.kind).toBe('repetition');
    expect(r.label).toBe('{2,5}');
  });

  it('後方参照 (a)\\1 の \\1 は backreference', () => {
    const r = buildRailroad('(a)\\1', '');
    expect(r.kind).toBe('sequence');
    expect(r.children[1].kind).toBe('backreference');
    expect(r.children[1].label).toBe('\\1');
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/railroad.test.ts`
Expected: 新規 FAIL（Repetition/Backreference がまだ fallback）

- [ ] **Step 3: railroad.ts を変更**

import に `measureRepetition` / `measureBackreference` を追加:

```ts
import {
  measureTerminal,
  measureSequence,
  measureGroup,
  measureFallback,
  measureChoice,
  measureAssertion,
  measureRepetition,
  measureBackreference,
  type RailNode,
} from './railroad-layout';
```

ヘルパーを追加:

```ts
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
```

`build` の switch に case を追加（`default` の前）:

```ts
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
```

- [ ] **Step 4: 実行して PASS を確認**

Run: `npx vitest run src/utils/regex-visualizer/__tests__/railroad.test.ts`
Expected: 全 PASS

- [ ] **Step 5: 型チェック & Commit**

```bash
node_modules/.bin/astro check
git add src/utils/regex-visualizer/railroad.ts src/utils/regex-visualizer/__tests__/railroad.test.ts
git commit -m "feat: 鉄道図で量指定子（ループバック）と後方参照を本実装"
```

## Task 3: RegexRailroad.tsx に repetition / backreference 描画 + hotspot ハイライト

**Files:**

- Modify: `src/components/tools/RegexRailroad.tsx`
- Modify: `src/styles/global.css`
- Test: `src/components/tools/__tests__/RegexRailroad.test.tsx`

- [ ] **Step 1: 失敗するテストを追記**

```ts
import { measureRepetition, measureBackreference } from '@/utils/regex-visualizer/railroad-layout';

it('repetition は inner の rect と弧 path を描画する', () => {
  const inner = measureTerminal('a', { start: 0, end: 1 });
  const node = measureRepetition(inner, { skip: true, loop: true, label: '*' }, { start: 0, end: 2 });
  const { container } = render(<RegexRailroad node={node} />);
  expect(container.querySelector('rect')).toBeTruthy();
  expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2); // skip + loop
  expect(container.textContent).toContain('*');
});

it('backreference は rect + ラベルを描画する', () => {
  const node = measureBackreference('\\1', { start: 0, end: 2 });
  const { container } = render(<RegexRailroad node={node} />);
  expect(container.textContent).toContain('\\1');
});

it('hotspot に重なる最深ノードに hot class が付く', () => {
  const inner = measureTerminal('a', { start: 1, end: 2 });
  const node = measureRepetition(inner, { skip: false, loop: true, label: '+' }, { start: 0, end: 3 });
  // hotspot {1,2} は inner(terminal) に重なる。inner が最深なので inner の rect が hot。
  const { container } = render(<RegexRailroad node={node} hotspot={[{ start: 1, end: 2 }]} />);
  expect(container.querySelector('.rr-box-hot')).toBeTruthy();
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/components/tools/__tests__/RegexRailroad.test.tsx`
Expected: 新規 FAIL

- [ ] **Step 3: RegexRailroad.tsx を変更**

import に `REP_LEAD` / `ARC_H` を追加:

```tsx
import {
  H_GAP,
  GROUP_PAD_X,
  GROUP_PAD_TOP,
  CHOICE_LEAD,
  V_GAP,
  REP_LEAD,
  ARC_H,
} from '@/utils/regex-visualizer/railroad-layout';
```

hotspot 判定ヘルパーを追加（ファイル上部、`renderNode` の前）:

```tsx
type Hotspot = { start: number; end: number }[];

function overlaps(node: RailNode, hotspot?: Hotspot): boolean {
  if (!hotspot || !node.loc) return false;
  return hotspot.some((h) => node.loc!.start < h.end && h.start < node.loc!.end);
}

/** 自身が重なり かつ どの子も重ならない＝最深の重なりノード（AST ツリーと同じ規則）。 */
function isHot(node: RailNode, hotspot?: Hotspot): boolean {
  return overlaps(node, hotspot) && !node.children.some((c) => overlaps(c, hotspot));
}
```

`renderNode` のシグネチャに `hotspot` を追加し、全再帰呼び出しに伝播する。`terminal`/`fallback`/`backreference`/`assertion` の `rect` には hot 時に `rr-box-hot` を併記する。**`renderNode(node, x, y, key)` を `renderNode(node, x, y, key, hotspot)` に変更**し、内部の各 `renderNode(child, ...)` 呼び出しへ `hotspot` を渡す。

新しい `renderNode` 全体（既存 case を hotspot 対応に置換 + repetition/backreference を追加）:

```tsx
function renderNode(
  node: RailNode,
  x: number,
  y: number,
  key: string,
  hotspot?: Hotspot
): React.ReactNode {
  const hot = isHot(node, hotspot);
  const boxClass = (base: string) => (hot ? `${base} rr-box-hot` : base);
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
            className={boxClass(node.kind === 'fallback' ? 'rr-box rr-box-fallback' : 'rr-box')}
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
    case 'backreference':
      return (
        <g key={key}>
          <rect
            x={x}
            y={y}
            width={node.width}
            height={node.height}
            rx={6}
            className={boxClass('rr-box rr-backref')}
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
    case 'assertion':
      return (
        <g key={key}>
          <rect
            x={x}
            y={y}
            width={node.width}
            height={node.height}
            rx={node.height / 2}
            className={boxClass('rr-assertion')}
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
        els.push(renderNode(child, cx, cy, `${key}-${i}`, hotspot));
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
          {renderNode(inner, innerX, innerY, `${key}-g`, hotspot)}
        </g>
      );
    }
    case 'choice': {
      const lead = CHOICE_LEAD;
      const innerLeft = x + lead;
      const maxBW = Math.max(...node.children.map((c) => c.width));
      const innerRight = innerLeft + maxBW;
      const entryY = y + node.connectY;
      const exitX = x + node.width;
      const els: React.ReactNode[] = [];
      let by = y;
      node.children.forEach((branch, i) => {
        const bRailY = by + branch.connectY;
        els.push(renderNode(branch, innerLeft, by, `${key}-b${i}`, hotspot));
        els.push(
          <path
            key={`ei${i}`}
            d={`M ${x} ${entryY} C ${x + lead / 2} ${entryY}, ${innerLeft - lead / 2} ${bRailY}, ${innerLeft} ${bRailY}`}
            className="rr-rail"
          />
        );
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
    case 'repetition': {
      const inner = node.children[0];
      const innerX = x + REP_LEAD;
      const innerY = node.skip ? y + ARC_H : y;
      const railY = y + node.connectY; // = innerY + inner.connectY
      const exitX = x + node.width;
      const innerRight = innerX + inner.width;
      const els: React.ReactNode[] = [];
      // 本線リード（左右）
      els.push(<line key="ll" x1={x} y1={railY} x2={innerX} y2={railY} className="rr-rail" />);
      els.push(
        <line key="lr" x1={innerRight} y1={railY} x2={exitX} y2={railY} className="rr-rail" />
      );
      els.push(renderNode(inner, innerX, innerY, `${key}-r`, hotspot));
      // ループ弧（下）: 出口→入口へ戻る
      if (node.loop) {
        els.push(
          <path
            key="loop"
            d={`M ${innerRight} ${railY} C ${innerRight + REP_LEAD} ${railY + ARC_H}, ${innerX - REP_LEAD} ${railY + ARC_H}, ${innerX} ${railY}`}
            className="rr-rail rr-arrow"
          />
        );
      }
      // スキップ弧（上）: 入口→出口をバイパス
      if (node.skip) {
        els.push(
          <path
            key="skip"
            d={`M ${x} ${railY} C ${innerX} ${railY - ARC_H}, ${innerRight} ${railY - ARC_H}, ${exitX} ${railY}`}
            className="rr-rail"
          />
        );
      }
      // 量指定子ラベル
      els.push(
        <text
          key="ql"
          x={x + node.width / 2}
          y={railY + inner.height / 2 + ARC_H - 2}
          textAnchor="middle"
          className="rr-quant"
        >
          {node.label}
        </text>
      );
      return <g key={key}>{els}</g>;
    }
  }
}
```

`RegexRailroad` の Props と svg 呼び出しを hotspot 対応に変更:

```tsx
interface Props {
  node: RailNode;
  hotspot?: { start: number; end: number }[];
}

export function RegexRailroad({ node, hotspot }: Props) {
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
        {renderNode(node, MARKER_LEAD, 0, 'root', hotspot)}
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

- [ ] **Step 4: CSS を global.css の `@layer components` に追加/確認**

`.rr-box-hot` / `.rr-backref` / `.rr-quant` / `.rr-arrow` を追加（CSS 変数名は実定義に合わせる。hotspot は AST ツリーの `.regex-ast-node-hot` と同系の警告色）:

```css
.rr-box-hot {
  fill: var(--color-warning-bg);
  stroke: var(--color-warning);
  stroke-width: 1.5;
}
.rr-backref {
  stroke-dasharray: 3 2;
}
.rr-quant {
  fill: var(--color-muted);
  font-size: 11px;
  font-family: var(--font-mono, monospace);
}
.rr-arrow {
  marker-end: none;
}
```

> `.rr-box-hot` は `.rr-box` 等の後に置き、fill/stroke を上書きできる順序にすること。

- [ ] **Step 5: 実行して PASS + ビルド確認**

Run: `npx vitest run src/components/tools/__tests__/RegexRailroad.test.tsx && node_modules/.bin/astro check && npm run build`
Expected: テスト PASS、型 0、build 成功。`grep -r "rr-box-hot" dist/_astro/*.css` で確認。

- [ ] **Step 6: Commit**

```bash
git add src/components/tools/RegexRailroad.tsx src/styles/global.css src/components/tools/__tests__/RegexRailroad.test.tsx
git commit -m "feat: 鉄道図に量指定子の弧・後方参照・hotspot ハイライトを追加"
```

## Task 4: RegexVisualizer から hotspot を渡す

**Files:**

- Modify: `src/components/tools/RegexVisualizer.tsx`
- Modify: `src/components/tools/__tests__/RegexVisualizer.test.tsx`

- [ ] **Step 1: 失敗するテストを追記**

```tsx
it('鉄道図タブで脆弱パターンの hotspot が強調される', async () => {
  render(<RegexVisualizer />);
  setPattern('(a+)+$');
  await screen.findByText(/脆弱/, undefined, FIND);
  fireEvent.click(screen.getByRole('button', { name: '鉄道図' }));
  const svg = await screen.findByRole('img', { name: '正規表現の鉄道図' }, FIND);
  expect(svg.querySelector('.rr-box-hot')).toBeTruthy();
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `npx vitest run src/components/tools/__tests__/RegexVisualizer.test.tsx`
Expected: 新規 FAIL（hotspot 未伝播）

- [ ] **Step 3: RegexVisualizer.tsx の `RegexRailroad` 呼び出しに hotspot を渡す**

`view === 'railroad'` の分岐の `<RegexRailroad node={rail} />` を次に変更:

```tsx
<RegexRailroad node={rail} hotspot={redos?.hotspot} />
```

- [ ] **Step 4: 実行して PASS を確認**

Run: `npx vitest run src/components/tools/__tests__/RegexVisualizer.test.tsx`
Expected: 全 PASS

- [ ] **Step 5: 型チェック & Commit**

```bash
node_modules/.bin/astro check
git add src/components/tools/RegexVisualizer.tsx src/components/tools/__tests__/RegexVisualizer.test.tsx
git commit -m "feat: 鉄道図タブに ReDoS hotspot を伝播"
```

## Task 5: E2E（本番 CSP 下）

**Files:** Modify `tests/e2e/regex-visualizer.spec.ts`

- [ ] **Step 1: テストを追記**

```ts
test('量指定子 a+ が鉄道図で表示される', async ({ browser }) => {
  await withProductionCsp(browser, '/tools/regex-visualizer', async (page) => {
    await page.getByLabel('正規表現').fill('a+b');
    await expect(page.getByText(/1 回以上の繰り返し/)).toBeVisible(); // 構造ツリーで解析完了待ち
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
git commit -m "test: 鉄道図の量指定子 E2E を追加"
```

## Task 6: ドキュメント更新

**Files:** Modify `docs/decisions.md`

- [ ] **Step 1: decisions.md [089] に PR2c 完了を追記** — 量指定子（skip/loop 弧）・後方参照・hotspot ハイライトを実装。鉄道図シリーズ（PR2a/2b/2c）完了。`⚠️ PR2b` 行を `✅ PR2c 完了（鉄道図シリーズ完了）` に更新。

- [ ] **Step 2: 整形 & Commit**

```bash
npm run format
git add docs/decisions.md
git commit -m "docs: 鉄道図 PR2c（量指定子・後方参照・hotspot）完了を記録"
```

## Task 7: 最終検証（push 前必須）

- [ ] **Step 1: unit 全実行** — Run: `npm run test 2>&1 | grep -E "Test Files|Tests "` / Expected: fail 0。
- [ ] **Step 2: 型チェック** — Run: `node_modules/.bin/astro check` / Expected: 0 errors。
- [ ] **Step 3: E2E** — Run: `npm run test:e2e -- regex-visualizer` / Expected: 全 PASS。
- [ ] **Step 4: UI 目視（PC 1280x800 / スマホ 390x844）** — Playwright MCP で **SW unregister + caches.delete + localStorage.clear → リロード**してから `(a+)+$`（loop 弧 + hotspot 強調）、`a*?`（skip+loop+lazy ラベル）、`(a)\1`（後方参照）を鉄道図タブで撮影。弧・ラベル・hotspot 警告色・横スクロールを確認。
- [ ] **Step 5: VRT** — デフォルトタブ（構造ツリー・空入力）の初期描画は不変のため baseline 再生成不要。

> push / PR は `--base develop`。

---

## Self-Review（計画 vs スペック）

- **PR2c スコープ（量指定子＋後方参照＋hotspot）**: repetition = Task 1/2/3 ✅ ／ backreference = Task 1/2/3 ✅ ／ hotspot = Task 3/4 ✅
- **量指定子 skip/loop 判定**: `quantifierFlags`（? = skip / \* = skip+loop / + = loop / Range = from===0 で skip・to>1 or 無限で loop）（Task 2）✅。lazy は label に `?`（`quantifierLabel`）✅
- **hotspot は最深ノードのみ**: `isHot = overlaps && !children.some(overlaps)`（AST ツリーと同規則・Task 3）✅。renderNode 全 case に hotspot 伝播 ✅
- **SSR 安全境界不変**: railroad-layout は pure（measure 追加のみ）/ RegexRailroad は layout のみ import / buildRailroad は動的 import 経由 ✅
- **座標整合**: repetition の connectY = top(skip?ARC_H:0)+inner.connectY を measure と render で共有。本線リード・弧の座標が railY=y+connectY で一致 ✅
- **テスト**: layout（repetition skip/loop・backreference）/ build（+ \* ? lazy Range・後方参照）/ renderer（弧 path・backref・hot class）/ component（hotspot 伝播）/ E2E ✅
- **placeholder スキャン**: TODO/TBD 無し・各コード step に実コードあり ✅
- **型整合**: `RailKind` 拡張（repetition/backreference）・`RailNode` の skip/loop を measure/build/render で一貫使用。定数 REP_LEAD/ARC_H を railroad-layout から render が import し measure と一致 ✅
