# #176 B 案 PR 5b: 残ツール 5 つ + zero-style 登録 2 件 + ulid-generator E2E CSP gate 化 設計書

**作成日**: 2026-05-07
**Issue**: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B / PR 5b
**前提**: A-1 ([#249](https://github.com/fumtas1k/devtools/pull/249)) + VRT 基盤 ([#254](https://github.com/fumtas1k/devtools/pull/254)) + PR 1 ([#256](https://github.com/fumtas1k/devtools/pull/256)) + PR 1.5 ([#261](https://github.com/fumtas1k/devtools/pull/261)) + PR 2 ([#272](https://github.com/fumtas1k/devtools/pull/272)) + PR 3 ([#275](https://github.com/fumtas1k/devtools/pull/275)) + PR 4 ([#277](https://github.com/fumtas1k/devtools/pull/277)) + 前段 infra ([#278](https://github.com/fumtas1k/devtools/pull/278)) + PR 5a ([#283](https://github.com/fumtas1k/devtools/pull/283)) 完了済み
**参照**: バッチ計画全体は repo SoT [`docs/projects/issue-176-b-plan-progress.md`](../../projects/issue-176-b-plan-progress.md)。PR 1 / 1.5 / 2 / 3 / 4 / 5a spec の命名規約・既存 `@layer components` 定義を継承。

---

## ゴール

`#176` B 案 PR シリーズの最終 migration PR。残ツール 5 つから JSX inline style を完全撤去し、PR 1〜5a で確立した `@layer components` 意味クラス + Tailwind utility に置換する。あわせて、進捗 doc で「PR 5 (現 5b) で対応」と明記されてきた 3 件の付帯タスクを同梱する:

1. **migration**: `Base64Codec.tsx` (2 件) + `JsonCsv.tsx` (1 件 + dead import) + `JsonXml.tsx` (1 件) + `QrCode.tsx` (7 件) + `UlidGenerator.tsx` (2 件) = 計 13 件 inline style 撤去
2. **zero-style 登録**: `QrTicket.tsx` (root) + `UrlEncoder.tsx` の 2 件を `MIGRATED_FILES` に追加 (もとから inline style 不在、PR 6 全件 glob 化前の検出網に乗せる)
3. **CSP gate 拡張**: `tests/e2e/ulid-generator.spec.ts` 既存 5 件を `withProductionCsp` で包み、陽性対照メタテスト 1 件を追加 → ulid-generator + uuid-v7 (PR 3 対応済) で「generator ページ全体に CSP gate」が成立し [#262](https://github.com/fumtas1k/devtools/issues/262) を close 可能にする

完了基準:

1. 対象 5 ファイルから `style={{` ヒット数 0
2. `src/utils/__tests__/inline-style-migration.test.ts` の `MIGRATED_FILES` array に 7 件追加 (合計 31 件) して migration test pass
   - 5 件 (migration 対象) + 2 件 (zero-style 登録) = 7 件
3. `src/styles/global.css` の `@layer components` への新規追加 **ゼロ**。PR 1〜5a で 100% カバー済 (§4 で全箇所の対応 class を明示)
4. `src/utils/styles.ts` 自体は **削除しない** (PR 6 で削除)。本 PR では 4 ツール (`Base64Codec` / `JsonCsv` / `QrCode` / `UlidGenerator`) の **import 削除** のみ。`JsonXml` は元から import なし、`JsonCsv` は dead import を本 PR で発見・削除
5. `tests/e2e/ulid-generator.spec.ts` 既存 5 件が `withProductionCsp(browser, '/tools/ulid-generator', async (page) => {...})` でラップされ、陽性対照メタテスト 1 件 (`applyProductionCsp` 直接利用 inline pattern、`browser.newContext()` で新規 context) が追加されている
6. **Phase 1 race 回避運用**: subagent は **commit せず** ファイル編集 + self-verification (vitest, astro check) のみ実施、親 Opus が Phase 1.5 で順次 commit (PR 4 / 5a の運用継承、§9.4 参照)
7. **VRT 検証**: `visual-regression.yml` で baseline 比較。意図的差分があれば PR ブランチ上で `update-visual-baseline.yml` を `workflow_dispatch` trigger
8. ローカル必須ゲート: push 前に `npm run test` (vitest) / `npx astro check` / `npm run test:e2e` 全 green (親 Opus 直接実行、memory `feedback_subagent_verification_trust.md`)
9. `#262` close + `#234` の 19 spec チェックリストで `uuid-v7.spec.ts` (PR 3 対応済) + `ulid-generator.spec.ts` (本 PR) の 2 件を消込

非ゴール:

- `flip + cleanup` (PR 6) — `style-src 'unsafe-inline'` 削除 / `stripMetaStyleSrc` 削除 / `styles.ts` 削除 / migration tracker glob 化 / `decisions.md [067]` 一括記録
- `_headers` の `style-src 'unsafe-inline'` 撤去 (PR 6)
- `withProductionCsp` ラッパ自体の meta-test ([#281](https://github.com/fumtas1k/devtools/issues/281)、本 issue 本文に「**今すぐは不要**、PR 5 完了後 or options 拡張時に併設」と明記済 → 本 PR 5b スコープ外、後続 PR で対応)
- `applyProductionCsp` の generator 以外 17 spec 横展開 ([#234](https://github.com/fumtas1k/devtools/issues/234)、19 spec のうち本 PR で 2 件消込、残 17 件は別途)
- ulid-generator の logic 変更 (本 PR は inline style 撤去 + E2E gate 化のみ)
- VRT baseline 再撮影 (CI Linux runner で意図的差分時のみ trigger)

---

## なぜ独立 PR (5a / 5b 分割) か

PR 5 全体は 9 ツール / 44 inline style + 2 CSSOM。PR 4 と同等規模で bundle すると review unit が 75 件超に肥大化 (memory `feedback_pr_size.md`)。SoT 分割設計メモ (進捗 doc §「PR 5 分割設計メモ」) に従い:

| 観点                         | 5a (済 #283)                            | 5b (本 PR)                                                             |
| ---------------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| **採用基準**                 | inline style ≥ 7 OR CSSOM hover あり    | 残り 7 ツール (zero-style 2 含む) + ulid E2E 新規 gate                 |
| **inline style 件数**        | 31 (ConfigConverter+QrReader+JanCode)   | **13** (Base64+JsonCsv+JsonXml+QrCode+UlidGenerator)                   |
| **新規 class**               | 1 (`.qr-video-preview`)                 | **0** (PR 1〜5a の class 資産で 100% カバー)                           |
| **CSSOM hover refactor**     | 2 (JanCode `<summary>`)                 | 0                                                                      |
| **特殊事項**                 | QrReader camera / module-level スタイル | JsonCsv dead import 発見 / ulid-generator E2E 既存 spec を CSP gate 化 |
| **infra/feature 分離の判断** | 純 migration                            | **migration + 1 spec の E2E gate 化を bundle 許容**                    |

**E2E bundle 許容の論理** (memory `feedback_infra_feature_separation.md` の例外判断):

memory は「VRT/lint runner/CI workflow 等の testing infra は feature work と別 PR で先行導入、bundle 禁止」と規定するが、本 PR の `ulid-generator.spec.ts` への CSP gate 化は:

- 影響面が **1 spec 内に閉じる** (config-converter で同 pattern が PR #233 で先行確立、uuid-v7 で PR 3 #275 で確立、ulid-generator で本 PR が 3 例目)
- helper (`withProductionCsp`) は PR #278 で **既に独立 infra PR で先行投入済** (本 PR は consumer 利用のみ)
- `#262` close 条件 (= ulid-generator + uuid-v7 で「generator 全体に gate」) は本 PR の migration 完了タイミングと **論理的に同期** している (PR 6 直前の必須前段)
- 1 spec の E2E gate 化を独立 PR にすると分離コストが migration PR とのレビュー二度手間 (E2E spec の流れを review 者が二度追う) を超える

→ 本 PR は migration を主、`ulid-generator.spec.ts` の CSP gate 化を従として bundle する。infra/feature 分離原則の例外として spec で明記。

memory 参照:

- `project_b_plan_progress.md` (pointer; SoT は repo `docs/projects/issue-176-b-plan-progress.md`)
- `feedback_pr_size.md`
- `feedback_subagent_verification_trust.md`
- `feedback_subagent_model.md`
- `feedback_commander_checklist.md`
- `feedback_e2e_before_pr.md`
- `feedback_tailwind_v4_layer_variant.md`
- `feedback_infra_feature_separation.md` (本 PR は **例外判断** を spec で明示)
- `feedback_prod_parity_csp.md` (ulid-generator E2E gate の動機)

---

## 採用する設計 (ファイル別)

### 1. `Base64Codec.tsx` (2 件)

新規 class 不要。全箇所が PR 1 既存 class + Tailwind 標準 utility でカバー。

#### 1.1 形式切替ラベル (line 56)

```tsx
// Before
<span style={{ ...caption, color: colors.muted }}>形式:</span>

// After
<span className="caption text-muted">形式:</span>
```

`caption` (PR 1) + `text-muted` (PR 1) で完結。

#### 1.2 InputField/OutputField wrapper alignItems (line 69)

```tsx
// Before
<div className="flex flex-col md:flex-row gap-4" style={{ alignItems: 'flex-start' }}>

// After
<div className="flex flex-col md:flex-row gap-4 items-start">
```

`items-start` は Tailwind 標準。PR 5a §1.2 と同じ pattern。

#### 1.3 import 整理

```ts
// Before
import { caption, colors } from '@/utils/styles';
// After (削除)
```

---

### 2. `JsonCsv.tsx` (1 件 + dead import 削除)

新規 class 不要。

#### 2.1 InputField/OutputField wrapper alignItems (line 71)

```tsx
// Before
<div className="flex flex-col md:flex-row gap-4" style={{ alignItems: 'flex-start' }}>

// After
<div className="flex flex-col md:flex-row gap-4 items-start">
```

#### 2.2 dead import 削除 (line 7)

```ts
// Before
import { caption, colors } from '@/utils/styles';
// After (削除)
```

**dead import の検出根拠**: `JsonCsv.tsx` の本文を grep:

```bash
grep -n "caption\|colors\." src/components/tools/JsonCsv.tsx
```

→ import 文 (line 7) のみヒット。本文で `caption` / `colors` を一切使用していない。これは PR 1 / 1.5 で `caption` / `colors` を削減する過程で削除漏れと推測される。本 PR で発見・削除する。

---

### 3. `JsonXml.tsx` (1 件)

styles.ts import なし (元から)。

#### 3.1 InputField/OutputField wrapper alignItems (line 64)

```tsx
// Before
<div className="flex flex-col md:flex-row gap-4" style={{ alignItems: 'flex-start' }}>

// After
<div className="flex flex-col md:flex-row gap-4 items-start">
```

**styles.ts import 不在の理由** (進捗 doc で「要追加調査」と flag されていた件):

確認結果、`alignItems: 'flex-start'` のみで color や font 等の token を使わないため、もともと styles.ts import 不要。locally hardcoded ではなく、CSS literal `'flex-start'` を直接 inline で使っているのみ。本 PR で `items-start` Tailwind utility に置換すれば inline style 撤去完了、import 追加・削除は不要。

---

### 4. `QrCode.tsx` (7 件)

新規 class 不要。全箇所が PR 1〜2 既存 class + Tailwind 標準/auto utility でカバー。

#### 4.1 誤り訂正レベルラベル (line 78)

```tsx
// Before
<p style={{ ...bodyEmphasis, color: colors.text, marginBottom: '0.25rem' }}>
  誤り訂正レベル
</p>

// After
<p className="body-emphasis text-default mb-1">誤り訂正レベル</p>
```

`body-emphasis` (PR 1) + `text-default` (PR 1) + `mb-1` (Tailwind 標準、0.25rem) で完結。

#### 4.2 復元率キャプション (line 88)

```tsx
// Before
<span style={{ ...caption, color: colors.muted }}>
  復元率: {ERROR_LEVELS.find((e) => e.value === errorLevel)?.desc}
</span>

// After
<span className="caption text-muted">
  復元率: {ERROR_LEVELS.find((e) => e.value === errorLevel)?.desc}
</span>
```

#### 4.3 プレビューカード wrapper (line 99-102)

```tsx
// Before
<div
  className="rounded-lg"
  style={{ border: `1px solid ${colors.border}`, overflow: 'hidden' }}
>

// After
<div className="rounded-lg border border-default overflow-hidden">
```

`border` (Tailwind 標準、`border-width: 1px`) + `border-default` (PR 1、`--color-border` 参照) の組合わせは PR 5a §1.6 / §3.1 で確立した pattern。`overflow-hidden` は Tailwind 標準。

#### 4.4 プレビューカード header (line 103-109)

```tsx
// Before
<div
  className="flex items-center justify-between gap-2 px-4 py-3"
  style={{ background: colors.bgSubtle, borderBottom: `1px solid ${colors.border}` }}
>
  <span style={{ ...bodyEmphasis, color: colors.text }}>プレビュー</span>
  <DownloadButton ... />
</div>

// After
<div className="flex items-center justify-between gap-2 px-4 py-3 bg-subtle border-b border-default">
  <span className="body-emphasis text-default">プレビュー</span>
  <DownloadButton ... />
</div>
```

`bg-subtle` (PR 1.5) + `border-b` (Tailwind 標準、`border-bottom-width: 1px`) + `border-default` (PR 1) の組合わせ。

#### 4.5 SVG 描画コンテナ (line 110-117)

```tsx
// Before
<div className="flex justify-center p-8" style={{ background: colors.bg }}>
  <div
    ref={containerRef}
    data-testid="qr-code-container"
    style={{ width: '200px', height: '200px' }}
    dangerouslySetInnerHTML={{ __html: svgHtml }}
  />
</div>

// After
<div className="flex justify-center p-8 bg-default">
  <div
    ref={containerRef}
    data-testid="qr-code-container"
    className="w-50 h-50"
    dangerouslySetInnerHTML={{ __html: svgHtml }}
  />
</div>
```

- `bg-default` (PR 1、`--color-bg` 参照)
- `w-50 h-50` (Tailwind 4 標準、`width/height: 12.5rem = 200px`、`0.25rem * 50` で計算)

**Tailwind 4 のサイズ計算式**: `w-N` = `N * 0.25rem`。`200px / 16 = 12.5rem`、`12.5 / 0.25 = 50` → `w-50`。`max-w-[400px]` のような arbitrary value (PR 5a) ではなく標準 utility で表現可能。

`data-testid="qr-code-container"` は維持 (E2E `tests/e2e/qr-code.spec.ts` で参照)。

#### 4.6 import 整理

```ts
// Before
import { bodyEmphasis, caption, colors } from '@/utils/styles';
// After (削除)
```

---

### 5. `UlidGenerator.tsx` (2 件)

新規 class 不要。PR 1 + PR 2 既存 class でカバー。

#### 5.1 ULID 先頭 10 文字の primary 強調 (line 61)

```tsx
// Before
<span style={{ color: colors.primary }}>{row.id.slice(0, 10)}</span>

// After
<span className="text-primary">{row.id.slice(0, 10)}</span>
```

`text-primary` は PR 2 既存 (`global.css` line 383-385、`color: var(--color-primary)`)。

#### 5.2 件数表示ヘッダー (line 101)

```tsx
// Before
<span style={{ ...bodyEmphasis, color: colors.text }}>{rows.length} 件生成</span>

// After
<span className="body-emphasis text-default">{rows.length} 件生成</span>
```

#### 5.3 import 整理

```ts
// Before
import { bodyEmphasis, colors } from '@/utils/styles';
// After (削除)
```

`UlidRow` interface / `TableColumn` type / `CopyButton` 等 React-side import は維持。

---

### 6. zero-style 登録 (`QrTicket.tsx` (root) + `UrlEncoder.tsx`)

両ファイルとも `style={{` ヒット数 **0** (進捗 doc 表記の通り、調査 §0 で grep 確認済)。コード変更は不要、`MIGRATED_FILES` array への追加のみで PR 6 の全件 glob 化前の検出網に乗せる。

**`QrTicket.tsx` (root)**:

- 配下の `qr-ticket/GenerateTab.tsx` / `qr-ticket/VerifyTab.tsx` / `qr-ticket/TicketDetail.tsx` は PR 2 (#272) で migration 済 → 既に `MIGRATED_FILES` 登録済
- root の `QrTicket.tsx` 自体は ToggleGroup で mode 切替するだけの薄い wrapper、最初から inline style なし

**`UrlEncoder.tsx`**:

- もとから `style={{` 利用なし (常に Tailwind utility のみで構築されている、`useCodec` パターンで logic は外出し)
- `useState` / `useEffect` の引き取りも shallow

**migration 不要の論理**: `MIGRATED_FILES` への追加 = migration test (`inline-style-migration.test.ts`) の検査対象に組み込み = 既に satisfaction 状態 (style={{ なし) を assert する。逆に追加しないと PR 6 で glob 化したときに新規追加扱いとなり差分の本体 (PR 6 で新たに対応した分) と区別がつかない。本 PR で **検出網に乗せておく** ことで PR 6 の delta を真の migration 対象 (= まだ手付かずのファイル) のみに絞れる。

---

### 7. `tests/e2e/ulid-generator.spec.ts` の CSP gate 化 (#262 close 条件)

**進捗 doc 表記の訂正**: 進捗 doc には「`tests/e2e/ulid-generator.spec.ts` を **新設**」と記載されているが、調査 §0 で確認したところ **既存 spec として存在** (5 件のテストあり、CSP gate 未適用)。本 PR では **既存 5 件を `withProductionCsp` で包み + 陽性対照メタテスト 1 件を追加** する refactor + 拡張として実施する。進捗 doc も Phase 2 で訂正する。

#### 7.1 既存 spec 構造 (現状)

```ts
test.describe('ULID生成', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/ulid-generator');
    await page.getByRole('button', { name: '生成' }).waitFor();
    await waitForReactHydration(page);
  });

  test('生成ボタンでULIDが表示される', async ({ page }) => {...});
  test('生成数を変えると指定件数のULIDが生成される', async ({ page }) => {...});
  test('生成されたULIDはすべて26文字', async ({ page }) => {...});
  test('再生成すると行が更新される', async ({ page }) => {...});
  test('タイムスタンプ列にISO形式の日時が表示される', async ({ page }) => {...});
});
```

`test.beforeEach` で goto + hydration 待ち、各 test は `page` fixture 受け取り。

#### 7.2 refactor 後 (uuid-v7 と同 pattern)

```ts
import { test, expect } from '@playwright/test';
import { applyProductionCsp, withProductionCsp } from './helpers';

test.describe('ULID生成（production CSP 適用）', () => {
  test('生成ボタンでULIDが表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/ulid-generator', async (page) => {
      await page.getByRole('button', { name: '生成' }).click();
      await expect(page.getByRole('cell', { name: /[0-9A-Z]{26}/ }).first()).toBeVisible();
    });
  });

  test('生成数を変えると指定件数のULIDが生成される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/ulid-generator', async (page) => {
      await page.getByLabel('生成数').click({ clickCount: 3 });
      await page.keyboard.type('3');
      await page.getByRole('button', { name: '生成' }).click();

      const dataRows = page
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: /[0-9A-Z]{26}/ }) });
      await expect(dataRows).toHaveCount(3);
    });
  });

  test('生成されたULIDはすべて26文字（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/ulid-generator', async (page) => {
      await page.getByLabel('生成数').click({ clickCount: 3 });
      await page.keyboard.type('3');
      await page.getByRole('button', { name: '生成' }).click();

      const dataRows = page
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: /[0-9A-Z]{26}/ }) });
      await expect(dataRows).toHaveCount(3);

      for (const row of await dataRows.all()) {
        const cell = row.getByRole('cell', { name: /[0-9A-Z]{26}/ });
        const text = await cell.innerText();
        expect(text.trim()).toHaveLength(26);
      }
    });
  });

  test('再生成すると行が更新される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/ulid-generator', async (page) => {
      await page.getByLabel('生成数').click({ clickCount: 3 });
      await page.keyboard.type('1');
      await page.getByRole('button', { name: '生成' }).click();

      const first = await page
        .getByRole('cell', { name: /[0-9A-Z]{26}/ })
        .first()
        .innerText();
      await page.getByRole('button', { name: '生成' }).click();
      const second = await page
        .getByRole('cell', { name: /[0-9A-Z]{26}/ })
        .first()
        .innerText();

      expect(second >= first).toBe(true);
    });
  });

  test('タイムスタンプ列にISO形式の日時が表示される（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/ulid-generator', async (page) => {
      await page.getByRole('button', { name: '生成' }).click();
      await expect(page.getByRole('cell', { name: /\d{4}-\d{2}-\d{2}T/ }).first()).toBeVisible();
    });
  });

  // 陽性対照メタテスト — ゲート自体の動作確認
  test('applyProductionCsp は実際に CSP 違反を捕捉する（ゲート自体の動作確認）', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const guard = await applyProductionCsp(page);
      const response = await page.goto('/tools/ulid-generator');
      expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.src = 'https://example.com/violates-csp.js';
        document.head.appendChild(script);
      });
      await expect.poll(() => guard.violations.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });
});
```

主要変更点:

1. `test.beforeEach` を **削除** (`withProductionCsp` 内部で `goto` + `waitForReactHydration` を実行するため)
2. 各 test の fixture を `page` → `browser` に変更
3. test 名の末尾に `（CSP 違反なし）` を付与 (uuid-v7 と同じ命名規約)
4. describe 名を `ULID生成` → `ULID生成（production CSP 適用）` に変更
5. `applyProductionCsp` を import に追加 (陽性対照メタテストで使用)
6. 末尾に陽性対照メタテスト 1 件を追加 (memory `feedback_positive_control_for_gates.md`、helper 改修時の保険)

**陽性対照メタテストの inline pattern 維持理由**: `withProductionCsp` は終端で `assertNoViolations()` を呼ぶ設計のため、`guard.violations.length` を fn 内で polling する用途には integration できない。`applyProductionCsp` 直接利用 + `browser.newContext()` の inline pattern を維持する (`tests/e2e/uuid-v7.spec.ts` line 116-148 / `tests/e2e/config-converter.spec.ts` の同等メタテストと整合)。

#### 7.3 path 確認

```bash
grep -rn "/tools/ulid" src/pages/
```

`/tools/ulid-generator` または `/tools/ulid` のいずれが正規かを確認 (本 PR 着手時に grep で再確認、Astro ファイル名の slug 規約に従う)。既存 `ulid-generator.spec.ts` は `/tools/ulid-generator` を使用しているのでこれをそのまま継承。

---

## 4. `src/styles/global.css` 確認 (PR 5b で **追加なし**)

PR 1 / 1.5 / 2 / 3 / 4 / 5a で追加済の class はすべて再利用:

| 利用 class        | 由来 PR | 用途 (PR 5b 内)                                       |
| ----------------- | ------- | ----------------------------------------------------- |
| `.caption`        | PR 1    | Base64 形式ラベル / QrCode 復元率                     |
| `.body-emphasis`  | PR 1    | QrCode 誤り訂正レベル / QrCode プレビュー / Ulid 件数 |
| `.text-default`   | PR 1    | QrCode (誤り訂正レベル, プレビュー) / Ulid (件数)     |
| `.text-muted`     | PR 1    | Base64 形式 / QrCode 復元率                           |
| `.text-primary`   | PR 2    | Ulid (先頭 10 文字 primary 強調)                      |
| `.bg-default`     | PR 1    | QrCode SVG 描画コンテナ                               |
| `.bg-subtle`      | PR 1.5  | QrCode プレビュー header                              |
| `.border-default` | PR 1    | QrCode wrapper / QrCode header borderBottom           |

**新規 class 追加ゼロ**。PR 1〜5a で 100% カバー済 (進捗 doc 「PR 1〜4 で 95%+ カバー済」の前提 + PR 5a で `.qr-video-preview` のみ追加 = 残ツールで完全に網羅されている状態)。

**Tailwind 4 標準 utility の利用箇所** (build 時静的 CSS、CSP-safe):

| utility               | 用途                                  | 該当                       |
| --------------------- | ------------------------------------- | -------------------------- |
| `items-start`         | flex 子の縦揃え (alignItems)          | Base64 / JsonCsv / JsonXml |
| `mb-1`                | QrCode 誤り訂正レベルラベル下マージン | QrCode                     |
| `border` / `border-b` | 1px border (PR 5a §1.6 と同 pattern)  | QrCode                     |
| `overflow-hidden`     | QrCode プレビューカード               | QrCode                     |
| `w-50` / `h-50`       | QrCode SVG 描画コンテナ (200x200px)   | QrCode                     |

`max-w-[400px]` (PR 5a) のような arbitrary value は本 PR では不要 (200px は Tailwind 標準 `w-50` でカバー)。

---

## 5. `inline-style-migration.test.ts` への追加

```ts
const MIGRATED_FILES: readonly string[] = [
  // PR 1 で追加済 (11 件、省略)
  // PR 1.5 で追加済 (2 件)
  // PR 2 で追加済 (3 件)
  // PR 3 で追加済 (2 件)
  // PR 4 で追加済 (3 件)
  // PR 5a で追加済 (3 件)
  // PR 5b で追加 (5 migration + 2 zero-style)
  'src/components/tools/Base64Codec.tsx',
  'src/components/tools/JsonCsv.tsx',
  'src/components/tools/JsonXml.tsx',
  'src/components/tools/QrCode.tsx',
  'src/components/tools/UlidGenerator.tsx',
  'src/components/tools/QrTicket.tsx',
  'src/components/tools/UrlEncoder.tsx',
];
```

陽性対照テストブロック (PR 1 で導入済) は変更不要。合計 31 ファイル。

**zero-style 登録のテスト挙動**:

- `inline-style-migration.test.ts` は各 `MIGRATED_FILES` 要素に対し 2 件の assertion (style={{ 不在 + element.style.X = 不在) を `describe.each` で生成する
- `QrTicket.tsx` / `UrlEncoder.tsx` はもとから両条件を満たす → 即座に pass する (regression test として将来の inline style 混入を検出する)

---

## 6. consumer 変更範囲 (PR 5b で touch するファイル)

| File                                                 | 変更内容                                                                           | 備考                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------- |
| `src/components/tools/Base64Codec.tsx`               | inline style 2 件除去 + import 整理                                                | MIGRATED_FILES 登録 (Track A) |
| `src/components/tools/JsonCsv.tsx`                   | inline style 1 件除去 + dead import 削除                                           | MIGRATED_FILES 登録 (Track A) |
| `src/components/tools/JsonXml.tsx`                   | inline style 1 件除去                                                              | MIGRATED_FILES 登録 (Track A) |
| `src/components/tools/QrCode.tsx`                    | inline style 7 件除去 + import 整理                                                | MIGRATED_FILES 登録 (Track B) |
| `src/components/tools/UlidGenerator.tsx`             | inline style 2 件除去 + import 整理                                                | MIGRATED_FILES 登録 (Track B) |
| `tests/e2e/ulid-generator.spec.ts`                   | 既存 5 件を `withProductionCsp` 化 + 陽性対照メタテスト 1 件追加                   | (Track C)                     |
| `src/utils/__tests__/inline-style-migration.test.ts` | `MIGRATED_FILES` array に 7 件追加 (合計 31 件)                                    | -                             |
| `docs/projects/issue-176-b-plan-progress.md`         | PR 5b の状態を current 化 + ulid-generator.spec.ts の表記訂正 (新設→既存 refactor) | 進捗 + follow-up table 更新   |

**触らない**:

- `src/components/tools/__tests__/*.test.ts` (logic test、本 PR の class 化は DOM 構造を変えない)
- `src/utils/styles.ts` (PR 6 で削除、本 PR は import 削除のみ)
- `src/utils/csp.ts` / `public/_headers` (PR 6 でstrict 化)
- `src/styles/global.css` (新規 class 追加なし、確認のみ)
- `tests/e2e/uuid-v7.spec.ts` (PR 3 で対応済)
- `tests/e2e/{base64,json-csv,json-xml,qr-code,qr-ticket,url-encode}.spec.ts` (#234 17 spec 横展開は別 PR、本 PR スコープ外)
- `src/pages/tools/*.astro` (page-level 変更なし)

**事前 grep 確認**:

```bash
# JsonCsv.tsx の dead import 確認 (caption / colors が本文で使われていないこと)
grep -n "caption\|colors" src/components/tools/JsonCsv.tsx
# 期待: import 文 (line 7) のみヒット

# QrTicket.tsx (root) と UrlEncoder.tsx に inline style がないこと
grep -n "style={{" src/components/tools/QrTicket.tsx src/components/tools/UrlEncoder.tsx
# 期待: 0 hit

# ulid-generator URL slug 確認
grep -rn "/tools/ulid" src/pages/
# 期待: /tools/ulid-generator が正規

# 既存 e2e spec の現状確認
grep -n "withProductionCsp\|applyProductionCsp" tests/e2e/ulid-generator.spec.ts
# 期待: 0 hit (本 PR で初導入)
```

---

## 7. 検証戦略

### 7.1 ローカル必須ゲート (push 前、親 Opus 直接実行)

| 順  | コマンド           | 目的                                                                                      |
| --- | ------------------ | ----------------------------------------------------------------------------------------- |
| 1   | `npm run test`     | unit + migration test (24 → 31、14 spec 追加 = 7 ファイル × 2 件 / file)                  |
| 2   | `npx astro check`  | TypeScript 型チェック (Tailwind utility の型 break 検知)                                  |
| 3   | `npm run test:e2e` | base64 / json-csv / json-xml / qr-code / ulid-generator の既存 E2E + CSP gate 6 件全 pass |

memory `feedback_subagent_verification_trust.md`: 親 Opus 直接実行 (subagent の "pass" 報告は信頼しない)。memory `feedback_e2e_before_pr.md`: PR 作成前必ず実行 (post-PR 代行は CI 任せ)。

### 7.2 CI

| workflow                | 内容                               | required?       |
| ----------------------- | ---------------------------------- | --------------- |
| `test.yml`              | vitest + e2e                       | ✅ required     |
| `visual-regression.yml` | `npm run test:vrt` (baseline 比較) | ❌ non-required |

memory `feedback_vrt_ci_only.md`: ローカル `npm run test:vrt` は走らせない。

### 7.3 a11y 退化検知 (memory `feedback_commander_checklist.md`)

PR 作成前に親が下記実行:

```bash
git diff origin/develop -- \
  src/components/tools/Base64Codec.tsx \
  src/components/tools/JsonCsv.tsx \
  src/components/tools/JsonXml.tsx \
  src/components/tools/QrCode.tsx \
  src/components/tools/UlidGenerator.tsx \
  | grep -E '^-.*(aria-|role=|data-testid=|htmlFor=)' | grep -vE '^---|^\+\+\+'
# 出力 0 行 = OK (reformatted で行移動した削除行が出る場合は現コードで存在を grep 確認、PR 3-5a と同運用)
```

特に注意:

- QrCode の `data-testid="qr-code-container"` 維持 (E2E 参照)
- 全 button の `type="button"` 維持 (PR 1 follow-up #258/#269 で追加済)
- ULID テーブルの role / aria-live 維持 (`role="status"` `aria-live="polite"`)
- ULID 行の aria-label (`coloredUuid` 系の test が依存していないか uuid-v7 spec と比較確認)
- `OutputField` の `ariaLabel="変換結果"` 維持 (Base64 / JsonCsv / JsonXml で同一)

### 7.4 VRT 差分の判断フロー (PR 1〜5a と同じ)

PR comment に diff があった場合:

- 意図しない regression (色違い / レイアウト崩れ) → class 定義 / consumer className 修正
- ピクセル未満の anti-alias 差 → mask か threshold 緩和 (事前合意必要)
- 意図的変化 → PR ブランチで `update-visual-baseline.yml` を `workflow_dispatch` trigger → bot が新 baseline を commit back

特に確認すべき差分点:

- QrCode プレビューカード: `border` + `border-default` の色が元 inline `colors.border` と同一か (両方 `--color-border` 参照、same)
- QrCode header: `bg-subtle` の bg が元 `colors.bgSubtle` と同一か (両方 `--color-bg-subtle` 参照、same)
- QrCode SVG コンテナ: `w-50 h-50` (200x200px) が元 `width: '200px', height: '200px'` と完全同一
- UlidGenerator 先頭 10 文字: `text-primary` の色が元 `colors.primary` と同一か (両方 `--color-primary` 参照、same)
- Base64/JsonCsv/JsonXml の wrapper: `items-start` (`align-items: flex-start`) が元 inline と同一

すべて CSS variable 参照経由で同じ値を取るため、VRT 差分 0 が期待される。

### 7.5 functional E2E 観点

| ツール        | 既存 spec ファイル                 | 本 PR で重要な assertion                                                 |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| Base64Codec   | `tests/e2e/base64.spec.ts`         | encode/decode toggle / format toggle / sample 投入                       |
| JsonCsv       | `tests/e2e/json-csv.spec.ts`       | mode toggle / sample 投入 / CSV ダウンロードボタン                       |
| JsonXml       | `tests/e2e/json-xml.spec.ts`       | mode toggle / sample 投入                                                |
| QrCode        | `tests/e2e/qr-code.spec.ts`        | テキスト → SVG 描画 (`data-testid="qr-code-container"`) / 誤り訂正レベル |
| UlidGenerator | `tests/e2e/ulid-generator.spec.ts` | **本 PR で CSP gate 化**: 既存 5 件 + 陽性対照メタテスト 1 件            |

**追加で重要**: ulid-generator E2E gate 化に伴い `withProductionCsp` 経由で hydration 待ち + `assertNoViolations` 自動呼出が走る → 既存 logic に CSP 違反 (e.g. inline event handler / dynamic script) が眠っていれば検出される。事前に `useTransition` / `setProperty` 系の利用を grep して flag。

```bash
# UlidGenerator が CSP 違反を起こしうる経路を確認
grep -n "setProperty\|eval\|new Function\|dangerouslySetInnerHTML" src/components/tools/UlidGenerator.tsx
# 期待: dangerouslySetInnerHTML なし、setProperty なし
```

ResultTable 内部で `setProperty('--col-width', ...)` / `setProperty('--result-table-min-width', ...)` を使用している (PR 1.5 で導入)。これは `ref.current.style.setProperty(...)` の許容パターン (memory `feedback_prod_parity_csp.md` のとおり、CSSOM API 経由は CSP 違反にならない)。`#262` 動機の核心が「PR 1.5 で setProperty 利用 → CSP strict 化後の violation 検出が必要」なので、ulid-generator E2E gate で実際に違反が出ないことを確認することが本 PR の安全保証になる。

---

## 8. バッチ計画における本 PR の位置付け

repo SoT [`docs/projects/issue-176-b-plan-progress.md`](../../projects/issue-176-b-plan-progress.md) のテーブル参照。

| #         | スコープ                                                                                               | 状態           |
| --------- | ------------------------------------------------------------------------------------------------------ | -------------- |
| PR 0      | VRT 導入                                                                                               | ✅ #254 merged |
| PR 1      | 基礎工事 + ui/\* simple 11                                                                             | ✅ #256 merged |
| PR 1.5    | ui/\* complex (ResultTable + InputField)                                                               | ✅ #261 merged |
| PR 2      | qr-ticket/\*                                                                                           | ✅ #272 merged |
| PR 3      | JwtDecoder + UuidV7Generator + #262 partial                                                            | ✅ #275 merged |
| PR 4      | Gs1Databar + EncodingConverter + DummyText                                                             | ✅ #277 merged |
| infra     | `withProductionCsp` ラッパ helper                                                                      | ✅ #278 merged |
| PR 5a     | ConfigConverter + QrReader + JanCode                                                                   | ✅ #283 merged |
| **PR 5b** | **Base64 + JsonCsv + JsonXml + QrCode + UlidGenerator + zero-style 登録 + ulid-generator E2E (本 PR)** | **本 PR**      |
| PR 6      | flip + cleanup                                                                                         | 未着手         |

PR は **直列** (前 PR がマージされてから次 PR 着手)。本 PR 完了で migration 段階が完結し、PR 6 で `style-src 'unsafe-inline'` を削除する flip phase へ移行可能になる。

---

## 9. ブランチ命名 / コミット粒度 / 並列 subagent 分担 + race 回避運用

### 9.1 ブランチ命名

- `feature/issue-176-b5b-rest-tools-and-ulid-e2e`
- worktree: `git worktree add .claude/worktrees/issue-176-b5b origin/develop -b feature/issue-176-b5b-rest-tools-and-ulid-e2e` (memory `feedback_worktree_base_branch.md` / `feedback_worktree_location.md`)

### 9.2 コミット粒度

```
1. (Phase 0) chore(spec): #176 B 案 PR 5b spec 追加
2. (Phase 1.5) refactor(tools): #176 B 案 PR 5b — Base64Codec + JsonCsv + JsonXml inline style 撤去 (Track A)
3. (Phase 1.5) refactor(tools): #176 B 案 PR 5b — QrCode + UlidGenerator inline style 撤去 (Track B)
4. (Phase 1.5) test(e2e): #176 B 案 PR 5b — ulid-generator.spec.ts を withProductionCsp 化 + 陽性対照メタテスト追加 (Track C, #262 close)
5. (Phase 2) test(migration): MIGRATED_FILES に PR 5b 対象 7 件追加 (5 migration + 2 zero-style)
6. (Phase 2) docs(progress): PR 5b (#XXX) の状態を反映 + ulid-generator.spec.ts 表記訂正
```

各 Track ごとに 1 commit (PR 5a の運用継承)。Track A は 3 ファイルだが「inline style alignItems 系の小物 3 つ」で意味的に 1 単位として束ねる。

### 9.3 並列 subagent 分担 (sonnet × 3 Track)

memory `feedback_subagent_model.md` に従い `model: "sonnet"` 明示:

| Track | 担当ファイル                                      | inline style 件数 + 特殊事項                                                    |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| **A** | `Base64Codec.tsx` + `JsonCsv.tsx` + `JsonXml.tsx` | 4 件 (2 + 1 + 1) + JsonCsv の dead import 削除                                  |
| **B** | `QrCode.tsx` + `UlidGenerator.tsx`                | 9 件 (7 + 2)                                                                    |
| **C** | `tests/e2e/ulid-generator.spec.ts`                | 既存 5 件を `withProductionCsp` 化 + 陽性対照メタテスト 1 件追加 (`#262` close) |

**Track 分割の論理**:

- Track A は **alignItems: 'flex-start'** という単純パターンが 3 ファイルに散在 + dead import 1 件で軽量、1 subagent でまとめて処理可能 (全 3 ファイル合計でも PR 4 の DummyText 1 ファイルに満たない規模)
- Track B は QrCode 7 件で本 PR の最大 file、Ulid 2 件は ResultTable consumer なので合わせて読む価値あり
- Track C は migration とは独立した E2E gate 化 (uuid-v7 spec をミラーする refactor)、別 subagent で並列可能

### 9.4 **Phase 1 race 回避運用 (PR 4 / 5a 運用継承)**

PR 3 で並列 dispatch 時に commit が結合される race が発生 → PR 4 / 5a で「subagent 非 commit」運用を採用 → 成功。本 PR でも継承:

#### 採用方針: subagent は commit せず、親が Phase 1.5 で順次 commit

各 subagent への明示指示:

```
- ファイル編集 + self-verification (vitest, astro check) のみ実施
- git add / git commit は実行しない (親が後段で実施)
- 完了報告: 「変更ファイル list (git diff --name-only) + self-verification 結果」のみ
```

親 Opus が Phase 1 完了後、Phase 1.5 で:

1. Track A の変更を確認 → `git add src/components/tools/Base64Codec.tsx src/components/tools/JsonCsv.tsx src/components/tools/JsonXml.tsx` → commit
2. Track B の変更を確認 → `git add src/components/tools/QrCode.tsx src/components/tools/UlidGenerator.tsx` → commit
3. Track C の変更を確認 → `git add tests/e2e/ulid-generator.spec.ts` → commit

#### 利点 (PR 4 / 5a で確認済)

- subagent 間の commit race 完全消去
- prettier hook の巻き込み reformat も親が制御 (1 commit に閉じる、他 Track ファイルが入らない)
- 各 commit のメッセージと内容が完全一致
- subagent の self-verification (vitest / astro check) は維持

### 9.5 PR ベース

`gh pr create --base develop` で必ず明示 (memory `feedback_branch_workflow.md` / `feedback_pr_language.md` / `CLAUDE.md` 最重要ルール)。タイトル例:

> `refactor(tools): #176 B 案 PR 5b — 残ツール inline style 撤去 + ulid-generator E2E CSP gate 化 (#262 close)`

PR 本文は `--body-file /tmp/claude/pr_body_b5b.md` 経由 (memory `feedback_heredoc_no_escape.md`)。本文に以下を必須記載:

- 概要 (3-4 行)
- 変更内容 (ファイル別の diff サマリ + zero-style 登録の論理 + ulid-generator E2E gate 化の論理)
- なぜこの分割か (PR 5a / 5b 分割設計、infra/feature 例外判断)
- 検証 (ローカル必須ゲート 3 件 + a11y grep + #234 / #262 への影響)
- 関連 PR / 関連 issue (`#176` / `#262` close / `#234` 部分消込)
- 後続 (PR 6 待ち)

---

## 10. リスクと緩和

| ID  | リスク                                                                                                   | 緩和                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `w-50 h-50` Tailwind utility が 200px に展開されない (Tailwind 4 の単位計算)                             | Tailwind 4 標準: `w-N` = `N * 0.25rem`、`50 * 0.25 = 12.5rem`。1rem = 16px (default html font-size) なら `12.5 * 16 = 200px`。astro check で型 break しないか確認、E2E で `data-testid="qr-code-container"` の bbox を `expect(toHaveCSS)` 等で検証可 |
| R2  | `ulid-generator.spec.ts` の URL slug が違う (`/tools/ulid` vs `/tools/ulid-generator`)                   | §6 grep で事前確認。既存 spec に従い `/tools/ulid-generator` を採用                                                                                                                                                                                   |
| R3  | UlidGenerator が CSP 違反を起こす経路 (e.g. `setProperty` の不適切利用)                                  | §7.5 grep で事前確認。`setProperty` は CSSOM API 経由で許容 (PR 1 で確認済 pattern)。本 PR の E2E gate 化が安全保証                                                                                                                                   |
| R4  | JsonCsv の dead import 削除で他箇所への影響 (e.g. 隠れた tree-shaking / build 最適化)                    | dead import の本体 (`caption` / `colors`) は他ファイルでも参照あり、本ファイルで削除しても影響なし。`grep -rn "import.*styles" src/` で全使用箇所を確認、JsonCsv のみ dead 状態                                                                       |
| R5  | Phase 1 で subagent が指示違反して commit してしまう                                                     | 親が Phase 1.5 で `git status` / `git log --oneline -1` を確認して回復可能。最悪 reset --soft で再 commit (PR 3 の経験)                                                                                                                               |
| R6  | ulid-generator E2E の hydration 待ちが `withProductionCsp` 内部の `waitForReactHydration` で不足         | uuid-v7 spec (PR 3 で同 pattern 確立) で実績あり、ulid-generator も同等構成。万一 timeout なら helper の options 拡張 ([#280](https://github.com/fumtas1k/devtools/issues/280)) で対応 (本 PR スコープ外)                                             |
| R7  | 陽性対照メタテストの違反捕捉が flaky (例: external script が CSP 違反になる前に goto が完了しない)       | uuid-v7 spec / config-converter spec で実績ある pattern を完全 mirror。`expect.poll` で polling のため race condition に強い                                                                                                                          |
| R8  | QrCode の `width: '200px'` を `w-50` に置換した時、root html の font-size が 16px でない場合に値が変わる | 本 project は `global.css` で root font-size を override していない (default 16px = browser standard)。`@theme` でも root font-size を変更していないので 1rem = 16px 固定                                                                             |
| R9  | zero-style 登録した QrTicket / UrlEncoder の migration test が無意味な重複に見える                       | spec §4.6 / §6 で「PR 6 で全件 glob 化する前の検出網」と明記。逆に登録しないと PR 6 の delta が混乱する。ロジックの正当性を spec で確保                                                                                                               |
| R10 | `#262` close は本 PR の merge と同時に行うべきか、後追い comment か                                      | 本 PR description で「Closes #262」と明記して同時 close する。GitHub の自動 close を活用 (manual close は不要)                                                                                                                                        |
| R11 | E2E gate 化により ulid-generator spec の所要時間が伸びる (`browser.newContext` の overhead)              | uuid-v7 spec の所要時間と同等 (体感+0.5-1s/test、6 test で +3-6s)。CI 全体時間への影響は無視できる範囲                                                                                                                                                |

---

## 11. 議論ポイント (spec 確定前 user 判断、本 spec 起草時 default 採用案を提示)

### D1. ulid-generator.spec.ts の扱い: 既存 spec の refactor + 拡張

- **採用**: 既存 5 件を `withProductionCsp` で包む + 陽性対照メタテスト 1 件追加
- **代替**: 別 spec ファイル (`ulid-generator-csp.spec.ts`) を新設して既存 spec を残す
- **判断ポイント**: uuid-v7 (PR 3) では既存 spec を全置換 = describe 名も「（production CSP 適用）」に変更。同 pattern を踏襲することで spec 構造の整合性を取る
- **判断**: 採用案 (PR 5a の D1 と類似、既存 pattern 踏襲)

### D2. zero-style 登録 (QrTicket / UrlEncoder) を本 PR 5b で実施

- **採用**: 本 PR で `MIGRATED_FILES` に追加
- **代替**: PR 6 の glob 化に任せる (本 PR では追加しない)
- **判断ポイント**: PR 6 で `await glob('src/components/**/*.tsx')` に置換すると **全件** が検査対象になる。本 PR で zero-style 2 件を明示登録しておけば、PR 6 で glob 化したときに「新規 detect = まだ手付かずのファイル」のみが残るため delta が clean になる
- **判断**: 採用案 (PR 6 の delta clean 化、検出網に乗せる意味あり)

### D3. JsonCsv の dead import 削除を本 PR に同梱

- **採用**: 本 PR で削除
- **代替**: 別 PR で対応 (本 PR は inline style 撤去のみ)
- **判断ポイント**: dead import は `caption` / `colors` という styles.ts symbol で、他 4 ツールの import 削除と論理的に同列。同じ commit に集約することで PR 6 で styles.ts を削除する際の漏れリスクを下げる
- **判断**: 採用案 (PR 6 直前の cleanup として論理的)

### D4. QrCode SVG 描画コンテナを `w-50 h-50` (Tailwind 標準) で表現

- **採用**: `w-50 h-50` (= 200x200px、Tailwind 4 標準計算)
- **代替**: `max-w-[200px]` arbitrary value (PR 5a の `max-w-[400px]` pattern)
- **判断ポイント**: 200px は Tailwind 標準 utility で表現可能 (50 \* 0.25rem = 12.5rem = 200px)。arbitrary value はより複雑な値で使う
- **判断**: 採用案 (Tailwind 標準で完結、シンプル)

### D5. UlidGenerator 先頭 10 文字の primary 強調を `.text-primary` で表現

- **採用**: PR 2 既存 `.text-primary` を再利用
- **代替**: 専用 class (`.ulid-prefix-highlight` 等) を新設
- **判断ポイント**: 本 PR の方針は「新規 class ゼロ」。`.text-primary` で意味的にも合致 (primary color による強調)
- **判断**: 採用案 (新規 class 追加せず既存資産再利用)

### D6. 並列 subagent Track 分割 (3 Track)

- **採用**: A=Base64+JsonCsv+JsonXml / B=QrCode+UlidGenerator / C=ulid-generator E2E refactor
- **代替 1**: 2 Track (A=migration 5 ツール / B=E2E refactor)
- **代替 2**: 4 Track (A=Base64 / B=JsonCsv+JsonXml / C=QrCode+UlidGenerator / D=E2E refactor)
- **判断ポイント**: 3 Track が PR 4 / 5a で確立した最適規模 (sonnet 3 並列で commit race 制御しやすい)。Track A の合計件数 (4 件 + dead import) は PR 4 EncodingConverter (1 件) と同程度
- **判断**: 採用案 (PR 4 / 5a の運用継承)

### D7. 本 PR で `infra/feature 分離` の例外を明示

- **採用**: 本 spec §「なぜ独立 PR (5a / 5b 分割) か」で例外判断を明記
- **代替**: ulid-generator E2E gate 化を別 PR (本 PR は migration のみ)
- **判断ポイント**: ulid-generator E2E gate 化は 1 spec 内に閉じる + helper は PR #278 で先行投入済 + `#262` close 条件と論理的に同期。別 PR にすると review 二度手間。memory `feedback_infra_feature_separation.md` の例外判断として spec に記録
- **判断**: 採用案 (例外判断を明示、後日類似ケースの判断材料として残す)

---

## 関連

- 起源 issue: [#176](https://github.com/fumtas1k/devtools/issues/176) アプローチ B
- 本 PR で close される issue: [#262](https://github.com/fumtas1k/devtools/issues/262) (ulid-generator + uuid-v7 で generator E2E gate 完成)
- 本 PR で部分消込される issue: [#234](https://github.com/fumtas1k/devtools/issues/234) (19 spec 横展開のうち uuid-v7 + ulid-generator の 2 件)
- 本 PR スコープ外の関連 issue: [#281](https://github.com/fumtas1k/devtools/issues/281) (`withProductionCsp` meta-test、本 issue 本文で「PR 5 完了後 or options 拡張時」と明記済)
- 前提 PR: [#249](https://github.com/fumtas1k/devtools/pull/249) (A-1) / [#252](https://github.com/fumtas1k/devtools/pull/252) (meta-csp) / [#254](https://github.com/fumtas1k/devtools/pull/254) (VRT) / [#256](https://github.com/fumtas1k/devtools/pull/256) (PR 1) / [#261](https://github.com/fumtas1k/devtools/pull/261) (PR 1.5) / [#272](https://github.com/fumtas1k/devtools/pull/272) (PR 2) / [#275](https://github.com/fumtas1k/devtools/pull/275) (PR 3) / [#277](https://github.com/fumtas1k/devtools/pull/277) (PR 4) / [#278](https://github.com/fumtas1k/devtools/pull/278) (前段 infra) / [#283](https://github.com/fumtas1k/devtools/pull/283) (PR 5a)
- 過去 decisions: [054]（CSP 初導入）/ [061]（applyProductionCsp 採用）/ [064]（A-1 採用）/ [066]（VRT 採用）
- repo SoT: [`docs/projects/issue-176-b-plan-progress.md`](../../projects/issue-176-b-plan-progress.md)
- memory: `feedback_pr_size.md` / `feedback_subagent_model.md` / `feedback_subagent_verification_trust.md` / `feedback_commander_checklist.md` / `feedback_vrt_ci_only.md` / `feedback_e2e_before_pr.md` / `feedback_branch_workflow.md` / `feedback_pr_language.md` / `feedback_heredoc_no_escape.md` / `feedback_worktree_base_branch.md` / `feedback_worktree_location.md` / `feedback_worktree_merge_order.md` / `feedback_tailwind_v4_layer_variant.md` / `feedback_infra_feature_separation.md` (例外判断) / `feedback_prod_parity_csp.md` / `feedback_positive_control_for_gates.md`
- PR 1 spec: `docs/superpowers/specs/2026-05-03-issue-176-b1-foundation-and-ui-simple-design.md`
- PR 1.5 spec: `docs/superpowers/specs/2026-05-04-issue-176-b1-5-ui-complex-design.md`
- PR 2 spec: `docs/superpowers/specs/2026-05-04-issue-176-b2-qr-ticket-design.md`
- PR 3 spec: `docs/superpowers/specs/2026-05-07-issue-176-b3-jwt-uuid-design.md`
- PR 4 spec: `docs/superpowers/specs/2026-05-07-issue-176-b4-gs1-encoding-dummy-design.md`
- PR 5a spec: `docs/superpowers/specs/2026-05-07-issue-176-b5a-config-qr-jan-design.md`
- 前段 infra spec: `docs/superpowers/specs/2026-05-07-issue-276-with-production-csp-helper-design.md`
