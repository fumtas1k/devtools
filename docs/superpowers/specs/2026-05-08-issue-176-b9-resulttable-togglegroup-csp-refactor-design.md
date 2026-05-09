# `#176` B 案 PR 9 設計書 — ResultTable / ToggleGroup の `setProperty` を Constructable Stylesheets に refactor

- **Issue**: [#304](https://github.com/fumtas1k/devtools/issues/304)
- **B 案 SoT**: `docs/projects/issue-176-b-plan-progress.md`
- **post-mortem 起源**: `docs/decisions.md [067]`
- **後続**: PR 10 ([#305]) — B 案最終 flip
- **branch**: `feature/issue-176-b9-resulttable-togglegroup-csp-refactor`
- **ベース**: `develop`

## 1. 背景と目的

`#176` B 案 PR 8 ([#303]) の親直接 E2E で **`style-src 'self'` strict 化** を試行した結果 11 件の CSP violation が検知された。当初 issue / [067] では原因を `ResultTable.tsx:62-78` の `setProperty` のみと記録していたが、本 spec 起草時の調査で **ConfigConverter は ResultTable 未使用**（`config-converter` violation 1 件は `ToggleGroup.tsx:41` の `gridRef.current.style.setProperty('--toggle-cols', N)` 由来と確定）した。両者は同一の CSSOM API 経路で同一の CSP3 制約に抵触するため、PR 9 で **ResultTable + ToggleGroup を一括 refactor** し PR 10 の最終 flip を unblock する。

### 影響範囲（callsite 調査結果）

| component   | callsite 数       | 影響ツール                                                                                                                                                                                  |
| ----------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ResultTable | 2 (Ulid + UuidV7) | UlidGenerator / UuidV7Generator                                                                                                                                                             |
| ToggleGroup | 15 / 12 ツール    | Base64Codec / ConfigConverter / DummyText / EncodingConverter / JanCode / JsonCsv / JsonXml / QrCode / QrReader / QrTicket(VerifyTab + root) / UlidGenerator / UrlEncoder / UuidV7Generator |

PR 8 の violation サンプルは ResultTable 系 2 spec + ToggleGroup 系 1 spec のみだったが、PR 10 で `_headers` を strict 化すると **ToggleGroup を使う 12 ツール全てで violation が再発**する。本 PR で同時対応必須。

## 2. ゴール

- [067] § 評価した解 (a) **Constructable Stylesheets** を Phase 0 で実機検証し、適用可能であれば ResultTable / ToggleGroup を refactor
- 公開 API（`width` / `minWidth` / `options` 等）は **後方互換維持**
- `inline-style-migration.test.ts` を「`setProperty` を `--var` 値注入の許容パターンとしてスルー」から「`setProperty` を陽性検出する guard」へ反転
- PR 10 が `_headers` / `<meta>` を strict 化するだけで完了する状態を作る

### Non-goals

- `_headers` / `<meta>` から `style-src 'unsafe-inline'` を削除する flip 自体は **PR 10 のスコープ**
- `stripMetaStyleSrc` 撤去 / `headers.test.ts` strict 化等の cleanup commit も **PR 10**
- ToggleGroup の `layout='wrap'` 経路は `setProperty` を使っていないため変更不要

## 3. 採用技術

### Constructable Stylesheets

```ts
const sheet = new CSSStyleSheet();
sheet.replaceSync('.foo { width: 3.5rem; }');
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
```

CSP3 spec 上、`new CSSStyleSheet()` 経由で生成される programmatic stylesheet は inline style 扱いされず `style-src` の対象外となる。Chromium / Firefox / Safari で実装されており、サポートバージョンは Chromium 73+ / Firefox 101+ / Safari 16.4+。本プロジェクトは evergreen browser のみ対象 (Astro + Vite SPA、static build) のためフォールバック不要。

### 不採用 (確認ずみ)

- **(b) CSS class swap**: 確実だが API 変更を強要 (`width: '3.5rem'` 文字列 → `widthClass: 'w-14'` 等)、callsite 全箇所修正必要、UX 影響 (連続値 width が固定 bucket に discretize)。Phase 0 で (a) NG 確定時の fallback として残す。
- **(c) `'unsafe-hashes'` + hash 列挙**: 連続値で hash 空間無限。
- **(d) per-request nonce**: Astro 静的 build / Cloudflare Pages では request 単位 nonce 不可。

## 4. 設計

### 4.1 共通 hook `src/hooks/useDynamicStyleSheet.ts` (新規)

```ts
import { useEffect, useId } from 'react';

/**
 * Constructable Stylesheets で per-instance scoped CSS を注入。
 *
 * CSP3 strict 化対応: `setProperty` / `style` 属性経由は `style-src` の対象だが、
 * `new CSSStyleSheet()` + `replaceSync()` は programmatic stylesheet として
 * `style-src` 対象外（`docs/decisions.md [067]` 参照）。
 *
 * SSR-safe: `useId()` ベースで stable な class 名を返すため SSR / CSR で
 * markup mismatch しない。`adoptedStyleSheets` への attach は `useEffect`
 * 内で行うため client-side のみ実行される。
 *
 * @param buildRules - hook が確定した className を受け取り CSS rules 文字列を
 *   組み立てて返す callback。空文字列を返すと sheet 生成・attach をスキップする。
 * @returns root element に付与する unique class 名
 */
export function useDynamicStyleSheet(buildRules: (className: string) => string): string {
  const rawId = useId();
  const className = `dyn-${rawId.replaceAll(':', '_')}`;
  const rules = buildRules(className);

  useEffect(() => {
    if (!rules) return;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(rules);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return () => {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
    };
  }, [rules]);

  return className;
}
```

**設計判断**:

- 戻り値は class 名のみ。rules 構築は callback で consumer 側に委譲（戻り値の className を rules に埋め込む循環を断つため）
- `useEffect([rules])` で文字列が変わるたび detach → 再 attach。`replaceSync` は同期 / 軽量で問題なし
- 空文字列を返した場合 sheet 生成スキップ（ToggleGroup の `layout='wrap'` 時に必要）

### 4.2 CSS length validator `src/utils/css-length.ts` (新規)

`replaceSync` は CSS パーサに渡るため、`width` / `minWidth` の値に `; }body{display:none` 等が混入すると CSS injection になる。現状 JSDoc 規律のみで TypeScript で enforce 不能。

```ts
/**
 * 簡易 CSS length token 検証。`{number}{unit?}` 形式のみ許容。
 *
 * 対応: integer / decimal / 負値 / `px|rem|em|%|fr|vw|vh|ch|ex|pt`
 * 非対応: `calc()` / 複合値 / 数学演算子。必要になった時点で拡張。
 */
const CSS_LENGTH = /^-?\d+(\.\d+)?(px|rem|em|%|fr|vw|vh|ch|ex|pt)?$/;

export function assertCssLength(value: string, label: string): void {
  if (!CSS_LENGTH.test(value)) {
    throw new Error(`Invalid CSS length for ${label}: ${JSON.stringify(value)}`);
  }
}
```

ResultTable 側で `width` / `minWidth` を hook 呼出前に検証。違反は throw（dev / prod とも fail-fast、defense in depth）。

### 4.3 ResultTable refactor

#### 変更前

```tsx
<table
  ref={(el) => {
    if (!el) return;
    if (minWidth) el.style.setProperty('--result-table-min-width', minWidth);
    else el.style.removeProperty('--result-table-min-width');
  }}
  className="w-full border-collapse result-table"
>
  <colgroup>
    {columns.map((col) => (
      <col
        key={col.key}
        ref={(el) => {
          if (!el) return;
          if (col.width) el.style.setProperty('--col-width', col.width);
          else el.style.removeProperty('--col-width');
        }}
        className={col.width ? 'result-table-col' : undefined}
      />
    ))}
  </colgroup>
  ...
```

#### 変更後

```tsx
function buildResultTableRules<T>(
  className: string,
  columns: TableColumn<T>[],
  minWidth?: string
): string {
  const rules: string[] = [];
  if (minWidth) rules.push(`.${className} { min-width: ${minWidth}; }`);
  columns.forEach((col, i) => {
    if (col.width) {
      rules.push(
        `.${className} > colgroup > col:nth-child(${i + 1}) { width: ${col.width}; }`
      );
    }
  });
  return rules.join('\n');
}

export function ResultTable<T>({ rows, columns, getKey, minWidth, ... }: Props<T>) {
  if (minWidth !== undefined) assertCssLength(minWidth, 'minWidth');
  for (const c of columns) {
    if (c.width !== undefined) assertCssLength(c.width, `column[${c.key}].width`);
  }

  const dynClassName = useDynamicStyleSheet((className) =>
    buildResultTableRules(className, columns, minWidth)
  );

  return (
    <div className="rounded-lg border border-default overflow-hidden">
      ...
      <div className="overflow-x-auto">
        <table className={`w-full border-collapse result-table ${dynClassName}`}>
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} />
            ))}
          </colgroup>
          ...
```

**変更点**:

- `ref` callback / `setProperty` / `removeProperty` を全撤去
- `<col className="result-table-col">` の class 付与を撤去（CSS 変数経路を廃止）
- `<table>` に `dynClassName` を追加
- `assertCssLength` で width / minWidth を validate

#### `src/styles/global.css` の変更

```diff
- .result-table {
-   /* setProperty('--result-table-min-width', ...) で注入。未注入時は 0 (= no min-width 制約) */
-   min-width: var(--result-table-min-width, 0);
- }
- .result-table-col {
-   width: var(--col-width, auto);
- }
  .result-table-row:nth-child(odd) { ... }
  ...
```

`.result-table { min-width: ... }` / `.result-table-col { width: ... }` を撤去（dynamic sheet 一本化）。`.result-table-row` 系の zebra / selection rule は維持（CSS 変数非依存で setProperty 関与なし）。

### 4.4 ToggleGroup refactor

#### 変更前

```tsx
const gridRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!isWrap && gridRef.current) {
    gridRef.current.style.setProperty('--toggle-cols', String(options.length));
  }
}, [isWrap, options.length]);

return <div ref={gridRef} className={containerClass} ...>...</div>;
```

#### 変更後

```tsx
const dynClassName = useDynamicStyleSheet((className) =>
  isWrap ? '' : `.${className} { --toggle-cols: ${options.length}; }`
);

const gridContainerClass = `bg-subtle rounded-lg border border-input p-1 toggle-grid ${dynClassName}`;
const containerClass = isWrap
  ? 'bg-subtle rounded-lg border border-input p-1 flex flex-wrap gap-1 w-max max-w-full'
  : gridContainerClass;

return <div className={containerClass} ...>...</div>;
```

**変更点**:

- `useRef` / `useEffect` / `setProperty` を全撤去
- `useDynamicStyleSheet` で `--toggle-cols` を per-instance に注入
- `layout='wrap'` 時は空文字列を返し sheet 生成スキップ
- `options.length` は整数のため CSS length validator 不要 (`String(N)` で安全)

#### `src/styles/global.css` (変更なし)

```css
.toggle-grid {
  display: grid;
  grid-template-columns: repeat(var(--toggle-cols, 2), minmax(0, 1fr));
  gap: 0.25rem;
}
```

`--toggle-cols` の default fallback `2` は `layout='wrap'` 経路では使われないが、static rule として保持（dynamic sheet 注入前の初回 paint や hydration 中の flash 抑制）。

### 4.5 非対称設計の理由

| component   | static CSS 変数 fallback  | dynamic sheet | 理由                                                                                              |
| ----------- | ------------------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| ResultTable | 撤去                      | 一本化        | width / min-width とも default 不要 (未指定 = auto / 0)、rule 数も少なく singular path がシンプル |
| ToggleGroup | 維持 (`--toggle-cols, 2`) | 上書きのみ    | `layout='wrap'` で dynamic 不要、static fallback 削除すると wrap layout 壊れる                    |

各コンポーネント特性に素直な選択を優先。統一性を求めると ResultTable に空 default を追加する必要が出るがメリット薄い。

## 5. テスト戦略

### 5.1 Phase 0 検証 infra

`tests/e2e/helpers.ts` に `applyStrictStyleSrcCsp` を追加（既存 `applyProductionCsp` の parameterized 版）:

```ts
const STRICT_STYLE_SRC_CSP =
  // PR 10 で適用予定の strict CSP の暫定形。PR 10 で src/utils/csp.ts に
  // STRICT_PRODUCTION_CSP として正規化され、本 inline は削除される。
  "default-src 'self'; script-src 'self'; style-src 'self'; ...";

async function applyCspOverride(page: Page, csp: string): Promise<CspGuard> {
  // 既存 applyProductionCsp の本体。csp 文字列を引数化。
  ...
}

export async function applyProductionCsp(page: Page): Promise<CspGuard> {
  return applyCspOverride(page, PRODUCTION_CSP);
}

export async function applyStrictStyleSrcCsp(page: Page): Promise<CspGuard> {
  return applyCspOverride(page, STRICT_STYLE_SRC_CSP);
}
```

**判断**: `STRICT_STYLE_SRC_CSP` は helpers.ts inline に置く。理由: PR 9 では src 側 (`csp.ts`) を変更しない (PR 10 の責務)、test verification 専用の暫定値、PR 10 で削除される予定。

`withStrictStyleSrcCsp` ラッパは追加しない (Phase 2 verification は run-only かつ PR 10 で `withProductionCsp` 自体が strict 化するため不要)。

### 5.2 Phase 0 minimal repro `tests/e2e/csp-constructable-stylesheet.spec.ts` (新規・永続)

```ts
test.describe('CSP style-src strict 下の dynamic style 経路', () => {
  test('陽性対照: 生 setProperty は violation を起こす', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyStrictStyleSrcCsp(page);
      await page.goto('/');
      await page.evaluate(() => {
        document.body.style.setProperty('--probe', '1px');
      });
      await expect.poll(() => guard.violations.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test('陰性対照: Constructable Stylesheet は violation を起こさず適用される', async ({
    browser,
  }) => {
    // new CSSStyleSheet() + replaceSync('.csp-probe { background: rgb(255,0,0); }')
    // → adoptedStyleSheets に attach → div.csp-probe の computedStyle 確認
    // guard.assertNoViolations() 終端
  });

  test('陰性対照: CSS 変数注入 (ResultTable / ToggleGroup の実利用形態)', async ({ browser }) => {
    // ResultTable / ToggleGroup の本物の DOM を生成し dynamic sheet で
    // --col-width / --toggle-cols を注入、violation 0 確認
  });
});
```

**永続させる理由** (memory `feedback_positive_control_for_gates.md`): Chromium 動作変更や CSP 仕様改訂で Constructable Stylesheets が `style-src` 対象に変わる regression を継続検出する。PR 10 後も残す。

### 5.3 Phase 1 既存 e2e (通常 run)

`npm run test:e2e` 全 spec を `withProductionCsp` (現状の `unsafe-inline` 込み) で run。**通常 spec の機能 regression 検知**が目的で、CSP strict 検証ではない。Ulid / UuidV7 / config-converter spec が PR 9 refactor 後も pass することを確認。

### 5.4 Phase 2 strict CSP local verification (run-only / commit なし)

ToggleGroup を使う 12 ツール spec を `applyStrictStyleSrcCsp` で local 実行し violation 0 件を確認。手段:

```ts
// tests/e2e/_phase2-strict-verification.spec.ts (一時ファイル、commit せず削除)
import { test } from '@playwright/test';
import { applyStrictStyleSrcCsp, waitForReactHydration } from './helpers';

const TARGETS = [
  '/tools/ulid-generator',
  '/tools/uuid-v7',
  '/tools/config-converter',
  '/tools/base64',
  '/tools/dummy-text',
  '/tools/encoding-converter',
  '/tools/jan-code',
  '/tools/json-csv',
  '/tools/json-xml',
  '/tools/qr-code',
  '/tools/qr-reader',
  '/tools/qr-ticket',
  '/tools/url-encode',
];

for (const path of TARGETS) {
  test(`strict CSP: ${path} で violation 0`, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyStrictStyleSrcCsp(page);
      await page.goto(path);
      await waitForReactHydration(page);
      // ToggleGroup の `useEffect` が初回 mount で setProperty を呼ぶ経路を
      // 検証するため、interaction 不要 (hydration 完了 = useEffect fire)。
      // 念のため 1 frame 待つ
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
      guard.assertNoViolations();
    } finally {
      await context.close();
    }
  });
}
```

local run → 全 PASS → ファイル削除。痕跡なし。

### 5.5 Unit / migration test

- `src/utils/__tests__/inline-style-migration.test.ts`:
  - JSDoc 訂正
  - `.filter((m) => !m.includes('setProperty'))` 撤去
  - regex 拡張 (`\.style\.setProperty\s*\(` も検出対象)
  - 「setProperty は許容」テスト → 「setProperty は禁止検出」に反転
- `src/components/ui/__tests__/ResultTable.test.tsx` (新規、optional): width 適用の確認 (computed style ベース)
- `src/components/ui/__tests__/ToggleGroup.test.tsx` (新規、optional): `--toggle-cols` 注入の確認

unit test 新規追加は MVP では optional。VRT + e2e で機能保証されるため、コスト対効果次第で追加判断。

### 5.6 VRT

既存 baseline で diff 0 件期待 (dynamic sheet 経由でも最終 computed style は同一)。micro pixel diff が出た場合は memory `feedback_subagent_verification_trust.md` の DOM / computed style diff 確認手順を踏み baseline 更新判断。

## 6. commit 順

| #   | scope                  | ファイル                                                                                                                                                                        |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | infra (test)           | `tests/e2e/helpers.ts` (parameterize + `applyStrictStyleSrcCsp`) / `tests/e2e/csp-constructable-stylesheet.spec.ts` 新規                                                        |
| C2  | feature (refactor)     | `src/hooks/useDynamicStyleSheet.ts` 新規 / `src/utils/css-length.ts` 新規 / `src/components/ui/ResultTable.tsx` / `src/components/ui/ToggleGroup.tsx` / `src/styles/global.css` |
| C3  | test (migration guard) | `src/utils/__tests__/inline-style-migration.test.ts`                                                                                                                            |
| C4  | docs                   | `docs/decisions.md [067]` 追補 / `docs/projects/issue-176-b-plan-progress.md` 同期                                                                                              |

**親 Opus 直接実装** (subagent 非委譲)。理由: PR 7a / 7b / 8 と同パターン (memory `feedback_subagent_verification_trust.md` 準拠)、scope 中規模 (推定 250-300 行)、検証フェーズ複数で親管理が確実。

## 7. infra / feature 分離の判断

memory `feedback_infra_feature_separation.md` の原則は「testing infra は feature と別 PR」だが、本 PR は **bundle 許容**。根拠:

- helper は `applyProductionCsp` の parameterize (~30 行)、独立 PR にすると review 二度手間
- Phase 0 minimal repro は refactor の前提検証 (順序: helper → Phase 0 spec → refactor)
- PR 5b と同 judgement (1 spec 内 + helper 既存 + 別 PR 化のレビュー二度手間回避)

## 8. リスクと fallback

### 8.1 Phase 0 NG (Constructable Stylesheets が violation を起こす場合)

**可能性**: 低 (CSP3 spec / Chromium 実装ともに対象外と扱う仕様)、ただし非ゼロ。

**判定**: C1 commit + Phase 0 spec local run で陰性対照が fail した場合。

**fallback**:

1. PR 9 を一旦 close または draft に戻す
2. SoT に post-mortem 追記、issue #304 に経過コメント
3. CSS class swap (b) で再起草 (新 spec、API 変更受容)

### 8.2 VRT diff

micro pixel diff の可能性。根本原因が dynamic sheet の paint timing なら baseline 更新で対応 (memory `feedback_subagent_verification_trust.md` の手順)。本質的差異なら PR 9 内 fix。

### 8.3 CSS injection

`assertCssLength` で防御。caller 側 hard-coded 規律と二重防御。新規 callsite で variable を渡そうとした場合は throw で fail-fast。

### 8.4 PR size

推定 250-300 行 / 4 commit。memory `feedback_pr_size.md` 閾値内 (10 commit / 500 行 まで)。

## 9. PR description 雛形

```markdown
タイトル: refactor(ResultTable,ToggleGroup): #176 B 案 PR 9 — setProperty を Constructable Stylesheets に refactor (#304)

## 概要

PR 8 ([#303]) の親直接 E2E で発覚した CSP3 `style-src 'self'` 非互換の `setProperty`
経路 (issue [#304] / `decisions.md [067]`) を Constructable Stylesheets に refactor。
PR 10 ([#305]) の B 案最終 flip を unblock する。

## 経緯

- 11 件 violation 内訳: ResultTable (Ulid + UuidV7 = 10 件) + ToggleGroup
  (config-converter = 1 件)
- 当初 issue は ResultTable のみ言及だったが、ConfigConverter は ToggleGroup
  経由 (本 spec 起草時の調査で確認) → PR 9 で両方対応
- ToggleGroup は 12 ツールで使用、PR 10 strict 化で全違反するため同 PR で対応必須

## 変更

- `src/hooks/useDynamicStyleSheet.ts` 新規 — Constructable Stylesheets ラッパ hook (SSR-safe)
- `src/utils/css-length.ts` 新規 — CSS length validator (CSS injection 防御)
- `src/components/ui/ResultTable.tsx` — `el.style.setProperty` 2 件撤去 → hook 経由
- `src/components/ui/ToggleGroup.tsx` — `gridRef.current.style.setProperty` 1 件撤去 → hook 経由
- `src/styles/global.css` — `.result-table` / `.result-table-col` の var 経由 rule 撤去
- `tests/e2e/helpers.ts` — `applyStrictStyleSrcCsp` 追加 (PR 10 で削除候補)
- `tests/e2e/csp-constructable-stylesheet.spec.ts` 新規 — 陽性 + 陰性対照 (永続)
- `src/utils/__tests__/inline-style-migration.test.ts` — `setProperty` 除外を撤去、陽性 guard に反転

## 検証

- Phase 0: minimal repro spec で Chromium 動作確認 ✅
- Phase 2: ToggleGroup consumer 12 ツール spec を strict CSP で local run、violation 0 件 ✅
- VRT: diff 0 件 ✅
- 全 unit + astro check + 全 e2e (通常 run) PASS ✅

## scope 外

- `_headers` / `<meta>` strict 化 → PR 10 ([#305])
- `STRICT_PRODUCTION_CSP` 定数の src 側 export → PR 10 で `PRODUCTION_CSP` 自体を flip

## 関連

- closes [#304]
- unblocks [#305] (PR 10)
- post-mortem: `docs/decisions.md [067]`
- SoT: `docs/projects/issue-176-b-plan-progress.md`
```

## 10. 完了判定

- [ ] Phase 0 minimal repro spec PASS (陽性対照 + 陰性対照)
- [ ] Phase 1 全 e2e PASS (`withProductionCsp` 通常 run)
- [ ] Phase 2 strict CSP local verification 12 ツール spec で violation 0 件
- [ ] VRT diff 0 件
- [ ] unit + astro check PASS
- [ ] migration test の陽性 guard が動作することを meta-test で確認
- [ ] `docs/decisions.md [067]` 追補
- [ ] SoT 更新 (PR 9 → ✅ merged)
