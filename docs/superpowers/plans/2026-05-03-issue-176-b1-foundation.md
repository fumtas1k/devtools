# #176 B 案 PR 1: 基礎工事 + ui/\* simple 11 ファイル移行 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/styles/global.css` に意味クラスを追加し、`src/components/ui/*` の simple 11 ファイル（ClearButton / BareInput / DownloadButton / ActionButton / CopyButton / Section / ErrorMessage / OutputField / Select / ToggleGroup / CountInput）から `style={{}}` を撲滅する。あわせて進捗検知 vitest と Playwright visual regression baseline を導入し、後続 PR 1.5 / PR 2-5 の foundation を確立する。

**Architecture:** Tailwind utility (既存) + 意味クラス（`global.css` の `@layer components` に集約）の組み合わせで `style={{}}` を className に置換。dynamic state は条件 className 切替で表現。`ResultTable` / `InputField` は API redesign が必要なため本 PR スコープ外（PR 1.5 で扱う）。`src/utils/styles.ts` の `colors` / `bodyEmphasis` / `caption` は引き続き残す（PR 1〜PR 5 の暫定参照、PR 6 で削除）。

**Tech Stack:** Tailwind CSS v4（`@theme` / `@layer components`）、React 19、Vitest（unit + 進捗検知）、Playwright（`toHaveScreenshot()` で visual regression）。

---

## 重要な前提

- spec: `docs/superpowers/specs/2026-05-03-issue-176-b-style-src-elimination-design.md` を必読
- 本 PR は B 案 7 PR の 1 番目。後続が同パターンを踏襲するため、**意味クラスの命名**と**migration の手順**を確立する位置付け
- `src/components/ui/ResultTable.tsx`（8 styles, `cellStyle: CSSProperties` escape hatch）と `src/components/ui/InputField.tsx`（4 styles, runtime computed border）は **本 PR スコープ外**。PR 1.5 で扱う
- `src/components/ui/__tests__/` 配下の既存 vitest は触らない（無関係）
- `tools/*` は本 PR スコープ外（後続 PR）

---

## ファイル構成

| 種別   | パス                                                 | 役割                                                                              |
| ------ | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Modify | `src/styles/global.css`                              | `@layer components` に意味クラス追加（typography / color / bg / border / layout） |
| Create | `src/utils/__tests__/inline-style-migration.test.ts` | 進捗検知 vitest（MIGRATED_FILES array に対象ファイルを順次追加）                  |
| Create | `tests/e2e/visual-regression.spec.ts`                | Playwright `toHaveScreenshot()` ベースの全 18 ページ baseline 撮影                |
| Modify | `src/components/ui/ClearButton.tsx`                  | 1 style → className                                                               |
| Modify | `src/components/ui/BareInput.tsx`                    | 1 style → className + 条件 className 切替（error 状態）                           |
| Modify | `src/components/ui/DownloadButton.tsx`               | 1 style (span wrapper) → className                                                |
| Modify | `src/components/ui/ActionButton.tsx`                 | 1 style → variant 別 BEM-style className + state-driven className                 |
| Modify | `src/components/ui/CopyButton.tsx`                   | 2 styles → 条件 className（copied 状態）                                          |
| Modify | `src/components/ui/Section.tsx`                      | 3 styles → className                                                              |
| Modify | `src/components/ui/ErrorMessage.tsx`                 | 3 styles → className                                                              |
| Modify | `src/components/ui/OutputField.tsx`                  | 3 styles → className                                                              |
| Modify | `src/components/ui/Select.tsx`                       | 3 styles → className                                                              |
| Modify | `src/components/ui/ToggleGroup.tsx`                  | 2 styles → 条件 className                                                         |
| Modify | `src/components/ui/CountInput.tsx`                   | 3 styles → className                                                              |

---

## Task 1: 意味クラスを `global.css` に追加

**Files:**

- Modify: `src/styles/global.css`（末尾に `@layer components` ブロック追加）

- [ ] **Step 1: 現状の `global.css` 末尾を確認**

```bash
tail -20 src/styles/global.css
```

期待: `@theme { ... }` ブロックで終わっているか、その後ろに既存スタイルが少しある状態。

- [ ] **Step 2: ファイル末尾に `@layer components` ブロックを追加**

`src/styles/global.css` の末尾（ファイル一番下）に以下を追記:

```css
/* ============================================================
 * 意味クラス（#176 B 案 PR 1 で導入）
 *
 * 目的: React の `style={{}}` (CSP `style-src 'unsafe-inline'` 必須)を
 * className に移行するための共有クラス群。`src/utils/styles.ts` の
 * `colors` / `bodyEmphasis` / `caption` を CSS 化したもの。
 *
 * 命名規約: 意味ベース（`.body-emphasis` / `.text-primary` / `.section-card`）
 * Tailwind utility 風命名（`.text-md-primary`）は禁止 — Tailwind 生成 class と衝突回避
 *
 * 詳細: docs/superpowers/specs/2026-05-03-issue-176-b-style-src-elimination-design.md
 * ============================================================ */

@layer components {
  /* Typography */
  .body-emphasis {
    font-size: 1.0625rem;
    font-weight: 700;
    line-height: 1.7;
    letter-spacing: 0.02em;
  }
  .caption {
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1.7;
    letter-spacing: 0.02em;
  }

  /* Color: text */
  .text-token {
    color: var(--color-text);
  }
  .text-muted {
    color: var(--color-muted);
  }
  .text-primary-token {
    color: var(--color-primary);
  }
  .text-link {
    color: var(--color-link);
  }
  .text-on-primary {
    color: var(--color-text-on-primary);
  }
  .text-error {
    color: var(--color-error);
  }
  .text-success {
    color: var(--color-success);
  }

  /* Color: background */
  .bg-token {
    background: var(--color-bg);
  }
  .bg-surface {
    background: var(--color-bg-surface);
  }
  .bg-subtle {
    background: var(--color-bg-subtle);
  }
  .bg-primary-token {
    background: var(--color-primary);
  }
  .bg-error {
    background: var(--color-error-bg);
  }
  .bg-success {
    background: var(--color-success-bg);
  }
  .bg-transparent-token {
    background: transparent;
  }

  /* Color: border */
  .border-token {
    border: 1px solid var(--color-border);
  }
  .border-input {
    border: 1px solid var(--color-border-input);
  }
  .border-error {
    border: 1px solid var(--color-error);
  }
  .border-success {
    border: 1px solid var(--color-success);
  }
  .border-primary-token {
    border: 1px solid var(--color-primary);
  }
  .border-bg-subtle {
    border: 1px solid var(--color-bg-subtle);
  }

  /* Border-color only (for layouts that already set border-width via Tailwind) */
  .border-color-token {
    border-color: var(--color-border);
  }
  .border-color-input {
    border-color: var(--color-border-input);
  }
  .border-color-error {
    border-color: var(--color-error);
  }

  /* ActionButton variant classes (BEM-style for variant + state combos) */
  .btn-action {
    /* ベース: variant 別の上書きと併用 */
  }
  .btn-action--default {
    background: var(--color-bg-subtle);
    color: var(--color-text);
    border: 1px solid var(--color-border-input);
  }
  .btn-action--default:disabled {
    background: var(--color-bg-subtle);
    border-color: var(--color-border-input);
    color: var(--color-muted);
  }
  .btn-action--primary {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    border: 1px solid var(--color-primary);
  }
  .btn-action--primary:disabled {
    background: var(--color-bg-subtle);
    border-color: var(--color-bg-subtle);
    color: var(--color-muted);
  }
  .btn-action--secondary {
    background: transparent;
    color: var(--color-primary);
    border: 1px solid var(--color-primary);
  }
  .btn-action--secondary:disabled {
    background: transparent;
    border-color: var(--color-border);
    color: var(--color-muted);
  }
  .btn-action--danger {
    background: transparent;
    color: var(--color-error);
    border: 1px solid var(--color-error);
  }
  .btn-action--danger:disabled {
    background: var(--color-bg-subtle);
    border-color: var(--color-error);
    color: var(--color-muted);
  }

  /* CopyButton state classes */
  .btn-copy-idle {
    color: var(--color-muted);
  }
  .btn-copy-success {
    color: var(--color-success);
    border-color: var(--color-success);
  }

  /* Section card layout */
  .section-card {
    border-color: var(--color-border);
    background: var(--color-bg);
  }
  .section-card-header {
    background: var(--color-bg-subtle);
    border-bottom-color: var(--color-border);
    color: var(--color-text);
  }
}
```

> 注: クラス名で `.text-primary` / `.bg-primary` / `.border-primary` のような Tailwind 既存 utility と一致しそうなものは `.text-primary-token` 等にして衝突を回避している（Tailwind v4 は `text-primary` を生成しないが将来の追加を想定して `-token` suffix）。`.text-error` / `.text-success` は Tailwind 既存とぶつからないため suffix 無し。

- [ ] **Step 3: build して CSS が反映されていることを確認**

```bash
npm run build 2>&1 | tail -3
grep -c "section-card" dist/_astro/*.css
```

期待: `dist/_astro/*.css` 内に `.section-card` が出現（1 件以上）。

- [ ] **Step 4: コミット**

```bash
git add src/styles/global.css
git commit -m "feat(styles): #176 B 案の意味クラス基盤を global.css に追加"
```

---

## Task 2: 進捗検知 vitest を追加

**Files:**

- Create: `src/utils/__tests__/inline-style-migration.test.ts`

- [ ] **Step 1: 新規ファイル作成**

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * #176 B 案 progressive migration tracker.
 *
 * 移行済みファイルに `style={{}}` (React inline style) が再混入していないことを assert する。
 * - 各 PR で MIGRATED_FILES array に対象ファイルを追加
 * - PR 6 (flip + cleanup) で `MIGRATED_FILES` を `await glob('src/components/**\/*.tsx')` 全件に置換し、
 *   `style={{}}` 完全撲滅を CI で gate する
 *
 * 詳細: docs/superpowers/specs/2026-05-03-issue-176-b-style-src-elimination-design.md
 */

const MIGRATED_FILES: readonly string[] = [
  // PR 1 で順次追加:
  'src/components/ui/ClearButton.tsx',
  'src/components/ui/BareInput.tsx',
  'src/components/ui/DownloadButton.tsx',
  'src/components/ui/ActionButton.tsx',
  'src/components/ui/CopyButton.tsx',
  'src/components/ui/Section.tsx',
  'src/components/ui/ErrorMessage.tsx',
  'src/components/ui/OutputField.tsx',
  'src/components/ui/Select.tsx',
  'src/components/ui/ToggleGroup.tsx',
  'src/components/ui/CountInput.tsx',
];

describe('#176 B 案 progressive migration tracker', () => {
  for (const file of MIGRATED_FILES) {
    it(`${file} に style={{}} が残っていない`, () => {
      const content = readFileSync(path.resolve(process.cwd(), file), 'utf-8');
      expect(content).not.toMatch(/style=\{\{/);
    });
  }
});
```

- [ ] **Step 2: vitest 実行 — 現時点では各ファイルがまだ未移行なので 11 件 fail することを確認**

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts 2>&1 | tail -20
```

期待: 11 tests fail（各 ui ファイル名で「style={{}} が残っていない」が fail）。これが期待通り。

> このテストは TDD の「最初は fail」を表現する。後続 Task 4-14 で各ファイル移行を完了するたびに該当テストが pass に変わる。Task 15 で全 11 件 pass を確認する。

- [ ] **Step 3: コミット**

```bash
git add src/utils/__tests__/inline-style-migration.test.ts
git commit -m "test(security): #176 B 案 progressive migration tracker vitest を追加"
```

---

## Task 3: Playwright `toHaveScreenshot()` baseline 導入

**Files:**

- Create: `tests/e2e/visual-regression.spec.ts`
- Create: `tests/e2e/visual-regression.spec.ts-snapshots/` (Playwright が baseline 画像を生成する)

- [ ] **Step 1: 新規ファイル作成**

```ts
import { expect, test } from '@playwright/test';
import { waitForReactHydration } from './helpers';

/**
 * #176 B 案 visual regression baseline.
 *
 * 全 18 ページ × 主要 viewport (Desktop 1280×800 / Mobile 390×844) の screenshot を
 * 保存し、後続の style migration PR で見た目が崩れていないことを CI で gate する。
 *
 * 運用:
 * - baseline は CI Linux runner で生成（mac とのフォントレンダリング差で flake 回避）
 * - ローカル mac で diff が出ても `--update-snapshots` で更新せず CI で再 verify する
 * - flake 頻発時は `maxDiffPixels` 緩和や `mask` 適用で対処
 *
 * 詳細: docs/superpowers/specs/2026-05-03-issue-176-b-style-src-elimination-design.md
 */

const PAGES = [
  '/',
  '/about',
  '/privacy',
  '/tools/ulid-generator',
  '/tools/uuid-v7',
  '/tools/dummy-text',
  '/tools/qr-code',
  '/tools/jan-code',
  '/tools/gs1-databar',
  '/tools/qr-ticket',
  '/tools/qr-reader',
  '/tools/url-encode',
  '/tools/jwt-decoder',
  '/tools/base64',
  '/tools/json-xml',
  '/tools/json-csv',
  '/tools/encoding-converter',
  '/tools/config-converter',
] as const;

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`visual regression - ${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport });

    for (const url of PAGES) {
      test(`${url} の screenshot が baseline と一致`, async ({ page }) => {
        await page.goto(url);
        // ハイドレーション完了を待ってから screenshot（React island がある tools のみ意味あり、
        // 静的ページでも害はない）
        await waitForReactHydration(page).catch(() => {
          // about / privacy 等の静的ページは hydration 対象が無いため timeout する。
          // その場合は単にスキップして continue。
        });
        await expect(page).toHaveScreenshot({
          fullPage: true,
          maxDiffPixels: 100,
          // フォントレンダリングの微差を許容
          maxDiffPixelRatio: 0.001,
        });
      });
    }
  });
}
```

- [ ] **Step 2: ローカル build + Playwright を `--update-snapshots` で実行して baseline を生成**

```bash
npm run pretest:e2e
npx playwright test tests/e2e/visual-regression.spec.ts --workers=1 --update-snapshots 2>&1 | tail -10
```

期待: 18 × 2 = **36 baseline 画像** が生成される（`tests/e2e/visual-regression.spec.ts-snapshots/` 配下）。1〜2 分。

> 注: ローカル mac で生成した baseline は CI Linux runner と pixel 差が出る。**ローカル baseline は仮のもの**として一旦 commit し、後続 step 3-4 で CI 経由 baseline に置換する。

- [ ] **Step 3: 仮 baseline を commit して push し、CI で fail させる**

```bash
git add tests/e2e/visual-regression.spec.ts tests/e2e/visual-regression.spec.ts-snapshots/
git commit -m "test(e2e): visual regression spec とローカル仮 baseline を追加（#176 B 案 PR 1）"
git push -u origin feature/issue-176-b1-foundation
```

CI で visual regression spec が fail（mac baseline と Linux runner で pixel 差）することを確認:

```bash
sleep 60
gh run list --branch feature/issue-176-b1-foundation --limit 1 --json conclusion,databaseId --jq '.[0]'
gh run view <run-id> --log-failed 2>&1 | grep -A2 "visual-regression" | head -20
```

期待: e2e job が fail、`maxDiffPixels exceeded` 系のメッセージが visual-regression spec で出る。

- [ ] **Step 4: CI 由来の baseline を生成して上書きする workflow_dispatch を追加** _(段階的、本 PR スコープ簡素化のため Step 5 で代替)_

> 本 PR では visual regression baseline の自動再生成 workflow まで含めると scope が膨らむため、**Step 5 で「ローカル baseline をそのまま使い、CI が初回 fail → engineer が手動で `--update-snapshots` を ローカルで再実行 → push して baseline を CI Linux runner に揃える」運用** を採る。CI 自動再生成は別 issue（follow-up）で扱う。

- [ ] **Step 5: ローカル baseline を CI で自動更新する暫定運用を確立**

GitHub Actions の `workflow_dispatch` で baseline を再生成する補助 workflow `.github/workflows/update-visual-baseline.yml` を作成:

```yaml
name: Update Visual Regression Baseline

on:
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  update-baseline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.head_ref || github.ref_name }}
          token: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Playwright ブラウザをインストール
        run: npx playwright install --with-deps chromium
      - name: 本番相当アセットを build
        run: npm run build
      - name: Visual regression baseline を再生成
        run: npx playwright test tests/e2e/visual-regression.spec.ts --workers=1 --update-snapshots
      - name: 変更があれば commit & push
        run: |
          if [ -n "$(git status --porcelain tests/e2e/visual-regression.spec.ts-snapshots/)" ]; then
            git config user.name "github-actions[bot]"
            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
            git add tests/e2e/visual-regression.spec.ts-snapshots/
            git commit -m "test(e2e): visual regression baseline を CI Linux runner で再生成"
            git push
          else
            echo "baseline 差分なし、commit skip"
          fi
```

- [ ] **Step 6: workflow_dispatch を実行して CI baseline に置換**

```bash
git add .github/workflows/update-visual-baseline.yml
git commit -m "ci: visual regression baseline 再生成用 workflow_dispatch を追加（#176 B 案 PR 1）"
git push
```

GitHub UI（または `gh workflow run`）で `Update Visual Regression Baseline` workflow を `feature/issue-176-b1-foundation` ブランチで手動 trigger:

```bash
gh workflow run "Update Visual Regression Baseline" --ref feature/issue-176-b1-foundation
sleep 120
gh run list --workflow="Update Visual Regression Baseline" --branch feature/issue-176-b1-foundation --limit 1 --json conclusion,databaseId --jq '.[0]'
```

期待: workflow が成功し、CI Linux runner で生成した baseline で git push が走り、`feature/issue-176-b1-foundation` ブランチが更新される。

- [ ] **Step 7: ローカルを更新された CI baseline に同期**

```bash
git pull origin feature/issue-176-b1-foundation
```

- [ ] **Step 8: 通常の test workflow が visual regression spec で pass することを確認**

```bash
gh run list --workflow=test.yml --branch feature/issue-176-b1-foundation --limit 1 --json conclusion --jq '.[0]'
```

期待: `"conclusion": "success"`（test job + e2e job 両方 green、visual-regression spec も pass）。

> ローカル mac での再実行時は CI baseline と差が出る可能性あり。`--update-snapshots` で更新せず、CI 結果を信頼する運用。

---

## Task 4: ClearButton.tsx 移行（template walkthrough）

**目的**: 最も simple な ui ファイル（1 style、static のみ）で migration の template を確立する。

**Files:**

- Modify: `src/components/ui/ClearButton.tsx`

- [ ] **Step 1: 現状確認**

```bash
cat src/components/ui/ClearButton.tsx
```

該当部分（style 定義）:

```tsx
className={`rounded-lg px-3 py-1.5 transition-colors ${className}`}
style={{
  ...caption,
  color: colors.muted,
  whiteSpace: 'nowrap',
  background: 'transparent',
  border: 'none',
}}
```

- [ ] **Step 2: style → className 化**

`src/components/ui/ClearButton.tsx` を以下のように修正:

- `style={{}}` 全削除
- `className` に `caption text-muted whitespace-nowrap bg-transparent-token border-none` を追加（`bg-transparent-token` は global.css で定義済み、`whitespace-nowrap` / `border-none` は Tailwind utility）
- `colors`, `caption` の import を削除

修正後の該当部分:

```tsx
className={`rounded-lg px-3 py-1.5 transition-colors caption text-muted whitespace-nowrap bg-transparent-token border-none ${className}`}
```

import 文も整理:

```tsx
// Before
import { caption, colors } from '@/utils/styles';

// After (style import が不要になったので削除)
```

- [ ] **Step 3: 進捗 vitest が pass することを確認**

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts 2>&1 | grep "ClearButton"
```

期待: `✓ src/components/ui/ClearButton.tsx に style={{}} が残っていない` が pass。

- [ ] **Step 4: 単体 build + 該当 component を含む E2E spec を回す（download-button.spec.ts は ClearButton と同じ ui 階層）**

```bash
npm run build 2>&1 | tail -3
npm run pretest:e2e
npx playwright test tests/e2e/download-button.spec.ts --workers=1 --reporter=list 2>&1 | tail -10
```

期待: 既存テスト pass を維持。visual regression は次の commit と一括で確認。

- [ ] **Step 5: コミット**

```bash
git add src/components/ui/ClearButton.tsx
git commit -m "refactor(ui): ClearButton の style={{}} を className に移行 (#176 B 案 PR 1)"
```

---

## Task 5: BareInput.tsx 移行（error 状態の条件 className）

**Files:**

- Modify: `src/components/ui/BareInput.tsx`

- [ ] **Step 1: 現状確認**

```bash
cat src/components/ui/BareInput.tsx
```

該当部分:

```tsx
className={`rounded-md border w-full${className ? ` ${className}` : ''}`}
style={{
  ...caption,
  ...(mono ? { fontFamily: 'monospace' } : {}),
  padding: '0.4rem 0.5rem',
  borderColor: error ? colors.error : colors.borderInput,
  background: colors.bg,
  color: colors.text,
}}
```

- [ ] **Step 2: 修正**

- `style={{}}` 削除
- className に以下を追加:
  - 静的: `caption bg-token text-token`
  - padding (`padding: '0.4rem 0.5rem'`): Tailwind に該当 utility 無いので `style={{ '--bare-input-pad-y': '0.4rem' }}` も使えない（`style=` 属性 NG）→ 既存の `border w-full` の隣に Tailwind 任意値 `px-2 py-[0.4rem]` を追加（Tailwind v4 build 時 inline 解決可）
  - mono の場合の monospace: `mono` prop 由来で動的 → `font-mono` Tailwind utility を条件 className で
  - error 時 borderColor: 条件 className で `border-color-error` / `border-color-input` 切替

```tsx
import type { InputHTMLAttributes } from 'react';
// `colors` / `caption` import は不要になる場合は削除（mono prop が使われていれば残す）

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  error?: boolean;
}

export function BareInput({ mono = false, error = false, className = '', ...rest }: Props) {
  return (
    <input
      className={`rounded-md border w-full caption bg-token text-token px-2 py-[0.4rem] ${
        mono ? 'font-mono' : ''
      } ${error ? 'border-color-error' : 'border-color-input'} ${className}`}
      {...rest}
    />
  );
}
```

> 注: 既存の `colors` / `caption` import が style 用途のみだった場合は完全削除。他用途で参照していれば残す（今回のサンプルでは style 用途のみ）。

- [ ] **Step 3: 進捗 vitest 確認 + commit（Task 4 と同パターン）**

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts 2>&1 | grep "BareInput"
git add src/components/ui/BareInput.tsx
git commit -m "refactor(ui): BareInput の style={{}} を className に移行 (#176 B 案 PR 1)"
```

---

## Task 6: DownloadButton.tsx 移行

**Files:**

- Modify: `src/components/ui/DownloadButton.tsx`

- [ ] **Step 1: 該当 style 確認**

`src/components/ui/DownloadButton.tsx` 内の唯一の style:

```tsx
<span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
```

- [ ] **Step 2: Tailwind utility に置換**

`display: inline-flex` → `inline-flex`、`alignItems: center` → `items-center`、`gap: 0.375rem` → `gap-1.5` (Tailwind v4 で `0.375rem` = `gap-1.5`)。

```tsx
<span className="inline-flex items-center gap-1.5">
  <DownloadIcon />
  {label}
</span>
```

- [ ] **Step 3: 進捗 vitest + commit**

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts 2>&1 | grep "DownloadButton"
git add src/components/ui/DownloadButton.tsx
git commit -m "refactor(ui): DownloadButton の style={{}} を className に移行 (#176 B 案 PR 1)"
```

---

## Task 7: ActionButton.tsx 移行（variant + state 別 className）

**Files:**

- Modify: `src/components/ui/ActionButton.tsx`

- [ ] **Step 1: 現状確認**（5 つの enum-driven map: `bgMap`, `colorMap`, `borderMap`, `disabledBgOverrides`, `disabledBorderOverrides`）

- [ ] **Step 2: variant 別 BEM-style className に置換**

Task 1 で global.css に `.btn-action--default` / `.btn-action--primary` / `.btn-action--secondary` / `.btn-action--danger` を定義済み。各 class が `:disabled` 状態の override も含む。

修正後:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { caption } from '@/utils/styles';

type Variant = 'default' | 'primary' | 'secondary' | 'danger';

interface Props extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'style' | 'className'
> {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  variant?: Variant;
  loading?: boolean;
}

const variantClass: Record<Variant, string> = {
  default: 'btn-action--default',
  primary: 'btn-action--primary',
  secondary: 'btn-action--secondary',
  danger: 'btn-action--danger',
};

/**
 * 汎用アクションボタン。
 * - `variant`: 'default' | 'primary' | 'secondary' | 'danger'
 * - `loading`: true のとき `aria-busy="true"` を付与し、disabled 状態にする
 * - disabled 状態の bg/border の variant 別上書きは global.css の
 *   `.btn-action--<variant>:disabled` で表現
 */
export function ActionButton({
  onClick,
  disabled,
  children,
  variant = 'default',
  loading = false,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading ? 'true' : undefined}
      className={`inline-flex items-center px-4 py-2 rounded-lg whitespace-nowrap font-semibold caption ${
        variantClass[variant]
      }${isDisabled ? ' cursor-not-allowed' : ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}
```

> 注: `bgMap` / `colorMap` / `borderMap` / `disabledBgOverrides` / `disabledBorderOverrides` の TypeScript 定数は **削除**。`caption` import は className `caption` で代替するため import 自体不要にできる（`caption` 文字列は CSS class 名として使うだけ）— その場合 `import { caption } from '@/utils/styles'` も削除し、コメントの `caption の fontWeight: 400 を className font-semibold (= 600) と整合させるため明示上書き` も Task 1 の `.caption` クラスでは fontWeight を指定しているため、`font-semibold` Tailwind utility と同時指定で 600 が後勝ちする挙動を信頼する（`caption { font-weight: 400 }` は `font-semibold { font-weight: 600 }` より先に CSS 順序で評価される）。

実装後コードでは `import { caption } from '@/utils/styles'` を削除（caption 値は使わない、class 名 "caption" として直書き）。

- [ ] **Step 3: 進捗 vitest + 既存 ActionButton/DownloadButton spec 走らせる**

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts 2>&1 | grep "ActionButton"
npm run test -- src/components/ui/__tests__/ 2>&1 | tail -10
npx playwright test tests/e2e/download-button.spec.ts --workers=1 --reporter=list 2>&1 | tail -10
```

期待: 全 pass。

- [ ] **Step 4: コミット**

```bash
git add src/components/ui/ActionButton.tsx
git commit -m "refactor(ui): ActionButton の variant 別 inline style を CSS class に移行 (#176 B 案 PR 1)"
```

---

## Task 8: CopyButton.tsx 移行（copied 状態の条件 className）

**Files:**

- Modify: `src/components/ui/CopyButton.tsx`

- [ ] **Step 1: 該当部分確認**

CopyButton には 2 styles あり、いずれも `copyStateColors(copied, ...)` 経由の動的色付けと `copied ? colors.success : colors.border` 条件 border。

- [ ] **Step 2: 条件 className 化**

`copied` 状態に応じて `btn-copy-idle` / `btn-copy-success` を切替（Task 1 で定義済み）:

```tsx
// Before:
style={{
  fontSize: '0.75rem',
  padding: '0.25rem 0.5rem',
  minWidth: '32px',
  minHeight: '32px',
  ...copyStateColors(copied, colors.muted),
  border: 'none',
  ...
}}

// After:
className={`text-xs px-2 py-1 min-w-[32px] min-h-[32px] border-none ${
  copied ? 'btn-copy-success' : 'btn-copy-idle'
} ...`}
```

2 つ目の style も同様に `text-[0.875rem] leading-none tracking-[0.02em]` + `border` + 条件 className 化。具体的な書き換え後は Task 5 / 7 のパターンに準じる。

> `copyStateColors` ユーティリティが他で使われていなければ src/utils/styles.ts 等から削除も検討。ただし他で使われている可能性あり、本 task では削除せず import だけ整理する（実際に削除する場合は別の commit で）。

- [ ] **Step 3: 進捗 vitest + commit**

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts 2>&1 | grep "CopyButton"
git add src/components/ui/CopyButton.tsx
git commit -m "refactor(ui): CopyButton の copied 状態 inline style を条件 className に移行 (#176 B 案 PR 1)"
```

---

## Task 9: Section.tsx 移行

**Files:**

- Modify: `src/components/ui/Section.tsx`

- [ ] **Step 1: 該当部分確認**（3 styles）

- [ ] **Step 2: className 化**

`section-card` / `section-card-header` を Task 1 で定義済み。修正後:

```tsx
// 外側 div
<div className="rounded-xl border overflow-hidden section-card">

// header
<div className={`px-4 py-3 border-b body-emphasis section-card-header${headerSlot ? ' flex items-center justify-between flex-wrap gap-2' : ''}`}>

// body (旧 background: colors.bg)
<div className="p-4 bg-token">
```

- [ ] **Step 3: import 整理（`bodyEmphasis` / `colors` の style 用途を削除） + 進捗 vitest + commit**

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts 2>&1 | grep "Section"
git add src/components/ui/Section.tsx
git commit -m "refactor(ui): Section の style={{}} を className に移行 (#176 B 案 PR 1)"
```

---

## Task 10: ErrorMessage.tsx 移行

**Files:**

- Modify: `src/components/ui/ErrorMessage.tsx`

- [ ] **Step 1: 該当部分**（3 styles: panel + caption × 2）

- [ ] **Step 2: 修正**

```tsx
// Before (panel 形式):
<div className="rounded-lg p-4" style={{ border: `1px solid ${colors.error}`, background: colors.errorBg }}>
  <p style={{ ...caption, color: colors.error }}>{message}</p>
</div>

// After:
<div className="rounded-lg p-4 border-error bg-error">
  <p className="caption text-error">{message}</p>
</div>

// Before (inline 形式):
<p id={id} role="alert" style={{ ...caption, color: colors.error, marginTop: '0.25rem' }}>

// After:
<p id={id} role="alert" className="caption text-error mt-1">
```

- [ ] **Step 3: 進捗 vitest + commit**

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts 2>&1 | grep "ErrorMessage"
git add src/components/ui/ErrorMessage.tsx
git commit -m "refactor(ui): ErrorMessage の style={{}} を className に移行 (#176 B 案 PR 1)"
```

---

## Task 11: OutputField.tsx 移行

**Files:**

- Modify: `src/components/ui/OutputField.tsx`

- [ ] **Step 1: 該当 3 styles 確認**（label header bar + label text + textarea/input style）

- [ ] **Step 2: 修正**

label header bar:

```tsx
// Before:
className="flex items-center justify-between"
style={{ marginBottom: '0.75rem', minHeight: '2rem' }}

// After:
className="flex items-center justify-between mb-3 min-h-8"
```

label text:

```tsx
// Before:
<label htmlFor={id} style={{ ...bodyEmphasis, color: colors.text }}>

// After:
<label htmlFor={id} className="body-emphasis text-token">
```

textarea/input:

```tsx
// Before:
className="w-full rounded-lg px-3 py-2"
style={{
  ...caption,
  fontFamily: mono ? 'monospace' : 'inherit',
  letterSpacing: '0.02em',
  border: `1px solid ${colors.border}`,
  background: colors.bgSubtle,
  color: colors.text,
}}

// After:
className={`w-full rounded-lg px-3 py-2 caption tracking-[0.02em] border-token bg-subtle text-token ${
  mono ? 'font-mono' : ''
}`}
```

- [ ] **Step 3: 進捗 vitest + commit**

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts 2>&1 | grep "OutputField"
git add src/components/ui/OutputField.tsx
git commit -m "refactor(ui): OutputField の style={{}} を className に移行 (#176 B 案 PR 1)"
```

---

## Task 12: Select.tsx 移行

**Files:**

- Modify: `src/components/ui/Select.tsx`

- [ ] **Step 1: 該当 3 styles**（wrapper position relative + select 本体 + 矢印アイコン position absolute）

- [ ] **Step 2: 修正**

wrapper:

```tsx
// Before:
<div style={{ position: 'relative' }}>

// After:
<div className="relative">
```

select 本体:

```tsx
// Before:
className="rounded-lg px-3 py-2 w-full"
style={{
  ...caption,
  border: `1px solid ${colors.borderInput}`,
  background: colors.bg,
  color: colors.text,
  appearance: 'none',
  paddingRight: '2.5rem',
}}

// After:
className="rounded-lg px-3 py-2 w-full caption border-input bg-token text-token appearance-none pr-10"
```

矢印アイコン:

```tsx
// Before:
style={{
  position: 'absolute',
  right: '0.75rem',
  top: '50%',
  transform: 'translateY(-50%)',
  pointerEvents: 'none',
  color: colors.muted,
}}

// After:
className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted"
```

- [ ] **Step 3: 進捗 vitest + commit**

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts 2>&1 | grep "Select"
git add src/components/ui/Select.tsx
git commit -m "refactor(ui): Select の style={{}} を className に移行 (#176 B 案 PR 1)"
```

---

## Task 13: ToggleGroup.tsx 移行（選択状態の条件 className + grid 動的 column）

**Files:**

- Modify: `src/components/ui/ToggleGroup.tsx`

- [ ] **Step 1: 該当 2 styles**（コンテナ + 各 toggle button）

外側コンテナの動的部分: `gridTemplateColumns: \`repeat(${options.length}, minmax(0, 1fr))\`` は **連続値**なので Tailwind utility 直訳不可。

- [ ] **Step 2: 動的 grid columns を ref + setProperty で対応**

```tsx
import { useEffect, useRef } from 'react';

// ...

const containerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!containerRef.current || isWrap) return;
  containerRef.current.style.setProperty(
    '--toggle-cols',
    `repeat(${options.length}, minmax(0, 1fr))`
  );
}, [options.length, isWrap]);

return (
  <div
    ref={containerRef}
    aria-label={ariaLabel}
    className={`bg-subtle border-input ${
      isWrap ? 'w-max max-w-full' : 'grid [grid-template-columns:var(--toggle-cols)]'
    }`}
  >
    ...
  </div>
);
```

> `useEffect` で `setProperty` する形式は CSS 変数経由で grid columns を渡すパターン。`style={{}}` を出力しないため CSP strict 化対象。

各 toggle button (selected vs not):

```tsx
// Before:
className={`rounded-lg whitespace-nowrap transition-colors ${size === 'sm' ? 'px-2.5 py-0.5' : 'px-3 py-1.5'}`}
style={{
  ...caption,
  fontWeight: 600,
  background: value === opt.value ? colors.bg : 'transparent',
  color: value === opt.value ? colors.text : colors.muted,
  boxShadow: value === opt.value ? elevation.level2 : 'none',
}}

// After:
className={`rounded-lg whitespace-nowrap transition-colors caption font-semibold ${
  size === 'sm' ? 'px-2.5 py-0.5' : 'px-3 py-1.5'
} ${
  value === opt.value ? 'bg-token text-token shadow-md' : 'bg-transparent-token text-muted'
}`}
```

> `elevation.level2` の `box-shadow` 値は Tailwind の `shadow-md` で近似（厳密一致が必要なら global.css に `.shadow-elevation-2 { box-shadow: var(--elevation-2) }` を追加して使う）。

- [ ] **Step 3: 進捗 vitest + visual regression で見た目差を確認 + commit**

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts 2>&1 | grep "ToggleGroup"
npx playwright test tests/e2e/visual-regression.spec.ts --workers=1 2>&1 | tail -10
git add src/components/ui/ToggleGroup.tsx
git commit -m "refactor(ui): ToggleGroup の style={{}} を className + CSS 変数注入に移行 (#176 B 案 PR 1)"
```

> Visual regression が `shadow` 差異で fail した場合は `.shadow-elevation-2` を global.css に追加してから再 commit。

---

## Task 14: CountInput.tsx 移行

**Files:**

- Modify: `src/components/ui/CountInput.tsx`

- [ ] **Step 1: 該当 3 styles**（label + input + hint）

- [ ] **Step 2: 修正**

label:

```tsx
// Before:
style={{ ...bodyEmphasis, color: colors.text, display: 'block', marginBottom: '0.25rem' }}

// After:
className="body-emphasis text-token block mb-1"
```

input:

```tsx
// Before:
className="rounded-lg px-3 py-2"
style={{
  ...caption,
  width: '6rem',
  border: `1px solid ${colors.borderInput}`,
  outline: 'none',
  background: colors.bg,
  color: colors.text,
  ...
}}

// After:
className="rounded-lg px-3 py-2 caption w-24 border-input outline-none bg-token text-token"
```

hint:

```tsx
// Before:
style={{ ...caption, color: colors.muted, marginTop: '0.25rem' }}

// After:
className="caption text-muted mt-1"
```

- [ ] **Step 3: 進捗 vitest + commit**

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts 2>&1 | grep "CountInput"
git add src/components/ui/CountInput.tsx
git commit -m "refactor(ui): CountInput の style={{}} を className に移行 (#176 B 案 PR 1)"
```

---

## Task 15: 最終検証 + push + PR 作成

**Files:** 触らない

- [ ] **Step 1: 全 11 ファイルが進捗 vitest を pass**

```bash
npm run test -- src/utils/__tests__/inline-style-migration.test.ts 2>&1 | tail -15
```

期待: 11/11 pass。

- [ ] **Step 2: ui/ 内に `style={{` が 0 件**

```bash
grep -c "style={{" src/components/ui/*.tsx
```

期待: ResultTable.tsx (8) と InputField.tsx (4) 以外は **0**。これら 2 ファイルは PR 1.5 で扱う。

- [ ] **Step 3: 全 unit + 型チェック + docs-references**

```bash
npm run test 2>&1 | tail -5
node_modules/.bin/astro check 2>&1 | tail -5
npm run test -- tests/meta/docs-section-references.test.ts 2>&1 | tail -5
```

期待: 全 pass、unit に新規 11 件 (+ 既存) 追加されている。

- [ ] **Step 4: 全 E2E（visual regression 含む）**

```bash
npm run pretest:e2e
npm run test:e2e -- --workers=1 2>&1 | tail -10
```

期待: 144 + 36 (visual regression 18 × 2 viewport) = 180 程度の total、全 pass / 1 skipped。

- [ ] **Step 5: scope 外 diff チェック**

```bash
git diff origin/develop --name-only
git diff origin/develop -- '*.tsx' '*.astro' | grep -E '^-.*aria-' || echo "OK: aria 削除なし"
```

想定変更ファイル:

- `src/styles/global.css`
- `src/utils/__tests__/inline-style-migration.test.ts` (新)
- `tests/e2e/visual-regression.spec.ts` (新)
- `tests/e2e/visual-regression.spec.ts-snapshots/*.png` (新、複数)
- `.github/workflows/update-visual-baseline.yml` (新)
- `src/components/ui/ClearButton.tsx`
- `src/components/ui/BareInput.tsx`
- `src/components/ui/DownloadButton.tsx`
- `src/components/ui/ActionButton.tsx`
- `src/components/ui/CopyButton.tsx`
- `src/components/ui/Section.tsx`
- `src/components/ui/ErrorMessage.tsx`
- `src/components/ui/OutputField.tsx`
- `src/components/ui/Select.tsx`
- `src/components/ui/ToggleGroup.tsx`
- `src/components/ui/CountInput.tsx`
- `docs/superpowers/specs/2026-05-03-issue-176-b-style-src-elimination-design.md` (B 案 spec、commit 6943425 + 1f5eacc)
- `docs/superpowers/plans/2026-05-03-issue-176-b1-foundation.md` (本 plan)

`tools/*` の変更は **無いべき**（PR 1 スコープ外）。

- [ ] **Step 6: push（既に Task 3 で push 済みの場合は上書き push）**

```bash
git push -u origin feature/issue-176-b1-foundation
```

- [ ] **Step 7: PR 作成（`--base develop` 必須）**

PR 本文ファイル: `$TMPDIR/pr-176-b1.md`。本文には:

- 概要（B 案 PR 1 = foundation + simple ui 11 files migration）
- 主な変更（global.css 意味クラス、進捗 vitest、visual regression spec、ui/\* 11 ファイル）
- 検証結果（unit / astro check / E2E + visual regression / 進捗 vitest pass 状況）
- スコープ外（ResultTable / InputField → PR 1.5、tools/\* → PR 2-5）
- 関連 spec / decisions / 後続 PR

```bash
gh pr create --base develop \
  --title "refactor(ui): #176 B 案 PR 1 — 意味クラス基盤と ui/* simple 11 ファイル style={{}} 撲滅" \
  --body-file "$TMPDIR/pr-176-b1.md"
```

- [ ] **Step 8: PR URL を控える + メモリ `project_b_plan_progress.md` の進捗テーブルを更新**

メモリの「PR 1 状態: 未着手 → レビュー中（PR #N）」を更新する。

---

## 完了基準（PR マージ時）

- [ ] `src/styles/global.css` に意味クラス `@layer components` 追加済み
- [ ] `src/utils/__tests__/inline-style-migration.test.ts` 11/11 pass
- [ ] `tests/e2e/visual-regression.spec.ts` baseline 撮影済み、CI Linux runner で確定
- [ ] `src/components/ui/{ClearButton,BareInput,DownloadButton,ActionButton,CopyButton,Section,ErrorMessage,OutputField,Select,ToggleGroup,CountInput}.tsx` に `style={{}}` 不在
- [ ] `grep -c "style={{" src/components/ui/*.tsx` で ResultTable.tsx (8) と InputField.tsx (4) のみカウントされる
- [ ] 全 unit + astro check + E2E + visual regression pass
- [ ] PR が `--base develop` で作成され CI green
- [ ] メモリ `project_b_plan_progress.md` の PR 1 行が更新されている
