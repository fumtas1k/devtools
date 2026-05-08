# `#176` B 案 PR 9 実装計画 — ResultTable / ToggleGroup の `setProperty` を Constructable Stylesheets に refactor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PR 8 ([#303]) で発覚した CSP3 `style-src 'self'` 非互換の `setProperty` 経路 (issue [#304] / `decisions.md [067]`) を、ResultTable / ToggleGroup 双方とも Constructable Stylesheets に refactor し、PR 10 ([#305]) の B 案最終 flip を unblock する。

**Architecture:** 共通 hook `useDynamicStyleSheet` (SSR-safe / `useId` ベース) で `new CSSStyleSheet()` + `document.adoptedStyleSheets` 経路を集約。各コンポーネントから `setProperty` を完全撤去し、`assertCssLength` で CSS injection を防御。Phase 0 で Chromium 動作を実機検証してから refactor、NG なら CSS class swap (b) に fallback。

**Tech Stack:** React 19 + Astro 5 + Vite + Playwright (E2E) + vitest (unit) + Constructable Stylesheets (browser API、CSP3 `style-src` 対象外仕様)

**Spec:** `docs/superpowers/specs/2026-05-08-issue-176-b9-resulttable-togglegroup-csp-refactor-design.md`

**Branch:** `feature/issue-176-b9-resulttable-togglegroup-csp-refactor` (作成済 / develop ベース)

---

## ファイル構成

### 新規作成

- `src/hooks/useDynamicStyleSheet.ts` — Constructable Stylesheets を React lifecycle に integrate するラッパ hook
- `src/hooks/__tests__/useDynamicStyleSheet.test.tsx` — hook の jsdom unit test
- `src/utils/css-length.ts` — CSS length token validator (CSS injection 防御)
- `src/utils/__tests__/css-length.test.ts` — validator の unit test
- `tests/e2e/csp-constructable-stylesheet.spec.ts` — Phase 0 minimal repro (陽性 + 陰性対照、永続)

### 修正

- `src/components/ui/ResultTable.tsx` — `el.style.setProperty` 2 件撤去 → hook 経由
- `src/components/ui/ToggleGroup.tsx` — `gridRef.current.style.setProperty` 1 件撤去 → hook 経由
- `src/styles/global.css` — `.result-table` / `.result-table-col` の var 経由 rule 撤去 (`.toggle-grid` の `--toggle-cols, 2` fallback は保持)
- `tests/e2e/helpers.ts` — `applyCspOverride` parameterize + `applyStrictStyleSrcCsp` 追加
- `src/utils/__tests__/inline-style-migration.test.ts` — `setProperty` 除外を撤去、陽性 guard に反転
- `docs/decisions.md` — `[067]` 追補 (PR 9 outcome 記録)
- `docs/projects/issue-176-b-plan-progress.md` — PR 9 行を ✅ merged に更新、PR 10 unblock note

### 一時作成 / 削除 (commit せず)

- `tests/e2e/_phase2-strict-verification.spec.ts` — Phase 2 local verification 用、12 ツール spec を strict CSP run。検証完了後削除

---

## commit map

| commit | 含まれる Task | 内容                                                                                |
| ------ | ------------- | ----------------------------------------------------------------------------------- |
| **C1** | Task 1        | infra: `helpers.ts` parameterize + `applyStrictStyleSrcCsp` + Phase 0 minimal repro |
| **C2** | Task 2-6      | feature: hook + validator + ResultTable + ToggleGroup + global.css                  |
| **C3** | Task 8        | test: migration test の `setProperty` 除外を陽性 guard に反転                       |
| **C4** | Task 9        | docs: `decisions.md [067]` 追補 + SoT 同期                                          |

Task 7 (Phase 2 verification) は run-only / commit なし。Task 10 は PR 作成 (push + `gh pr create`)。

---

## Task 1: Phase 0 infra (`applyStrictStyleSrcCsp` + minimal repro spec)

**目的:** Constructable Stylesheets が CSP `style-src 'self'` 下で violation を起こさず動作することを実機検証する infra を整え、永続的な regression 検出網として残す。

**Files:**

- Modify: `tests/e2e/helpers.ts` (parameterize `applyProductionCsp` + add `applyStrictStyleSrcCsp`)
- Create: `tests/e2e/csp-constructable-stylesheet.spec.ts`

- [ ] **Step 1.1: `helpers.ts` の `applyProductionCsp` を parameterize**

`tests/e2e/helpers.ts` に以下を追加 (既存 `applyProductionCsp` を内部で `applyCspOverride` に委譲する形へ書換):

```ts
// 既存 import の直後に追加
const STRICT_STYLE_SRC_CSP =
  "default-src 'self'; " +
  "img-src 'self' data: blob:; " +
  "media-src 'self' blob:; " +
  "style-src 'self'; " + // 'unsafe-inline' を削除した PR 10 想定形 (test 専用 / 暫定値)
  "script-src 'self' 'unsafe-inline'; " +
  "connect-src 'self'; " +
  "worker-src 'self'; " +
  "object-src 'none'; " +
  "frame-ancestors 'none'; " +
  "base-uri 'none'; " +
  "form-action 'self'; " +
  'upgrade-insecure-requests';
```

既存 `applyProductionCsp` 関数の中身を `applyCspOverride(page, csp)` に切り出して、`applyProductionCsp` / `applyStrictStyleSrcCsp` の両方が共通 core を呼ぶ形にする:

```ts
async function applyCspOverride(page: Page, csp: string): Promise<CspGuard> {
  const violations: string[] = [];

  const routeHandler = async (route: Route): Promise<void> => {
    if (route.request().resourceType() !== 'document') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await route.fulfill({
      status: response.status(),
      headers: { ...response.headers(), 'content-security-policy': csp },
      body: await response.body(),
    });
  };

  const consoleHandler = (msg: ConsoleMessage): void => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Content Security Policy/i.test(text)) {
      violations.push(text);
    }
  };

  const pageErrorHandler = (err: Error): void => {
    if (/Content Security Policy/i.test(err.message)) {
      violations.push(err.message);
    }
  };

  await page.route('**/*', routeHandler);
  page.on('console', consoleHandler);
  page.on('pageerror', pageErrorHandler);

  return {
    get violations() {
      return violations.slice();
    },
    assertNoViolations() {
      if (violations.length > 0) {
        throw new Error(
          `CSP 違反が ${violations.length} 件検知されました:\n` + violations.join('\n')
        );
      }
    },
    async dispose() {
      await page.unroute('**/*', routeHandler);
      page.off('console', consoleHandler);
      page.off('pageerror', pageErrorHandler);
    },
  };
}

export async function applyProductionCsp(page: Page): Promise<CspGuard> {
  return applyCspOverride(page, PRODUCTION_CSP);
}

/**
 * **PR 9 ([#304]) verification 専用 helper、PR 10 で削除候補。**
 *
 * `style-src 'self'` (PR 10 で flip 予定の strict 形) を強制注入し、
 * Constructable Stylesheets / setProperty 経路の挙動を実機検証する。
 *
 * `STRICT_STYLE_SRC_CSP` は `PRODUCTION_CSP` から `style-src` の
 * `'unsafe-inline'` のみ除いた形。PR 10 で `PRODUCTION_CSP` 自体を
 * strict 化したら本 helper は冗長になり、削除する。
 */
export async function applyStrictStyleSrcCsp(page: Page): Promise<CspGuard> {
  return applyCspOverride(page, STRICT_STYLE_SRC_CSP);
}
```

`applyProductionCsp` の既存 JSDoc は維持。`STRICT_STYLE_SRC_CSP` 定数の上に簡潔なコメントを置く。

- [ ] **Step 1.2: Phase 0 minimal repro spec を作成**

`tests/e2e/csp-constructable-stylesheet.spec.ts` (新規):

```ts
import { test, expect } from '@playwright/test';
import { applyStrictStyleSrcCsp } from './helpers';

/**
 * PR 9 ([#304]) — Constructable Stylesheets が CSP `style-src 'self'` 下で
 * violation を起こさず適用されることを継続検証する永続 regression 検出網。
 *
 * 陽性対照 + 陰性対照のセットで「ガードが空回りしていないか」を保証する
 * (memory `feedback_positive_control_for_gates.md` 準拠)。
 *
 * 廃止条件: PR 10 で B 案最終 flip 完了後も残す (Chromium 動作変更や
 * CSP 仕様改訂で Constructable Stylesheets が `style-src` 対象に
 * 変わった場合の早期検知)。
 */
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
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyStrictStyleSrcCsp(page);
      await page.goto('/');
      const bg = await page.evaluate(() => {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync('.csp-probe { background: rgb(255, 0, 0); }');
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        const probe = document.createElement('div');
        probe.className = 'csp-probe';
        document.body.appendChild(probe);
        return getComputedStyle(probe).backgroundColor;
      });
      expect(bg).toBe('rgb(255, 0, 0)');
      guard.assertNoViolations();
    } finally {
      await context.close();
    }
  });

  test('陰性対照: CSS 変数注入経路でも violation を起こさない (ResultTable / ToggleGroup の本物形態)', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyStrictStyleSrcCsp(page);
      await page.goto('/');
      const result = await page.evaluate(() => {
        // 1. instance class を生成
        const id = 'dyn-test-instance';
        // 2. Constructable Stylesheet で CSS 変数を per-instance scoped で注入
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(`
          .${id} { --col-width: 3.5rem; }
          .child-${id} { width: var(--col-width, auto); }
        `);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        // 3. DOM 配置
        const parent = document.createElement('div');
        parent.className = id;
        const child = document.createElement('div');
        child.className = `child-${id}`;
        parent.appendChild(child);
        document.body.appendChild(parent);
        return getComputedStyle(child).width;
      });
      // jsdom と異なり Playwright Chromium では rem が px に解決される (16px 基準で 3.5rem = 56px)
      expect(result).toBe('56px');
      guard.assertNoViolations();
    } finally {
      await context.close();
    }
  });
});
```

- [ ] **Step 1.3: Phase 0 spec を実行して動作確認**

```bash
cd /Users/fumta/projects/devtools && npm run test:e2e -- csp-constructable-stylesheet.spec.ts
```

**期待**: 3 test 全 PASS。

**NG 時の対応:**

- 陽性対照 fail → helper の CSP 注入が効いていない、route handler 確認
- 陰性対照 fail → Constructable Stylesheets が Chromium で violation を起こす ([067] § 評価した解 (a) が成立しない確定)、PR 9 を draft に戻して spec § 8.1 fallback フロー (CSS class swap (b) で再起草) に切替

- [ ] **Step 1.4: C1 commit**

```bash
git add tests/e2e/helpers.ts tests/e2e/csp-constructable-stylesheet.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): #304 Phase 0 — applyStrictStyleSrcCsp + Constructable Stylesheets 検証 spec

PR 9 verification 用の infra を先行投入する。

- helpers.ts: applyProductionCsp の中身を applyCspOverride に切り出し、
  applyStrictStyleSrcCsp (style-src 'self' 強制) を追加。PR 10 で
  PRODUCTION_CSP 自体が strict 化したら本 helper は削除候補。
- csp-constructable-stylesheet.spec.ts (永続): 陽性対照 (生 setProperty
  は violation 起こす) + 陰性対照 (Constructable Stylesheet は起こさない /
  CSS 変数経由でも起こさない) の 3 test。PR 10 後も継続 regression 検出網。

memory feedback_positive_control_for_gates.md / feedback_infra_feature_separation.md
の例外条項 (PR 5b と同 judgement、helper 30 行規模 + Phase 0 検証は refactor の前提) 準拠。
EOF
)"
```

---

## Task 2: `useDynamicStyleSheet` hook (TDD)

**目的:** Constructable Stylesheets を React lifecycle に integrate する SSR-safe な共通 hook を実装する。

**Files:**

- Create: `src/hooks/useDynamicStyleSheet.ts`
- Create: `src/hooks/__tests__/useDynamicStyleSheet.test.tsx`

- [ ] **Step 2.1: 失敗テストを書く**

`src/hooks/__tests__/useDynamicStyleSheet.test.tsx` (新規):

```tsx
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useDynamicStyleSheet } from '../useDynamicStyleSheet';

describe('useDynamicStyleSheet', () => {
  beforeEach(() => {
    document.adoptedStyleSheets = [];
  });
  afterEach(() => {
    cleanup();
    document.adoptedStyleSheets = [];
  });

  it('useId ベースで stable な class 名を返し dyn- prefix を持つ', () => {
    const { result } = renderHook(() => useDynamicStyleSheet(() => ''));
    expect(result.current).toMatch(/^dyn-/);
    expect(result.current).not.toContain(':');
  });

  it('rules を渡すと document.adoptedStyleSheets に attach される', () => {
    const { result } = renderHook(() => useDynamicStyleSheet((cn) => `.${cn} { color: red; }`));
    expect(document.adoptedStyleSheets.length).toBe(1);
    const sheet = document.adoptedStyleSheets[0];
    expect(sheet.cssRules[0].cssText).toContain(`.${result.current}`);
    expect(sheet.cssRules[0].cssText).toContain('color: red');
  });

  it('空文字列を返すと sheet を生成しない', () => {
    renderHook(() => useDynamicStyleSheet(() => ''));
    expect(document.adoptedStyleSheets.length).toBe(0);
  });

  it('unmount 時に sheet を detach する', () => {
    const { unmount } = renderHook(() => useDynamicStyleSheet((cn) => `.${cn} { color: red; }`));
    expect(document.adoptedStyleSheets.length).toBe(1);
    unmount();
    expect(document.adoptedStyleSheets.length).toBe(0);
  });

  it('rules が変わると sheet を作り直す', () => {
    const { rerender } = renderHook(
      ({ color }: { color: string }) => useDynamicStyleSheet((cn) => `.${cn} { color: ${color}; }`),
      { initialProps: { color: 'red' } }
    );
    expect(document.adoptedStyleSheets[0].cssRules[0].cssText).toContain('red');
    rerender({ color: 'blue' });
    expect(document.adoptedStyleSheets.length).toBe(1);
    expect(document.adoptedStyleSheets[0].cssRules[0].cssText).toContain('blue');
  });
});
```

- [ ] **Step 2.2: テストを実行して fail 確認**

```bash
npm run test -- useDynamicStyleSheet.test
```

**期待**: FAIL (`useDynamicStyleSheet` が未定義)。

- [ ] **Step 2.3: hook を実装**

`src/hooks/useDynamicStyleSheet.ts` (新規):

```ts
import { useEffect, useId } from 'react';

/**
 * Constructable Stylesheets で per-instance scoped CSS を注入。
 *
 * CSP3 strict 化対応: `setProperty` / `style` 属性経由は `style-src` の対象だが、
 * `new CSSStyleSheet()` + `replaceSync()` は programmatic stylesheet として
 * `style-src` 対象外 (`docs/decisions.md [067]` 参照)。
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

- [ ] **Step 2.4: テスト実行して PASS 確認**

```bash
npm run test -- useDynamicStyleSheet.test
```

**期待**: 5 test 全 PASS。

**NG 時の対応:**

- jsdom が `CSSStyleSheet` constructor を未サポート → vitest config 確認、`happy-dom` への切替検討。本 hook は browser-only API のため jsdom が `new CSSStyleSheet()` をサポートしない場合は `// @vitest-environment happy-dom` directive を test ファイル冒頭に追加

---

## Task 3: `assertCssLength` validator (TDD)

**目的:** ResultTable の `width` / `minWidth` 値を hook 呼出前に validate し、CSS injection を防ぐ。

**Files:**

- Create: `src/utils/css-length.ts`
- Create: `src/utils/__tests__/css-length.test.ts`

- [ ] **Step 3.1: 失敗テストを書く**

`src/utils/__tests__/css-length.test.ts` (新規):

```ts
import { describe, expect, it } from 'vitest';
import { assertCssLength } from '../css-length';

describe('assertCssLength', () => {
  it.each([
    ['3.5rem', 'decimal rem'],
    ['56px', 'integer px'],
    ['100%', 'percent'],
    ['1fr', 'fr unit'],
    ['-1px', 'negative integer'],
    ['0', 'unitless zero'],
    ['10em', 'em'],
    ['50vh', 'vh'],
  ])('%s (%s) は許容される', (value) => {
    expect(() => assertCssLength(value, 'test')).not.toThrow();
  });

  it.each([
    ['3.5rem; }body{display:none;', 'CSS injection attempt'],
    ['calc(100% - 2px)', 'calc 関数'],
    ['var(--foo)', 'var 関数'],
    ['', 'empty string'],
    ['3.5remm', 'invalid unit'],
    ['rem', 'unit only'],
    ['url(http://evil.com)', 'url'],
  ])('%s (%s) は throw する', (value) => {
    expect(() => assertCssLength(value, 'test')).toThrow(/Invalid CSS length for test/);
  });

  it('label がエラーメッセージに含まれる', () => {
    expect(() => assertCssLength('bad', 'column[id].width')).toThrow(/column\[id\]\.width/);
  });
});
```

- [ ] **Step 3.2: fail 確認**

```bash
npm run test -- css-length.test
```

**期待**: FAIL (`assertCssLength` 未定義)。

- [ ] **Step 3.3: validator を実装**

`src/utils/css-length.ts` (新規):

```ts
/**
 * 簡易 CSS length token 検証。`{number}{unit?}` 形式のみ許容。
 *
 * 対応: integer / decimal / 負値 / `px|rem|em|%|fr|vw|vh|ch|ex|pt`
 * 非対応: `calc()` / 複合値 / 数学演算子。必要になった時点で拡張。
 *
 * 採用根拠: ResultTable の `width` / `minWidth` を `replaceSync` (CSS パーサ) に
 * 渡すため、不正値混入で CSS injection になる経路を封じる
 * (`docs/decisions.md [067]` / PR 9 spec § 4.2)。
 */
const CSS_LENGTH = /^-?\d+(\.\d+)?(px|rem|em|%|fr|vw|vh|ch|ex|pt)?$/;

export function assertCssLength(value: string, label: string): void {
  if (!CSS_LENGTH.test(value)) {
    throw new Error(`Invalid CSS length for ${label}: ${JSON.stringify(value)}`);
  }
}
```

- [ ] **Step 3.4: PASS 確認**

```bash
npm run test -- css-length.test
```

**期待**: 全 test PASS。

---

## Task 4: ResultTable refactor

**目的:** `el.style.setProperty` 2 件を Constructable Stylesheets 経路に切替。

**Files:**

- Modify: `src/components/ui/ResultTable.tsx`

- [ ] **Step 4.1: ResultTable.tsx を書換**

`src/components/ui/ResultTable.tsx` の中身を以下で完全置換:

```tsx
import type { ReactNode } from 'react';
import { useDynamicStyleSheet } from '@/hooks/useDynamicStyleSheet';
import { assertCssLength } from '@/utils/css-length';

export interface TableColumn<T> {
  key: string;
  header: string;
  headerAlign?: 'left' | 'right' | 'center';
  cellAlign?: 'left' | 'right' | 'center';
  /**
   * CSS length token (例: '3.5rem')。**hard-coded リテラルのみ許容**。
   * Constructable Stylesheets 経由で per-instance scoped rule に展開されるため、
   * `assertCssLength` で `{number}{unit?}` 形式以外を reject する (CSS injection 防御)。
   * user input を bridge する場合は事前 sanitize 必須。
   * 詳細は `docs/decisions.md [067]` / PR 9 spec § 4.2 / 4.3 参照。
   */
  width?: string;
  /** td に追加される className (typography / 色 / nowrap 等の修飾用) */
  className?: string;
  /** セルパディング。default: 'normal' (0.5rem 0.75rem)、compact (0.25rem 0.5rem) */
  cellPadding?: 'normal' | 'compact';
  render: (row: T, index: number) => ReactNode;
}

interface Props<T> {
  rows: T[];
  columns: TableColumn<T>[];
  getKey: (row: T) => string | number;
  /**
   * CSS length token (hard-coded literals only)。`TableColumn.width` と同じ origin discipline。
   * `assertCssLength` で形式 validate。
   */
  minWidth?: string;
  selectedIndex?: number | null;
  onRowClick?: (index: number) => void;
  renderHeader?: () => ReactNode;
}

const alignClass = (a?: 'left' | 'right' | 'center') =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

const paddingClass = (p?: 'normal' | 'compact') => (p === 'compact' ? 'px-2 py-1' : 'px-3 py-2');

function buildResultTableRules<T>(
  className: string,
  columns: TableColumn<T>[],
  minWidth?: string
): string {
  const rules: string[] = [];
  if (minWidth) rules.push(`.${className} { min-width: ${minWidth}; }`);
  columns.forEach((col, i) => {
    if (col.width) {
      rules.push(`.${className} > colgroup > col:nth-child(${i + 1}) { width: ${col.width}; }`);
    }
  });
  return rules.join('\n');
}

export function ResultTable<T>({
  rows,
  columns,
  getKey,
  minWidth,
  selectedIndex = null,
  onRowClick,
  renderHeader,
}: Props<T>) {
  if (minWidth !== undefined) assertCssLength(minWidth, 'minWidth');
  for (const c of columns) {
    if (c.width !== undefined) assertCssLength(c.width, `column[${c.key}].width`);
  }

  const dynClassName = useDynamicStyleSheet((className) =>
    buildResultTableRules(className, columns, minWidth)
  );

  return (
    <div className="rounded-lg border border-default overflow-hidden">
      {renderHeader && (
        <div className="flex flex-col gap-2 px-4 py-3 bg-subtle border-b border-default">
          {renderHeader()}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className={`w-full border-collapse result-table ${dynClassName}`}>
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-surface border-b border-default">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`caption text-muted font-semibold whitespace-nowrap ${paddingClass()} ${alignClass(col.headerAlign)}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isSelected = selectedIndex === i;
              return (
                <tr
                  key={getKey(row)}
                  onClick={onRowClick ? () => onRowClick(i) : undefined}
                  className="result-table-row"
                  data-selected={isSelected ? 'true' : 'false'}
                  data-clickable={onRowClick ? 'true' : 'false'}
                  aria-selected={onRowClick ? isSelected : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`caption text-default ${paddingClass(col.cellPadding)} ${alignClass(col.cellAlign)} ${col.className ?? ''}`}
                    >
                      {col.render(row, i)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**変更点 summary:**

- `import { useDynamicStyleSheet }` / `import { assertCssLength }` 追加
- `<table>` の `ref` callback 撤去 → `dynClassName` 適用
- `<col>` の `ref` callback / `className="result-table-col"` 撤去
- `width` / `minWidth` を `assertCssLength` で validate
- `buildResultTableRules` で per-instance scoped CSS rules を build

- [ ] **Step 4.2: 既存 unit test (もしあれば) と TypeScript 型 check**

```bash
npx astro check && npm run test -- ResultTable
```

**期待**: 型エラーなし、既存 ResultTable 関連 unit test (なければ skip) PASS。

---

## Task 5: ToggleGroup refactor

**目的:** `gridRef.current.style.setProperty('--toggle-cols', ...)` 1 件を Constructable Stylesheets 経路に切替。

**Files:**

- Modify: `src/components/ui/ToggleGroup.tsx`

- [ ] **Step 5.1: ToggleGroup.tsx を書換**

`src/components/ui/ToggleGroup.tsx` の中身を以下で完全置換:

```tsx
import { useDynamicStyleSheet } from '@/hooks/useDynamicStyleSheet';

interface Option<T> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  ariaLabel?: string;
  /** ボタンサイズ。デフォルトは `md` */
  size?: 'sm' | 'md';
  /** `grid`: 等幅グリッド（デフォルト）。`wrap`: flex-wrap で自然幅 */
  layout?: 'grid' | 'wrap';
}

/**
 * 排他選択トグル。
 *
 * style: global.css `@layer components` の `.toggle-grid`（CSS 変数 --toggle-cols 経由で
 * 動的列数）/ `.btn-toggle` / `.btn-toggle[aria-pressed="true"]` を参照。
 *
 * 動的列数は `useDynamicStyleSheet` 経由で per-instance scoped rule
 * (`.dyn-XXX { --toggle-cols: N; }`) として注入する。`setProperty` 経由 inline
 * style は CSP3 `style-src` 制約に抵触するため不採用 (`docs/decisions.md [067]`)。
 * `layout='wrap'` 時は dynamic rule 不要 (`.toggle-grid` 自体が unused) のため
 * sheet 生成を skip する。
 */
export function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  layout = 'grid',
}: Props<T>) {
  const isWrap = layout === 'wrap';
  const dynClassName = useDynamicStyleSheet((className) =>
    isWrap ? '' : `.${className} { --toggle-cols: ${options.length}; }`
  );

  const containerClass = isWrap
    ? 'bg-subtle rounded-lg border border-input p-1 flex flex-wrap gap-1 w-max max-w-full'
    : `bg-subtle rounded-lg border border-input p-1 toggle-grid ${dynClassName}`;
  const buttonSizeClass = size === 'sm' ? 'px-2.5 py-0.5' : 'px-3 py-1.5';

  return (
    <div className={containerClass} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`caption font-semibold btn-toggle rounded-lg whitespace-nowrap ${buttonSizeClass}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

**変更点 summary:**

- `useEffect` / `useRef` import を撤去
- `import { useDynamicStyleSheet }` 追加
- `gridRef` / `useEffect(() => { ...setProperty })` を全撤去
- `dynClassName` を `containerClass` に組み込み (grid layout 時のみ)
- `<div ref={gridRef}>` → `<div>` (ref 撤去)

- [ ] **Step 5.2: TypeScript 型 check**

```bash
npx astro check
```

**期待**: 型エラーなし。

---

## Task 6: global.css cleanup + C2 commit

**目的:** ResultTable の CSS 変数経路 (`--col-width` / `--result-table-min-width`) を global.css から撤去し、Constructable Stylesheet 一本化を完成させる。`.toggle-grid` の `--toggle-cols, 2` fallback は保持 (`layout='wrap'` 経路では使われないが default として温存)。

**Files:**

- Modify: `src/styles/global.css`

- [ ] **Step 6.1: global.css の `.result-table` / `.result-table-col` rule を撤去**

`src/styles/global.css` の line 337-344 付近 (PR 1.5 で導入された 2 rule):

```css
/* === PR 1.5: ResultTable component-scoped === */
.result-table {
  /* setProperty('--result-table-min-width', ...) で注入。未注入時は 0 (= no min-width 制約) */
  min-width: var(--result-table-min-width, 0);
}
.result-table-col {
  width: var(--col-width, auto);
}
```

を以下のコメント 1 行に置換 (削除でも可、PR の意図を残すためコメント保持):

```css
/* === PR 9 ([#304]): ResultTable は Constructable Stylesheets 経路に移行、
     `.result-table { min-width: var(...) }` / `.result-table-col { width: var(...) }`
     は撤去。`docs/decisions.md [067]` 参照 === */
```

`.result-table-row:nth-child(odd)` 以降の zebra / selection / border rule (line 345-365) は変更なし (CSS 変数非依存)。

`.toggle-grid` (line 313-) は変更なし。

- [ ] **Step 6.2: 全 unit test + 型 check**

```bash
npm run test
npx astro check
```

**期待**: 全 PASS。

- [ ] **Step 6.3: 全 e2e (通常 run、`withProductionCsp` 経路)**

```bash
npm run test:e2e
```

**期待**: 全 spec PASS (PR 9 refactor 後も既存機能 regression なし、CSP は現行 `unsafe-inline` 込みで通過)。

**NG 時の対応:**

- ResultTable / ToggleGroup spec (ulid-generator / uuid-v7 / config-converter / 他) で機能 fail → refactor の挙動 bug を Task 4-6 で fix
- VRT pixel diff → DOM / computed style diff を確認 (memory `feedback_subagent_verification_trust.md` 手順)、本質的差異なら fix、micro diff なら baseline 更新は **CI Linux 上のみ** (memory `feedback_vrt_ci_only.md`)

- [ ] **Step 6.4: C2 commit**

```bash
git add src/hooks/useDynamicStyleSheet.ts \
        src/hooks/__tests__/useDynamicStyleSheet.test.tsx \
        src/utils/css-length.ts \
        src/utils/__tests__/css-length.test.ts \
        src/components/ui/ResultTable.tsx \
        src/components/ui/ToggleGroup.tsx \
        src/styles/global.css
git commit -m "$(cat <<'EOF'
refactor(ResultTable,ToggleGroup): #304 setProperty を Constructable Stylesheets に refactor

PR 8 ([#303]) の親直接 E2E で発覚した CSP3 style-src 'self' 非互換の
setProperty 経路を Constructable Stylesheets ([067] (a) 案) に置換。
PR 10 ([#305]) の B 案最終 flip を unblock する。

新規:
- src/hooks/useDynamicStyleSheet.ts: SSR-safe (useId ベース) な共通 hook、
  `new CSSStyleSheet()` + `document.adoptedStyleSheets` を React lifecycle に
  integrate
- src/utils/css-length.ts: assertCssLength validator、replaceSync 経由の
  CSS injection 防御 (defense in depth)

修正:
- src/components/ui/ResultTable.tsx: el.style.setProperty('--result-table-min-width' /
  '--col-width', ...) 2 件を撤去、useDynamicStyleSheet で per-instance scoped
  rule を注入。`.result-table-col` class 付与も不要となり撤去
- src/components/ui/ToggleGroup.tsx: useEffect + gridRef + setProperty('--toggle-cols')
  を撤去、useDynamicStyleSheet で per-instance scoped rule に変更。
  layout='wrap' 経路は sheet 生成 skip
- src/styles/global.css: `.result-table { min-width: var(...) }` /
  `.result-table-col { width: var(...) }` 撤去 (Constructable Stylesheet
  一本化)。`.toggle-grid` の --toggle-cols, 2 fallback は wrap 経路の
  silent guard として保持

API 互換: ResultTable の width / minWidth、ToggleGroup の options は不変。
EOF
)"
```

---

## Task 7: Phase 2 strict CSP local verification (run-only / commit なし)

**目的:** ToggleGroup を使う 12 ツール spec を strict CSP (`style-src 'self'`) で local 実行し、PR 10 の最終 flip 時に violation 0 件で通ることを確認する。

**Files:**

- Create: `tests/e2e/_phase2-strict-verification.spec.ts` (一時、commit せず削除)

- [ ] **Step 7.1: 一時 verification spec を作成**

`tests/e2e/_phase2-strict-verification.spec.ts` (新規、`_` prefix で gitignore は不要だが意図を明示):

```ts
/**
 * PR 9 ([#304]) Phase 2 verification — local-only / commit せず削除。
 *
 * ToggleGroup を使う 12 ツール spec の代表ページを strict CSP (`style-src 'self'`)
 * で実行し、PR 9 refactor 後に violation 0 件であることを確認する。
 * PR 10 で `_headers` flip するときに ToggleGroup 経由 violation が再発しない
 * ことを保証する run-only ガード。
 */
import { test } from '@playwright/test';
import { applyStrictStyleSrcCsp, waitForReactHydration } from './helpers';

const TOGGLEGROUP_TARGETS = [
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

for (const path of TOGGLEGROUP_TARGETS) {
  test(`strict CSP: ${path} で violation 0`, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyStrictStyleSrcCsp(page);
      await page.goto(path);
      await waitForReactHydration(page);
      // ToggleGroup の `useEffect` 相当 (refactor 後は useDynamicStyleSheet) が
      // 初回 mount で発火する経路を検証するため、interaction 不要。1 frame 待つ。
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
      guard.assertNoViolations();
    } finally {
      await context.close();
    }
  });
}
```

**注意**: 実際の path は `npm run dev` で配信される URL に合わせる。`/tools/` prefix が付かないツールがあれば調整 (例: `/tools/url-encode` ではなく `/tools/url-encoder` 等)。`src/pages/tools/*.astro` を確認:

```bash
ls /Users/fumta/projects/devtools/src/pages/tools/
```

の出力に合わせて URL を補正。

- [ ] **Step 7.2: 一時 spec を実行**

```bash
npm run test:e2e -- _phase2-strict-verification.spec.ts
```

**期待**: 全 13 test PASS (TOGGLEGROUP_TARGETS は 13 path)。violation 0 件確認。

**NG 時の対応:**

- 特定 path で violation → そのページ内に未捕捉の `setProperty` / `style="..."` / `style={{}}` 経路あり (Task 4-6 で見落とし)。grep で再確認:
  ```bash
  grep -rn "setProperty\|\.style\.\|style=\{\{\|style=\"" src/components/tools/<対象ツール>.tsx
  ```
- ResultTable consumer (Ulid / UuidV7) の violation → Task 4 refactor 漏れ
- 全件 violation → Phase 0 spec も fail のはず、Task 1.3 に戻る

- [ ] **Step 7.3: 一時 spec を削除**

```bash
rm tests/e2e/_phase2-strict-verification.spec.ts
git status  # untracked のみで modified なし = OK
```

**commit せず**。Phase 2 verification は痕跡を残さない (PR 10 で `withProductionCsp` 自体が strict 化するため redundant になる)。

---

## Task 8: `inline-style-migration.test.ts` 反転 (setProperty を陽性 guard 化)

**目的:** PR 9 で codebase から `setProperty` が完全消滅するため、migration test の `setProperty` 除外を撤去し、新規再導入を陽性検出する guard に反転する。

**Files:**

- Modify: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 8.1: 失敗テストを書く (反転テスト = 既存 codebase で fail することを確認するために旧 test を先に直す)**

`src/utils/__tests__/inline-style-migration.test.ts` の以下を変更:

**JSDoc (line 8-18 付近):**

```ts
/**
 * #176 B 案 完了後の `style={{` / CSSOM 直接 mutation 撲滅の永続的回帰防止網。
 *
 * PR 1〜5b で漸進的に MIGRATED_FILES array を拡張してきたが、PR 6 で B 案完了に
 * 伴い array 管理を撤廃し、`src/components/**\/*.tsx` 全件を glob で自動カバー化。
 * これにより新規追加された .tsx も自動で検出網に含まれ、array 更新忘れによる
 * 偽陰性を撲滅する。
 *
 * PR 9 ([#304]) で `el.style.setProperty('--var', ...)` も CSP3 style-src の
 * 制御対象であることが判明 (`docs/decisions.md [067]`)。本 test は元々
 * `\.style\.X = Y` のみを検出し setProperty を意図的に除外していたが、
 * PR 9 で codebase から setProperty が完全消滅するため除外を撤去し、
 * 新規再導入を陽性検出する guard に反転する。
 *
 * 参照: docs/decisions.md [067]
 */
```

**TSX violation regex 部分 (line 47-49 付近):**

```ts
it('DOM style 属性代入 (element.style.X = ... / element.style.setProperty(...)) が残っていない', () => {
  const assignMatches = content.match(/\.style\.[a-zA-Z]+\s*=(?!=)/g);
  const setPropertyMatches = content.match(/\.style\.setProperty\s*\(/g);
  expect(assignMatches ?? []).toEqual([]);
  expect(setPropertyMatches ?? []).toEqual([]);
});
```

**陽性対照テスト (line 83-92 付近) を反転:**

```ts
it('意図的に style.X = を含む文字列が違反として検出される', () => {
  const malicious = `el.style.background = 'red';`;
  const matches = malicious.match(/\.style\.[a-zA-Z]+\s*=(?!=)/g);
  expect(matches?.length ?? 0).toBeGreaterThan(0);
});

it('意図的に setProperty(...) を含む文字列が違反として検出される', () => {
  // PR 9 で setProperty も陽性検出に変更 (`docs/decisions.md [067]`)
  const malicious = `ref.current.style.setProperty('--var', '1');`;
  const matches = malicious.match(/\.style\.setProperty\s*\(/g);
  expect(matches?.length ?? 0).toBeGreaterThan(0);
});
```

**旧 test `'setProperty は許容パターンとしてスルーされる'` (line 88-92) を削除** — 上記の陽性検出 test に置換済。

- [ ] **Step 8.2: テスト実行 (PR 9 refactor 完了後の codebase で PASS する想定)**

```bash
npm run test -- inline-style-migration
```

**期待**: 全 test PASS (Task 4 / 5 で setProperty 撤去済のため新 regex も violation 0 件)。

**NG 時の対応:**

- 特定 .tsx で setProperty が検出 → Task 4-6 の refactor 漏れ。grep で確認、修正。

- [ ] **Step 8.3: C3 commit**

```bash
git add src/utils/__tests__/inline-style-migration.test.ts
git commit -m "$(cat <<'EOF'
test(migration): #304 setProperty を陽性 guard に反転

PR 9 で codebase から `el.style.setProperty(...)` が完全消滅したため、
migration test 内で setProperty を意図的に除外していた filter を撤去し、
新規再導入を陽性検出する guard に反転する。

変更:
- JSDoc に [067] / PR 9 の経緯を追記
- TSX violation 検出 regex を `\.style\.X =` 単独から `\.style\.X =`
  + `\.style\.setProperty\(` の両方を陽性検出する形に拡張
- 「setProperty は許容パターンとしてスルーされる」test を削除し、
  「setProperty(...) は違反として検出される」陽性対照 test に置換

参照: docs/decisions.md [067]、PR 9 spec § 5.5
EOF
)"
```

---

## Task 9: docs update (decisions.md [067] 追補 + SoT 同期)

**目的:** PR 9 の outcome を `decisions.md [067]` に追補し、`docs/projects/issue-176-b-plan-progress.md` (SoT) の PR 9 行を merged 状態に更新する (merge 前なので「進行中」表記、PR merge 後 chore PR で hash 反映)。

**Files:**

- Modify: `docs/decisions.md`
- Modify: `docs/projects/issue-176-b-plan-progress.md`

- [ ] **Step 9.1: `decisions.md [067]` に PR 9 outcome section を追補**

`docs/decisions.md` の `[067]` entry の末尾 (line 2520 付近、`### 関連 PR / issue` の直前) に新 section を追加:

```markdown
### PR 9 outcome (2026-05-08)

**採用**: (a) Constructable Stylesheets。Phase 0 minimal repro spec で Chromium 実機検証 (陽性対照: 生 setProperty が violation 起こす / 陰性対照: `new CSSStyleSheet()` + `document.adoptedStyleSheets` は violation 起こさず適用される) を pass、refactor 確定。

**scope 拡張**: 当初 issue [#304] / 本 entry は ResultTable のみ言及だったが、PR 9 spec 起草時の調査で `config-converter` violation 1 件の真因が `ToggleGroup.tsx` の `setProperty('--toggle-cols', N)` (12 ツールで使用) と判明。PR 9 で **ResultTable + ToggleGroup を一括 refactor**。

**実装**:

- 共通 hook `src/hooks/useDynamicStyleSheet.ts` (SSR-safe / `useId` ベース) に Constructable Stylesheets 経路を集約
- `src/utils/css-length.ts` の `assertCssLength` で `replaceSync` 経由 CSS injection を防御
- `tests/e2e/csp-constructable-stylesheet.spec.ts` を永続 regression 検出網として残す (Chromium 動作変更 / CSP 仕様改訂への早期検知)
- `inline-style-migration.test.ts` の `setProperty` 除外を撤去し陽性 guard に反転

**残課題**: PR 10 で `_headers` / `<meta>` strict 化 + `stripMetaStyleSrc` 撤去 + test 群 strict 化を実施 (PR 8 から rebase で削除した 3 commit を再投入)。
```

- [ ] **Step 9.2: SoT の PR 9 行を更新**

`docs/projects/issue-176-b-plan-progress.md` の line 35 付近の進捗テーブル PR 9 行を更新:

変更前:

```markdown
| **PR 9 (新規)** | ResultTable `setProperty` の Constructable Stylesheets 化 (or CSS class swap) — CSP `style-src` strict 化の前提整備 | 未着手 | issue [#304](https://github.com/fumtas1k/devtools/issues/304) |
```

変更後 (PR 番号 / hash は merge 後の chore PR で別途反映、ここでは「実装中」状態を反映):

```markdown
| **PR 9** | ResultTable + ToggleGroup `setProperty` を Constructable Stylesheets 化 (issue 由来 ResultTable のみ → ToggleGroup 12 ツール影響を spec 起草時に発見し scope 拡張) | 実装中 | issue [#304](https://github.com/fumtas1k/devtools/issues/304) |
```

さらに、line 121 付近の `### PR 9 (issue [#304]、新規) — ResultTable setProperty refactor` section を、PR 9 実装内容を反映した形に更新:

変更前 (該当 section 全体):

```markdown
### PR 9 (issue [#304](https://github.com/fumtas1k/devtools/issues/304)、新規) — ResultTable `setProperty` refactor

- **scope (案)**: `src/components/ui/ResultTable.tsx:62-78` の `el.style.setProperty('--result-table-min-width' / '--col-width', ...)` を Constructable Stylesheets (`new CSSStyleSheet()` + `document.adoptedStyleSheets`) に書換、もしくは CSS class swap (有限 bucket の `.col-width-XX`) に書換
- **目的**: PR 10 の `style-src` strict 化で violation を起こさない実装に切替
- **判断ポイント**: (a) Constructable Stylesheets が Chromium で実際に CSP `style-src` を bypass するか実機検証、(b) UX 維持 (連続値の動的 width 調整) と spec 仕様非依存性のトレードオフ
- **影響範囲**: ResultTable を使う 11 spec (ulid-generator / uuid-v7 / config-converter / 等) の E2E gate が再 strict pass することで完了判定
```

変更後:

```markdown
### PR 9 (issue [#304](https://github.com/fumtas1k/devtools/issues/304)) — ResultTable + ToggleGroup `setProperty` refactor

- **scope 拡張 (spec 起草時に発見)**: 当初 issue は ResultTable のみ言及だったが、`ConfigConverter` は `ResultTable` 未使用で `config-converter` violation 1 件の真因は `ToggleGroup.tsx:41` の `setProperty('--toggle-cols', N)` (12 ツールで使用) と確認。PR 9 で **ResultTable + ToggleGroup を一括 refactor** (PR 10 strict 化で全 12 ツールが再違反するのを防ぐ)
- **採用**: (a) Constructable Stylesheets。Phase 0 minimal repro spec (`tests/e2e/csp-constructable-stylesheet.spec.ts`、永続) で Chromium 実機検証 pass を確認後 refactor
- **共通 hook**: `src/hooks/useDynamicStyleSheet.ts` (SSR-safe / `useId` ベース) に Constructable Stylesheets 経路を集約。`assertCssLength` で CSS injection 防御
- **migration test 反転**: `inline-style-migration.test.ts` の `setProperty` 除外を撤去し陽性 guard に変更
- **infra/feature 分離例外**: `applyStrictStyleSrcCsp` helper + Phase 0 spec を本 PR に bundle (PR 5b と同 judgement、`feedback_infra_feature_separation.md` 例外条項)
- **subagent 非委譲**: 親 Opus 直接実装 (PR 7a / 7b / 8 と同パターン、memory `feedback_subagent_verification_trust.md`)
- **後続**: PR 10 ([#305]) で `_headers` / `<meta>` strict 化 + `stripMetaStyleSrc` 撤去 + test 群 strict 化 (PR 8 rebase で削除した 3 commit 再投入)
```

- [ ] **Step 9.3: docs format check**

```bash
npx prettier --check 'docs/**/*.md'
```

**期待**: 違反なし。違反あれば `npx prettier --write` で修正。

- [ ] **Step 9.4: C4 commit**

```bash
git add docs/decisions.md docs/projects/issue-176-b-plan-progress.md
git commit -m "$(cat <<'EOF'
docs: #304 PR 9 outcome を [067] に追補 + SoT 同期

- decisions.md [067]: PR 9 outcome section 追加 (採用 = Constructable
  Stylesheets / scope 拡張 = ToggleGroup 同梱 / 実装サマリ / PR 10 残課題)
- issue-176-b-plan-progress.md: PR 9 行を「実装中」+ scope 拡張記載に更新、
  詳細 section に ToggleGroup 同梱 / Phase 0 永続検証 / migration test 反転 /
  subagent 非委譲方針を追記

merge 後の hash 反映は別 chore PR で対応 (PR 6/7a/7b/8 と同パターン)。
EOF
)"
```

---

## Task 10: PR 作成

**目的:** branch を push し、`develop` ベースで PR 作成。

**Files:**

- Create: `/tmp/claude/pr_body.md`

- [ ] **Step 10.1: pre-create check (CLAUDE.md 必須 4 点)**

```bash
# 1. develop ベース一致
git merge-base develop HEAD && git merge-base origin/develop HEAD
# 2. スコープ確認 (差分 file 一覧)
git diff origin/develop --name-only
# 3. aria-* 削除なし
git diff origin/develop -- 'src/**/*.tsx' 'src/**/*.astro' | grep -E '^-.*aria-' || echo "aria 削除なし OK"
# 4. branch 名確認 (既に作成済)
git branch --show-current
```

**期待**:

- `git merge-base` 出力が同一 hash (= develop ベース) ✅
- 差分 file が spec § 4 / 6 で列挙したものと一致
- aria-\* 削除なし
- branch = `feature/issue-176-b9-resulttable-togglegroup-csp-refactor`

- [ ] **Step 10.2: PR description を `/tmp/claude/pr_body.md` に書出**

`/tmp/claude/pr_body.md` (Write tool):

```markdown
## 概要

PR 8 ([#303]) の親直接 E2E で発覚した CSP3 `style-src 'self'` 非互換の `setProperty` 経路 (issue [#304] / `decisions.md [067]`) を Constructable Stylesheets に refactor。PR 10 ([#305]) の B 案最終 flip を unblock する。

## 経緯

- 11 件 violation 内訳: ResultTable (Ulid + UuidV7 = 10 件) + ToggleGroup (config-converter = 1 件)
- 当初 issue [#304] は ResultTable のみ言及だったが、`ConfigConverter` は `ResultTable` 未使用 → `config-converter` violation の真因は `ToggleGroup.tsx:41` の `setProperty('--toggle-cols', N)` (本 PR spec 起草時の調査で確認)
- ToggleGroup は 12 ツールで使用、PR 10 strict 化で全違反するため同 PR で対応必須

## 変更

- `src/hooks/useDynamicStyleSheet.ts` 新規 — Constructable Stylesheets ラッパ hook (SSR-safe / `useId` ベース)
- `src/utils/css-length.ts` 新規 — CSS length validator (CSS injection 防御)
- `src/components/ui/ResultTable.tsx` — `el.style.setProperty` 2 件撤去 → hook 経由 per-instance scoped CSS
- `src/components/ui/ToggleGroup.tsx` — `gridRef.current.style.setProperty` 1 件撤去 → hook 経由 (`layout='wrap'` 経路は sheet 生成 skip)
- `src/styles/global.css` — `.result-table` / `.result-table-col` の var 経由 rule 撤去 (Constructable Stylesheet 一本化)、`.toggle-grid` の `--toggle-cols, 2` fallback は保持
- `tests/e2e/helpers.ts` — `applyStrictStyleSrcCsp` 追加 (PR 10 で削除候補)
- `tests/e2e/csp-constructable-stylesheet.spec.ts` 新規 — 陽性 + 陰性対照 (永続 regression 検出網)
- `src/utils/__tests__/inline-style-migration.test.ts` — `setProperty` 除外を撤去、陽性 guard に反転

## 検証

- Phase 0: minimal repro spec で Chromium 動作実機確認 (陽性 + 陰性対照 PASS) ✅
- Phase 2: ToggleGroup consumer 12 ツール spec を strict CSP で local run、violation 0 件 ✅
- 全 unit + astro check + 全 e2e (通常 run) PASS ✅
- VRT は CI Linux runner のみで検証 (memory `feedback_vrt_ci_only.md`)

## scope 外

- `_headers` / `<meta>` strict 化 → PR 10 ([#305])
- `STRICT_PRODUCTION_CSP` 定数の src 側 export → PR 10 で `PRODUCTION_CSP` 自体を flip

## 関連

- closes [#304](https://github.com/fumtas1k/devtools/issues/304)
- unblocks [#305](https://github.com/fumtas1k/devtools/issues/305) (PR 10)
- post-mortem: `docs/decisions.md [067]`
- spec: `docs/superpowers/specs/2026-05-08-issue-176-b9-resulttable-togglegroup-csp-refactor-design.md`
- plan: `docs/superpowers/plans/2026-05-08-issue-176-b9-resulttable-togglegroup-csp-refactor.md`
- SoT: `docs/projects/issue-176-b-plan-progress.md`
```

- [ ] **Step 10.3: branch を push**

```bash
git push -u origin feature/issue-176-b9-resulttable-togglegroup-csp-refactor
```

**期待**: push 成功、`origin/feature/issue-176-b9-resulttable-togglegroup-csp-refactor` 作成。

- [ ] **Step 10.4: PR 作成 (`--base develop` + `--body-file` 必須)**

```bash
gh pr create \
  --base develop \
  --title "refactor(ResultTable,ToggleGroup): #176 B 案 PR 9 — setProperty を Constructable Stylesheets に refactor (#304)" \
  --body-file /tmp/claude/pr_body.md
```

**期待**: PR URL が出力される。

- [ ] **Step 10.5: PR URL を user に報告**

PR が作成されたら URL を user に共有。CI green + human review 完了まで merge しない (memory `feedback_review_required_before_merge.md`)。

---

## 完了判定

- [ ] Phase 0 minimal repro spec PASS (陽性対照 + 陰性対照)
- [ ] Phase 1 全 e2e PASS (`withProductionCsp` 通常 run)
- [ ] Phase 2 strict CSP local verification 12 ツール spec で violation 0 件 (run-only / commit なし)
- [ ] 全 unit (vitest) + astro check PASS
- [ ] migration test の陽性 guard が動作することを meta-test で確認
- [ ] `docs/decisions.md [067]` 追補完了
- [ ] SoT 更新完了 (PR 9 行 + 詳細 section)
- [ ] PR 作成完了 (URL を user に共有)
- [ ] CI green
- [ ] human review approval

---

## Self-review note

**Spec coverage check**: spec § 1〜10 の全要件 → Task 1〜10 で網羅 ✅

- spec § 4.1 useDynamicStyleSheet → Task 2
- spec § 4.2 assertCssLength → Task 3
- spec § 4.3 ResultTable refactor → Task 4
- spec § 4.4 ToggleGroup refactor → Task 5
- spec § 4.5 非対称設計 → Task 6 (global.css)
- spec § 5.1 helpers parameterize → Task 1.1
- spec § 5.2 minimal repro → Task 1.2
- spec § 5.3 Phase 1 e2e → Task 6.3
- spec § 5.4 Phase 2 verification → Task 7
- spec § 5.5 migration test → Task 8
- spec § 6 commit 順 → Task 1.4 / 6.4 / 8.3 / 9.4 (C1/C2/C3/C4)
- spec § 9 PR description → Task 10.2
- spec § 10 完了判定 → 本 plan 末尾

**Placeholder scan**: TODO / TBD / FIXME なし、全コードブロックは具体的内容入り、参照される hook / validator / regex は事前 task で定義済 ✅

**Type consistency**:

- `useDynamicStyleSheet(buildRules: (className: string) => string): string` — Task 2 で定義、Task 4 / 5 で同 signature 使用 ✅
- `assertCssLength(value: string, label: string): void` — Task 3 で定義、Task 4 で `'minWidth'` / `column[${c.key}].width` の label 使用 ✅
- `applyStrictStyleSrcCsp(page: Page): Promise<CspGuard>` — Task 1.1 で定義、Task 1.2 / Task 7 で使用 ✅
