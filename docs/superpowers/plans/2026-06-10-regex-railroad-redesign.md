# 鉄道図リデザイン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** regex-visualizer の鉄道図ビューに、ノード種別の色分け（リテラル/文字クラス・メタ文字/アンカー）・日本語量指定子ラベル・矢印付きループ弧・凡例を導入する。

**Architecture:** pure レイアウト層（`railroad-layout.ts`）に種別 `charclass` を追加し弧バンドを上下反転、AST 変換層（`railroad.ts`）で `Char`(meta)/`CharacterClass` を種別分割しラベルを日本語化、描画層（`RegexRailroad.tsx`）で種別別 class・矢印 marker・凡例を描く。色は `global.css` の `@theme` トークン + `@layer components` の `rr-*` class 経由（Tailwind primitive 直書き禁止）。

**Tech Stack:** TypeScript / React (SSR 安全な純粋 SVG) / Astro / Tailwind v4 / Vitest / Playwright。regexp-tree(CJS) は parse 層のみ。

設計 spec: `docs/superpowers/specs/2026-06-10-regex-railroad-redesign-design.md`

---

## File Structure

- `src/utils/regex-visualizer/railroad-layout.ts`（変更）: `RailKind` に `charclass`、`measureCharClass` 追加、`measureRepetition` の弧バンド反転、`measureAssertion` の円/pill 化。
- `src/utils/regex-visualizer/railroad.ts`（変更）: `build()` の `Char`/`CharacterClass` 振り分け、`quantifierLabel` 日本語化。
- `src/styles/global.css`（変更）: 紫トークン追加、`rr-charclass`/`rr-anchor` 追加、`rr-group` 薄灰塗り化、矢印 marker 用 class、凡例 class。
- `src/components/tools/RegexRailroad.tsx`（変更）: 種別別 class 描画、矢印 marker 定義、弧の上下入れ替え、ラベル位置、凡例追加。
- `src/utils/regex-visualizer/__tests__/railroad-layout.test.ts`（変更）: 弧バンド/`measureCharClass`/`measureAssertion` のテスト更新・追加。
- `src/utils/regex-visualizer/__tests__/railroad.test.ts`（変更）: ラベル日本語化・種別分割テスト追加。
- `src/components/tools/__tests__/RegexRailroad.test.tsx`（変更）: ラベル・種別 class・marker・凡例のテスト更新・追加。
- `tests/e2e/regex-visualizer.spec.ts`（変更）: 日本語量指定子ラベルの assertion 追加。
- `docs/tools.md`（変更）: 鉄道図の色分け・凡例・日本語ラベルを追記。

新バンドモデル（全 Task で前提）:

- `top = loop ? ARC_H : 0`（ループ弧を上に置く）
- `bottom = (skip ? ARC_H : 0) + LABEL_H`（スキップ弧を下、その下に常にラベル帯）
- `connectY = top + inner.connectY`
- `height = top + inner.height + bottom`

---

## Task 1: charclass 種別の追加（レイアウト + AST 振り分け）

**Files:**

- Modify: `src/utils/regex-visualizer/railroad-layout.ts`
- Modify: `src/utils/regex-visualizer/railroad.ts`
- Test: `src/utils/regex-visualizer/__tests__/railroad-layout.test.ts`, `src/utils/regex-visualizer/__tests__/railroad.test.ts`

- [ ] **Step 1: レイアウトの失敗テストを書く**

`src/utils/regex-visualizer/__tests__/railroad-layout.test.ts` の `import` に `measureCharClass` を追加（既存 import 行に足す）し、ファイル末尾の `measureBackreference` describe の後に追記:

```ts
describe('measureCharClass', () => {
  it('terminal と同じ寸法で kind だけ charclass になる', () => {
    const cc = measureCharClass('\\s', { start: 0, end: 2 });
    const t = measureTerminal('\\s', { start: 0, end: 2 });
    expect(cc.kind).toBe('charclass');
    expect(cc.width).toBe(t.width);
    expect(cc.height).toBe(t.height);
    expect(cc.connectY).toBe(t.connectY);
    expect(cc.label).toBe('\\s');
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npm run test -- railroad-layout`
Expected: FAIL（`measureCharClass` が export されていない）

- [ ] **Step 3: railroad-layout.ts に charclass を実装**

`RailKind` union（`railroad-layout.ts:4-12`）に `'charclass'` を追加:

```ts
export type RailKind =
  | 'terminal'
  | 'charclass'
  | 'sequence'
  | 'group'
  | 'fallback'
  | 'choice'
  | 'assertion'
  | 'repetition'
  | 'backreference';
```

`measureTerminal`（`railroad-layout.ts:52-55`）の直後に追加:

```ts
/** 文字クラス・メタ文字（[..] \s \d \w . 等）。寸法は terminal と同じで種別のみ異なる。 */
export function measureCharClass(label: string, loc: Loc): RailNode {
  const width = Math.max(label.length * CHAR_W + BOX_PAD_X * 2, MIN_BOX_W);
  return { kind: 'charclass', width, height: BOX_H, connectY: BOX_H / 2, label, children: [], loc };
}
```

- [ ] **Step 4: レイアウトテストが通ることを確認**

Run: `npm run test -- railroad-layout`
Expected: PASS

- [ ] **Step 5: AST 振り分けの失敗テストを書く**

`src/utils/regex-visualizer/__tests__/railroad.test.ts` に追記（既存 `describe` 内、`buildRailroad` を使う既存テストに倣う）。ファイル冒頭の import で `buildRailroad` が使われている前提（既存テストを確認して同じ import を使う）:

```ts
describe('種別分割（リテラル / 文字クラス・メタ文字）', () => {
  it('通常リテラル a は terminal', () => {
    const node = buildRailroad('a', '');
    expect(node.kind).toBe('terminal');
  });
  it('メタ文字 . は charclass', () => {
    const node = buildRailroad('.', '');
    expect(node.kind).toBe('charclass');
  });
  it('\\s は charclass', () => {
    const node = buildRailroad('\\s', '');
    expect(node.kind).toBe('charclass');
  });
  it('文字クラス [ab] は charclass', () => {
    const node = buildRailroad('[ab]', '');
    expect(node.kind).toBe('charclass');
  });
});
```

> 注: `buildRailroad('a','')` が単一ノードを直接返すか sequence でラップするかは既存実装次第。既存テスト（`railroad.test.ts` の先頭付近）で `buildRailroad` の戻り値の扱いを確認し、必要なら `node.children[0].kind` を見るよう合わせること。単一要素 Alternative は `measureSequence` が 1 要素でも sequence を返す点に注意（その場合 `buildRailroad('a','').children[0].kind` を検証）。

- [ ] **Step 6: テストが落ちることを確認**

Run: `npm run test -- railroad.test`
Expected: FAIL（`.` `\s` `[ab]` が `terminal` のまま）

- [ ] **Step 7: railroad.ts の build() を振り分け**

`railroad.ts` の import に `measureCharClass` を追加。`build()`（`railroad.ts:104-108`）の `Char`/`CharacterClass` 分岐を置き換え:

```ts
    case 'Char':
      // regexp-tree では . \d \w \s \n \t 等が kind:'meta'。これらは文字クラス・メタ文字として扱う。
      return node.kind === 'meta'
        ? measureCharClass(sliceLabel(node, pattern), locOf(node))
        : measureTerminal(sliceLabel(node, pattern), locOf(node));
    case 'CharacterClass':
      return measureCharClass(sliceLabel(node, pattern), locOf(node));
```

- [ ] **Step 8: テストが通ることを確認**

Run: `npm run test -- railroad.test railroad-layout`
Expected: PASS

- [ ] **Step 9: コミット**

```bash
git add src/utils/regex-visualizer/railroad-layout.ts src/utils/regex-visualizer/railroad.ts src/utils/regex-visualizer/__tests__/railroad-layout.test.ts src/utils/regex-visualizer/__tests__/railroad.test.ts
git commit -m "feat: 鉄道図に文字クラス・メタ文字の種別を追加"
```

---

## Task 2: 量指定子ラベルの日本語化

**Files:**

- Modify: `src/utils/regex-visualizer/railroad.ts:66-83`
- Test: `src/utils/regex-visualizer/__tests__/railroad.test.ts`

- [ ] **Step 1: 失敗テストを書く**

`railroad.test.ts` に追記:

```ts
describe('量指定子ラベル（日本語）', () => {
  const labelOf = (p: string) => buildRailroad(p, '').children[0].label;
  it('* は 0回以上', () => expect(labelOf('a*')).toBe('0回以上'));
  it('+ は 1回以上', () => expect(labelOf('a+')).toBe('1回以上'));
  it('? は 0または1回', () => expect(labelOf('a?')).toBe('0または1回'));
  it('{3} は 3回', () => expect(labelOf('a{3}')).toBe('3回'));
  it('{2,} は 2回以上', () => expect(labelOf('a{2,}')).toBe('2回以上'));
  it('{2,5} は 2〜5回', () => expect(labelOf('a{2,5}')).toBe('2〜5回'));
  it('lazy *? は 0回以上（最短）', () => expect(labelOf('a*?')).toBe('0回以上（最短）'));
});
```

> 注: `buildRailroad('a*','')` の戻り値が sequence なら `.children[0]` が repetition。単一要素でも `measureSequence` が sequence を返すため `.children[0]` で取得する。Step 実行時に既存戻り構造を確認し、ラベルを持つ repetition ノードへの参照に合わせること。

- [ ] **Step 2: テストが落ちることを確認**

Run: `npm run test -- railroad.test`
Expected: FAIL（ラベルが `*` `+` 等の記号のまま）

- [ ] **Step 3: quantifierLabel を日本語化**

`railroad.ts` の `quantifierLabel`（`railroad.ts:66-83`）を全置換:

```ts
/** 量指定子の表示ラベル（日本語）。lazy は末尾に「（最短）」を付ける。 */
function quantifierLabel(q: Quantifier): string {
  let base: string;
  switch (q.kind) {
    case '*':
      base = '0回以上';
      break;
    case '+':
      base = '1回以上';
      break;
    case '?':
      base = '0または1回';
      break;
    case 'Range':
      base =
        q.to == null ? `${q.from}回以上` : q.to === q.from ? `${q.from}回` : `${q.from}〜${q.to}回`;
      break;
    default:
      base = '';
  }
  return q.greedy === false ? `${base}（最短）` : base;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test -- railroad.test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/utils/regex-visualizer/railroad.ts src/utils/regex-visualizer/__tests__/railroad.test.ts
git commit -m "feat: 鉄道図の量指定子ラベルを日本語化"
```

---

## Task 3: measureRepetition の弧バンド反転（ループ=上 / スキップ=下 / ラベル帯）

**Files:**

- Modify: `src/utils/regex-visualizer/railroad-layout.ts:103-123`
- Test: `src/utils/regex-visualizer/__tests__/railroad-layout.test.ts:94-120`

- [ ] **Step 1: 既存テストを新バンドモデルに書き換える**

`railroad-layout.test.ts` の `describe('measureRepetition', ...)`（94-120 行）を全置換:

```ts
describe('measureRepetition（ループ=上 / スキップ=下 / ラベル帯）', () => {
  it('loop ありで上に ARC_H、下にラベル帯 LABEL_H', () => {
    const inner = measureTerminal('a', undefined);
    const rep = measureRepetition(inner, { skip: false, loop: true, label: '1回以上' }, undefined);
    expect(rep.kind).toBe('repetition');
    expect(rep.width).toBe(inner.width + REP_LEAD * 2);
    expect(rep.height).toBe(inner.height + ARC_H + LABEL_H); // loop 上 + label 下
    expect(rep.connectY).toBe(ARC_H + inner.connectY); // loop 上 → 上余白あり
    expect(rep.children[0]).toBe(inner);
    expect(rep.label).toBe('1回以上');
  });

  it('skip+loop（*）は 上 ARC_H + 下 ARC_H + ラベル帯', () => {
    const inner = measureTerminal('a', undefined);
    const rep = measureRepetition(inner, { skip: true, loop: true, label: '0回以上' }, undefined);
    expect(rep.height).toBe(inner.height + ARC_H * 2 + LABEL_H); // loop 上 + skip 下 + label 下
    expect(rep.connectY).toBe(ARC_H + inner.connectY);
  });

  it('loop なし（? = skip のみ）は 上余白なし、下 skip ARC_H + ラベル帯', () => {
    const inner = measureTerminal('a', undefined);
    const rep = measureRepetition(
      inner,
      { skip: true, loop: false, label: '0または1回' },
      undefined
    );
    expect(rep.height).toBe(inner.height + ARC_H + LABEL_H); // skip 下 + label 下
    expect(rep.connectY).toBe(inner.connectY); // loop 無 → 上余白なし
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npm run test -- railroad-layout`
Expected: FAIL（旧バンドモデルの値と不一致）

- [ ] **Step 3: measureRepetition を新バンドモデルに実装**

`railroad-layout.ts:103-123` の `measureRepetition` を全置換:

```ts
/**
 * 量指定子（+ * ? {n,m}）。inner を本線に通す。
 * ループ弧を上（反復・矢印付き）、スキップ弧を下（バイパス）に置き、さらに下にラベル帯を確保する。
 * label は量指定子の日本語表示（'0回以上' 等）。
 */
export function measureRepetition(
  inner: RailNode,
  opts: { skip: boolean; loop: boolean; label: string },
  loc: Loc
): RailNode {
  const top = opts.loop ? ARC_H : 0; // ループ弧（上）
  const bottom = (opts.skip ? ARC_H : 0) + LABEL_H; // スキップ弧（下）+ ラベル帯
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
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test -- railroad-layout`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/utils/regex-visualizer/railroad-layout.ts src/utils/regex-visualizer/__tests__/railroad-layout.test.ts
git commit -m "feat: 鉄道図の量指定子の弧をループ上・スキップ下に再配置"
```

---

## Task 4: measureAssertion を円/pill 化

**Files:**

- Modify: `src/utils/regex-visualizer/railroad-layout.ts:94-97`
- Test: `src/utils/regex-visualizer/__tests__/railroad-layout.test.ts:85-92`

- [ ] **Step 1: テストを更新**

`railroad-layout.test.ts:85-92` の `describe('measureAssertion', ...)` を全置換:

```ts
describe('measureAssertion（アンカー: 1文字=円 / 複数文字=pill）', () => {
  it('1文字 $ は幅=高さの円', () => {
    const node = measureAssertion('$', { start: 0, end: 1 });
    expect(node.kind).toBe('assertion');
    expect(node.label).toBe('$');
    expect(node.width).toBe(node.height); // 円
    expect(node.connectY).toBe(node.height / 2);
  });
  it('複数文字 \\b は横長 pill（幅 > 高さ）', () => {
    const node = measureAssertion('\\b', { start: 0, end: 2 });
    expect(node.width).toBeGreaterThan(node.height);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npm run test -- railroad-layout`
Expected: FAIL（`$` の width が height と一致しない）

- [ ] **Step 3: measureAssertion を実装**

`railroad-layout.ts:93-97` の `measureAssertion` を全置換:

```ts
/** アサーション（^ $ \b \B のアンカー）。1文字は円、複数文字は横長 pill で示す。 */
export function measureAssertion(label: string, loc: Loc): RailNode {
  const width = label.length <= 1 ? BOX_H : Math.max(label.length * CHAR_W + BOX_PAD_X * 2, BOX_H);
  return { kind: 'assertion', width, height: BOX_H, connectY: BOX_H / 2, label, children: [], loc };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run test -- railroad-layout`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/utils/regex-visualizer/railroad-layout.ts src/utils/regex-visualizer/__tests__/railroad-layout.test.ts
git commit -m "feat: 鉄道図のアンカーを円/pill 形状にする"
```

---

## Task 5: CSS トークン・rr クラス・グループ塗り

**Files:**

- Modify: `src/styles/global.css`（`@theme` ブロック、`@layer components` の `rr-*` 群: 937-993 行付近）

- [ ] **Step 1: 紫トークンを @theme に追加**

`global.css` の `@theme` 内、`--color-link-visited: #7c3aed;`（49 行付近）の直後に追加:

```css
--color-violet-bg: #ede9fe; /* violet-100 相当: 鉄道図アンカー塗り */
--color-violet: #7c3aed; /* violet-600 相当: 鉄道図アンカー枠/文字 */
```

- [ ] **Step 2: rr-charclass / rr-anchor を追加、rr-group を塗り化、矢印 marker class、凡例 class を追加**

`global.css` の `@layer components` 内、`.rr-assertion { ... }`（973-977 行）を次の `.rr-anchor` に置換:

```css
/* アンカー（ゼロ幅の位置: ^ $ \b \B）。紫塗りの円/pill で位置系を示す。 */
.rr-anchor {
  fill: var(--color-violet-bg);
  stroke: var(--color-violet);
  stroke-width: 1;
}
```

`.rr-box-fallback { ... }`（953-955 行）の直後に追加:

```css
/* 文字クラス・メタ文字（[..] \s \d \w . 等）。青塗りでリテラルと区別する。 */
.rr-charclass {
  fill: var(--color-bg-active);
  stroke: var(--color-blue-300);
  stroke-width: 1;
}
```

`.rr-group { ... }`（961-966 行）を塗り化（破線をやめ薄灰塗り）:

```css
.rr-group {
  fill: var(--color-bg-subtle);
  stroke: var(--color-border);
  stroke-width: 1;
}
```

`.rr-quant { ... }`（989-993 行）の直後に矢印 marker と凡例の class を追加:

```css
/* ループ弧（反復方向）の矢印ヘッド。 */
.rr-arrow-head {
  fill: var(--color-border-input);
}
/* 鉄道図の凡例。SVG 直下に破線区切りで種別の見本を並べる。 */
.rr-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed var(--color-border);
}
.rr-legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
```

- [ ] **Step 3: ビルドで CSS が生成されることを確認**

Run: `npm run build`
Expected: ビルド成功（エラーなし）。

`dist/_astro/` 配下の CSS に `.rr-charclass` `.rr-anchor` `.rr-legend` が含まれることを確認:

Run: `grep -o "rr-charclass\|rr-anchor\|rr-legend\|rr-arrow-head" dist/_astro/*.css | sort -u`
Expected: 4 つの class 名が出力される。

- [ ] **Step 4: コミット**

```bash
git add src/styles/global.css
git commit -m "feat: 鉄道図の種別色・アンカー紫・グループ塗り・凡例の CSS を追加"
```

---

## Task 6: RegexRailroad 描画（種別 class・矢印 marker・弧反転・ラベル位置）

**Files:**

- Modify: `src/components/tools/RegexRailroad.tsx`

- [ ] **Step 1: charclass の描画分岐を追加**

`RegexRailroad.tsx` の `renderNode` switch、`case 'terminal':` / `case 'fallback':`（39-62 行）の直後に `charclass` を追加（terminal と同形だが class が `rr-charclass`、hot 上書き対応のため `boxClass` を通す）:

```tsx
    case 'charclass':
      return (
        <g key={key}>
          <rect
            x={x}
            y={y}
            width={node.width}
            height={node.height}
            rx={6}
            className={boxClass('rr-charclass')}
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

- [ ] **Step 2: assertion を rr-anchor + 円/pill に変更**

`case 'assertion':`（85-106 行）の `rect` の `className` を `boxClass('rr-anchor')` に、`rx` を `node.height / 2`（pill/円）に変更:

```tsx
    case 'assertion':
      return (
        <g key={key}>
          <rect
            x={x}
            y={y}
            width={node.width}
            height={node.height}
            rx={node.height / 2}
            className={boxClass('rr-anchor')}
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

- [ ] **Step 3: repetition の弧を上下反転し矢印を付ける**

`case 'repetition':`（202-255 行）を全置換。新バンドモデル（loop=上、skip=下、label=最下）に合わせる:

```tsx
    case 'repetition': {
      const inner = node.children[0];
      const innerX = x + REP_LEAD;
      const top = node.loop ? ARC_H : 0;
      const innerY = y + top;
      const railY = y + node.connectY; // = innerY + inner.connectY
      const exitX = x + node.width;
      const innerRight = innerX + inner.width;
      const r = 6;
      const els: React.ReactNode[] = [];
      // 本線リード（左右）
      els.push(<line key="ll" x1={x} y1={railY} x2={innerX} y2={railY} className="rr-rail" />);
      els.push(
        <line key="lr" x1={innerRight} y1={railY} x2={exitX} y2={railY} className="rr-rail" />
      );
      els.push(renderNode(inner, innerX, innerY, `${key}-r`, hotspot));
      // ループ弧（上・反復方向の矢印付き）: 出口から inner の上を回って入口へ戻り、入口で下向き矢印。
      if (node.loop) {
        const loopY = innerY - ARC_H / 2;
        els.push(
          <path
            key="loop"
            d={`M ${exitX} ${railY} L ${exitX} ${loopY + r} Q ${exitX} ${loopY} ${exitX - r} ${loopY} L ${x + r} ${loopY} Q ${x} ${loopY} ${x} ${loopY + r} L ${x} ${railY}`}
            className="rr-rail"
            markerEnd="url(#rr-loop-arrow)"
          />
        );
      }
      // スキップ弧（下・矢印なし）: 入口から inner の下を回って出口へ抜ける。
      if (node.skip) {
        const skipY = innerY + inner.height + ARC_H / 2;
        els.push(
          <path
            key="skip"
            d={`M ${x} ${railY} L ${x} ${skipY - r} Q ${x} ${skipY} ${x + r} ${skipY} L ${exitX - r} ${skipY} Q ${exitX} ${skipY} ${exitX} ${skipY - r} L ${exitX} ${railY}`}
            className="rr-rail"
          />
        );
      }
      // 量指定子ラベル（最下のラベル帯・常に svg 内に収まる）
      els.push(
        <text
          key="ql"
          x={x + node.width / 2}
          y={y + node.height - 2}
          textAnchor="middle"
          className="rr-quant"
        >
          {node.label}
        </text>
      );
      return <g key={key}>{els}</g>;
    }
```

> 注: 矢印は入口側でループ弧 path が `L ${x} ${railY}`（上から下へ降りて入口の rail に合流）で終わるため、`markerEnd` の矢印は下向きになる（`orient="auto"` 前提）。

- [ ] **Step 4: ルート svg に矢印 marker を定義**

`RegexRailroad` 関数（265-293 行）の `<svg ...>` 直下、最初の `<circle>` の前に `<defs>` を追加:

```tsx
<defs>
  <marker
    id="rr-loop-arrow"
    viewBox="0 0 10 10"
    refX="5"
    refY="5"
    markerWidth="6"
    markerHeight="6"
    orient="auto"
  >
    <path d="M 0 0 L 10 5 L 0 10 z" className="rr-arrow-head" />
  </marker>
</defs>
```

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし（`charclass` が `RailKind` に含まれ switch が網羅されている）。

- [ ] **Step 6: コミット**

```bash
git add src/components/tools/RegexRailroad.tsx
git commit -m "feat: 鉄道図の種別別描画・矢印付きループ弧・弧の上下反転を実装"
```

---

## Task 7: 凡例の追加

**Files:**

- Modify: `src/components/tools/RegexRailroad.tsx`（`RegexRailroad` の return）

- [ ] **Step 1: 凡例コンポーネントを追加**

`RegexRailroad.tsx` の `RegexRailroad` 関数内、`return (` の `</svg>` の後・閉じ `</div>` の前に凡例を追加する。見本図形は小さなインライン SVG、テキストはそのまま読み上げ可能にし、見本のみ `aria-hidden`:

```tsx
{
  /* 凡例: ノード種別の色/形の説明（見本図形は装飾、テキストは読み上げ可） */
}
<div className="rr-legend caption text-muted">
  <span className="rr-legend-item">
    <svg width="28" height="20" aria-hidden="true">
      <rect x="1" y="2" width="26" height="16" rx="4" className="rr-box" />
    </svg>
    文字（リテラル）
  </span>
  <span className="rr-legend-item">
    <svg width="28" height="20" aria-hidden="true">
      <rect x="1" y="2" width="26" height="16" rx="4" className="rr-charclass" />
    </svg>
    文字クラス・メタ文字
  </span>
  <span className="rr-legend-item">
    <svg width="20" height="20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" className="rr-anchor" />
    </svg>
    アンカー（位置）
  </span>
  <span className="rr-legend-item">
    <svg width="28" height="20" aria-hidden="true">
      <path
        d="M 2 16 Q 2 4 14 4 Q 26 4 26 16"
        className="rr-rail"
        markerEnd="url(#rr-loop-arrow)"
      />
    </svg>
    量指定子（くり返し・スキップ）
  </span>
</div>;
```

> 注: 凡例の弧見本は `markerEnd="url(#rr-loop-arrow)"` を参照するが、marker は別 svg（本図）の `<defs>` 内にある。SVG marker は同一ドキュメント内なら id 参照で共有できるため、この凡例 svg からも参照可能。万一描画されない環境がある場合は凡例 svg 内にも同 `<defs>` を複製する（実装時に Playwright スクショで矢印が出ているか確認し、出なければ複製する）。

凡例を `RegexRailroad` 内に置くため、`</svg>` の直後に追加し、外側 `<div className="overflow-x-auto">` の内側に収める。`overflow-x-auto` は SVG 横スクロール用なので、凡例はその外（別 div）に出したい場合は wrapper を `<div>` でもう一段くくる。実装時のレイアウト:

```tsx
  return (
    <div>
      <div className="overflow-x-auto">
        <svg ...>...</svg>
      </div>
      {/* 凡例をここに（上記 rr-legend ブロック） */}
    </div>
  );
```

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add src/components/tools/RegexRailroad.tsx
git commit -m "feat: 鉄道図に種別の凡例を追加"
```

---

## Task 8: RegexRailroad コンポーネントテストの更新

**Files:**

- Modify: `src/components/tools/__tests__/RegexRailroad.test.tsx`

- [ ] **Step 1: 既存 assertion を新仕様に更新し、種別 class / marker / 凡例のテストを追加**

`RegexRailroad.test.tsx` の以下を変更:

(a) `repetition` テスト（69-80 行）の `import` に `measureCharClass` を追加。ラベル assertion を日本語に変更（79 行 `toContain('*')` → `toContain('0回以上')`）。`label: '*'` は `label: '0回以上'` に:

```tsx
it('repetition は inner の rect と弧 path を描画する', () => {
  const inner = measureTerminal('a', { start: 0, end: 1 });
  const node = measureRepetition(
    inner,
    { skip: true, loop: true, label: '0回以上' },
    { start: 0, end: 2 }
  );
  const { container } = render(<RegexRailroad node={node} />);
  expect(container.querySelector('rect')).toBeTruthy();
  expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2); // skip + loop
  expect(container.textContent).toContain('0回以上');
});
```

(b) `assertion` テスト（51-56 行）を `rr-anchor` + 円検証に更新:

```tsx
it('assertion は rr-anchor（rect）+ ラベルを描画する', () => {
  const node = measureAssertion('$', { start: 0, end: 1 });
  const { container } = render(<RegexRailroad node={node} />);
  expect(container.querySelector('.rr-anchor')).toBeTruthy();
  expect(container.textContent).toContain('$');
});
```

(c) `tall inner` ラベルテスト（116-123 行）の `label: '+'` を `label: '1回以上'` に変更（ラベル位置の y ≤ node.height 検証はそのまま有効）。

(d) describe 末尾（124 行の閉じ括弧前）に追加:

```tsx
it('charclass は rr-charclass class で描画する', () => {
  const node = measureCharClass('\\s', { start: 0, end: 2 });
  const { container } = render(<RegexRailroad node={node} />);
  expect(container.querySelector('.rr-charclass')).toBeTruthy();
  expect(container.textContent).toContain('\\s');
});

it('loop ありの repetition は矢印 marker を参照する', () => {
  const inner = measureTerminal('a', undefined);
  const node = measureRepetition(inner, { skip: false, loop: true, label: '1回以上' }, undefined);
  const { container } = render(<RegexRailroad node={node} />);
  expect(container.querySelector('marker#rr-loop-arrow')).toBeTruthy();
  const loopPath = Array.from(container.querySelectorAll('path')).find(
    (p) => p.getAttribute('marker-end') === 'url(#rr-loop-arrow)'
  );
  expect(loopPath).toBeTruthy();
});

it('凡例の4種を描画する', () => {
  const node = measureTerminal('a', undefined);
  const { container } = render(<RegexRailroad node={node} />);
  expect(container.querySelector('.rr-legend')).toBeTruthy();
  expect(container.textContent).toContain('文字（リテラル）');
  expect(container.textContent).toContain('文字クラス・メタ文字');
  expect(container.textContent).toContain('アンカー（位置）');
  expect(container.textContent).toContain('量指定子（くり返し・スキップ）');
});
```

`import` 行（5-13 行）に `measureCharClass` を追加。

- [ ] **Step 2: テストが通ることを確認**

Run: `npm run test -- RegexRailroad`
Expected: PASS（`Test Files 1 passed` と `Tests N passed` の集計行を確認）

- [ ] **Step 3: 全 unit テストを実行**

Run: `npm run test`
Expected: 全 green。集計行 `Test Files ... passed` / `Tests ... passed` を確認（Duration 行だけ見ない）。

- [ ] **Step 4: コミット**

```bash
git add src/components/tools/__tests__/RegexRailroad.test.tsx
git commit -m "test: 鉄道図リデザインのコンポーネントテストを更新"
```

---

## Task 9: E2E とドキュメント更新

**Files:**

- Modify: `tests/e2e/regex-visualizer.spec.ts`
- Modify: `docs/tools.md`

- [ ] **Step 1: E2E に日本語量指定子ラベルの assertion を追加**

`tests/e2e/regex-visualizer.spec.ts` の「量指定子 a+ が鉄道図で表示される」テスト（111 行付近）に、ラベルが日本語で表示されることの確認を追加。既存テストの構造（`page.getByRole('button', { name: '鉄道図' }).click()` の後）に合わせ、SVG 可視確認の直後に追記:

```ts
await expect(page.getByText('1回以上')).toBeVisible();
```

入力欄に `a+` が入っている前提（既存テストのセットアップを確認し、入力が別パターンなら対応するラベルに合わせる）。さらに凡例の存在も確認:

```ts
await expect(page.getByText('文字（リテラル）')).toBeVisible();
```

- [ ] **Step 2: E2E を実行**

Run: `npm run pretest:e2e && npm run test:e2e -- regex-visualizer`
Expected: 該当 spec が PASS。CSP/hydration の謎 fail が出たら `npm run pretest:e2e` で 4321 を kill して再実行。

- [ ] **Step 3: docs/tools.md を更新**

`docs/tools.md` の「2. 鉄道図（railroad diagram）」節（379 行付近）に、色分け・凡例・日本語ラベルの説明を追記する。既存文の末尾に続けて:

```markdown
ノードは種別ごとに色/形で区別する: 文字（リテラル）は白ボックス、文字クラス・メタ文字（`[..]` `\s` `\d` `.` 等）は青ボックス、アンカー（`^ $ \b \B`）は紫の円/pill。量指定子はループ弧（上・反復方向の矢印付き）とスキップ弧（下・バイパス）で表し、ラベルは「0回以上」「1回以上」「2〜5回」等の日本語で表示する（lazy は「（最短）」を付す）。図の下部に種別の凡例を表示する。
```

- [ ] **Step 4: コミット**

```bash
git add tests/e2e/regex-visualizer.spec.ts docs/tools.md
git commit -m "test: 鉄道図リデザインの E2E 追加とドキュメント更新"
```

---

## Task 10: 実機目視確認と最終検証

**Files:** なし（検証のみ）

- [ ] **Step 1: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラー 0。

- [ ] **Step 2: 全 unit テスト**

Run: `npm run test`
Expected: 全 green（集計行を確認）。

- [ ] **Step 3: Playwright MCP で実描画スクショ（PC/スマホ）**

`npm run dev` を起動し、Playwright MCP で:

1. `caches.delete` + `localStorage.clear` + `sessionStorage.clear` + SW unregister
2. `/tools/regex-visualizer` へ navigate（キャッシュなし）
3. 入力に `(date|cast)\s*\(.*$` を入れ「鉄道図」タブに切替
4. resize 1280x800 → screenshot
5. resize 390x844 → screenshot

確認項目（`.agents/rules/ui-conventions.md` 3.1 準拠）:

- リテラル白 / 文字クラス青 / アンカー紫円 の色分けが出ている
- ループ弧が上・矢印付き、スキップ弧が下
- 量指定子ラベルが「0回以上」等の日本語
- グループ枠が薄灰塗り
- 凡例4種が図の下に表示
- スマホ幅で凡例が折り返し・はみ出しがない
- 既存の hotspot ハイライト（ReDoS 検出時）が壊れていない

モックアップ（`docs/superpowers/specs/...` 添付イメージ）と突き合わせ、ズレがあれば弧の曲率・色味・ラベル位置を微調整して再撮影。**スクショをユーザーに提示して承認を得る**。

- [ ] **Step 4: ユーザー承認後、VRT baseline 更新を依頼**

regex-visualizer ページの VRT baseline 再生成が必要。**`Update Visual Regression Baseline` workflow の `workflow_dispatch` 実行はユーザーの明示承認が必須**（エージェントが勝手に回さない）。ローカル検証完了・スクショ承認後に、ユーザーへ workflow 実行を依頼する。

---

## Self-Review

- **Spec coverage:**
  - §1 種別色分け → Task 1（charclass 分割）+ Task 5（CSS）+ Task 6（描画）✓
  - §2 日本語ラベル → Task 2 ✓
  - §3 矢印付き弧 → Task 3（バンド）+ Task 6（描画・marker）✓
  - §4 グループ塗り → Task 5 ✓ / 凡例 → Task 5(CSS)+Task 7 ✓ / 外枠カード（任意）→ Task 10 の目視で判断（spec で「任意」明記、必須タスク化しない）
  - §5 トークン/class → Task 5 ✓
  - §6 テスト/VRT/docs → Task 1-4,8（unit）+ Task 9（E2E/docs）+ Task 10（VRT 依頼）✓
- **Placeholder scan:** TODO/TBD なし。各 step に実コードを記載。
- **Type consistency:** `measureCharClass`/`charclass`/`rr-charclass`/`rr-anchor`/`#rr-loop-arrow`/`rr-arrow-head` を全 Task で一貫使用。バンド式（top/bottom/connectY）は Task 3 とテスト・Task 6 描画で一致。
- **既知の注意点:** `buildRailroad` の戻り値ラップ（sequence か単一か）は実装時に既存テストで確認して参照を合わせる旨を Task 1/2 に明記済み。
