# E2E hydration 待ち漏れ修正 + meta テスト 実装計画 (issue #750)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** hydration race で flaky な 3 つの E2E spec に `waitForReactHydration` を追加し、新規 spec での漏れを CI で fail させる meta テストを導入する。

**Architecture:** 既存ヘルパー `tests/e2e/helpers.ts` の `waitForReactHydration` を各 spec の goto 直後に挟む（既存 spec の踏襲パターン）。漏れ防止は Vitest meta テスト（`tests/meta/` の allowlist + 純粋関数パターン、`vrt-pages-coverage.test.ts` 踏襲）で、`goto('/tools/...')` を含む spec にヘルパー参照を必須化する。

**Tech Stack:** Playwright (E2E) / Vitest (meta テスト) / TypeScript

**Spec:** `docs/superpowers/specs/2026-07-19-e2e-hydration-wait-design.md`

**前提知識:**

- `waitForReactHydration(page)` は `tests/e2e/helpers.ts:19` に定義済み。astro-island 配下の要素に React の `__react*` キーが付くまで待つ（デフォルト 10s timeout）。
- `withProductionCsp` ラッパは内部で hydration 待ちを行うため、これを使う spec は追加不要。
- コミットメッセージは日本語 + Conventional Commits（`.githooks/commit-msg` が検証。`test(e2e):` のようなスコープ付き可）。
- E2E 実行: `npm run test:e2e -- <spec ファイル>`（preview build 経由）。ユニット: `npm run test`。

---

### Task 1: dsn-builder.spec.ts に hydration 待ちを追加

**Files:**

- Modify: `tests/e2e/dsn-builder.spec.ts:1-8`

- [ ] **Step 1: import と beforeEach を修正**

現状（1〜8 行目）:

```ts
import { test, expect } from '@playwright/test';

const PG_URI = 'postgresql://app:s3cret@db.example.com:5432/app_db?sslmode=require';

test.describe('DSN/接続文字列ビルダ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/dsn-builder');
  });
```

以下に変更:

```ts
import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

const PG_URI = 'postgresql://app:s3cret@db.example.com:5432/app_db?sslmode=require';

test.describe('DSN/接続文字列ビルダ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/dsn-builder');
    // fill → React onChange パースが hydration 完了前に走ると DOM のみ更新され
    // flaky になるため、island の hydration 完了を待つ (issue #750)
    await waitForReactHydration(page);
  });
```

- [ ] **Step 2: 型チェック**

Run: `npx astro check --filter tests/e2e/dsn-builder.spec.ts`（filter が効かない場合は `node_modules/.bin/astro check`）
Expected: エラー 0 件（既存 warning は無視）

- [ ] **Step 3: 該当 E2E を実行して pass を確認**

Run: `npm run test:e2e -- tests/e2e/dsn-builder.spec.ts`
Expected: 全件 PASS

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/dsn-builder.spec.ts
git commit -m "test(e2e): dsn-builder spec に hydration 待ちを追加"
```

---

### Task 2: dummy-personal-data.spec.ts に hydration 待ちを追加

**Files:**

- Modify: `tests/e2e/dummy-personal-data.spec.ts:1-6`

- [ ] **Step 1: import と beforeEach を修正**

現状（1〜6 行目）:

```ts
import { test, expect } from '@playwright/test';

test.describe('日本語ダミー個人データ生成', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/dummy-personal-data');
  });
```

以下に変更:

```ts
import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './helpers';

test.describe('日本語ダミー個人データ生成', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/dummy-personal-data');
    // click → React handler が hydration 完了前に走ると無反応になり
    // flaky になるため、island の hydration 完了を待つ (issue #750)
    await waitForReactHydration(page);
  });
```

- [ ] **Step 2: 該当 E2E を実行して pass を確認**

Run: `npm run test:e2e -- tests/e2e/dummy-personal-data.spec.ts`
Expected: 全件 PASS

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/dummy-personal-data.spec.ts
git commit -m "test(e2e): dummy-personal-data spec に hydration 待ちを追加"
```

---

### Task 3: har-viewer.spec.ts にローカルヘルパー経由で hydration 待ちを追加

**Files:**

- Modify: `tests/e2e/har-viewer.spec.ts`

**注意:** 2 つの test（135 行付近「固定文言カラム…」、258 行付近「タイミング列…」）は goto **前**に `setViewportSize` を呼ぶ。この順序を保つため `beforeEach` 集約はせず、ローカルヘルパーで置換する。

- [ ] **Step 1: import 修正とローカルヘルパー追加**

1 行目の import を修正:

```ts
import { test, expect, type Page } from '@playwright/test';
import { waitForReactHydration } from './helpers';
```

既存の `uploadHar` ヘルパー定義（85〜99 行付近）の直後・`test.describe('HAR ビューア', ...)` の直前に追加:

```ts
/**
 * HAR ビューアを開き React island の hydration 完了まで待つ。
 * setInputFiles → React onChange が hydration 前に走ると file が処理されず
 * flaky になるため、各 test の goto はこのヘルパー経由に統一する (issue #750)。
 * ※ viewport を変える test は本ヘルパー呼び出し前に setViewportSize すること。
 */
async function openHarViewer(page: Page): Promise<void> {
  await page.goto('/tools/har-viewer');
  await waitForReactHydration(page);
}
```

- [ ] **Step 2: 8 箇所の goto を置換**

`await page.goto('/tools/har-viewer');` （8 箇所: 103, 121, 140, 167, 188, 224, 260, 318 行付近）をすべて以下に置換:

```ts
await openHarViewer(page);
```

置換後に `grep -n "page.goto" tests/e2e/har-viewer.spec.ts` で 0 件になることを確認。

- [ ] **Step 3: 該当 E2E を実行して pass を確認**

Run: `npm run test:e2e -- tests/e2e/har-viewer.spec.ts`
Expected: 全件 PASS

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/har-viewer.spec.ts
git commit -m "test(e2e): har-viewer spec に hydration 待ちを追加"
```

---

### Task 4: 漏れ防止 meta テストの追加

**Files:**

- Create: `tests/meta/e2e-hydration-wait-coverage.test.ts`

- [ ] **Step 1: meta テストを作成**

以下の内容で新規作成:

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * meta test: E2E spec の hydration 待ち漏れ検出 (issue #750 再発防止策)
 *
 * Playwright の fill / click / setInputFiles が React island の hydration
 * 完了前に実行されると、DOM だけ書き換わり React の onChange が発火しない
 * hydration race で flaky になる（CI は workers:1 で顕在化せずローカル並列
 * 実行でのみ落ちるため発見が遅れる）。
 *
 * 検知ルール: `tests/e2e/*.spec.ts` のうちソースに `goto('/tools/...')` を
 * 含むファイルは `waitForReactHydration` または `withProductionCsp`（内部で
 * hydration 待ちを実施）への参照を必須とする。
 *
 * 除外基準: React のイベントハンドラ発火に依存しない spec（computed style
 * 読取のみ等）は ALLOWLIST に理由付きで登録する。`/test-fixtures/*` や
 * 静的ページのみへ goto する spec は検知対象外（gate spec 等は自然に除外）。
 *
 * 注意: 参照検出はソース文字列ベースの heuristic（コメント内の言及でも
 * 通過しうる）。厳密性より「新規 spec 作成時の完全な失念」の検知を目的とする。
 */

const E2E_DIR = join(__dirname, '../e2e');

/** hydration 待ち不要と判断した spec の allowlist（除外理由を必ず併記） */
const ALLOWLIST: ReadonlyMap<string, string> = new Map([
  [
    'prefers-reduced-motion.spec.ts',
    'computed style の読取のみで React イベントハンドラの発火に依存しない',
  ],
]);

const TOOLS_GOTO_RE = /goto\(\s*['"`]\/tools\//;
const HYDRATION_HELPER_RE = /waitForReactHydration|withProductionCsp/;

interface SpecSource {
  name: string;
  content: string;
}

/** hydration 待ちが漏れている spec 名を返す純粋関数（陰性/陽性両対照で共有） */
function findSpecsMissingHydrationWait(
  specs: readonly SpecSource[],
  allowlist: ReadonlyMap<string, string>
): string[] {
  return specs
    .filter((s) => !allowlist.has(s.name))
    .filter((s) => TOOLS_GOTO_RE.test(s.content))
    .filter((s) => !HYDRATION_HELPER_RE.test(s.content))
    .map((s) => s.name)
    .sort();
}

/**
 * allowlist の腐敗（orphan）を返す純粋関数。
 * 実在しない・既にヘルパー使用済み・/tools/ へ goto しない spec が
 * allowlist に残っている場合に検出する（vrt-pages-coverage の orphan 検出踏襲）。
 */
function findOrphanAllowlistEntries(
  specs: readonly SpecSource[],
  allowlist: ReadonlyMap<string, string>
): string[] {
  const byName = new Map(specs.map((s) => [s.name, s]));
  return [...allowlist.keys()]
    .filter((name) => {
      const spec = byName.get(name);
      if (!spec) return true;
      return HYDRATION_HELPER_RE.test(spec.content) || !TOOLS_GOTO_RE.test(spec.content);
    })
    .sort();
}

function loadSpecs(): SpecSource[] {
  return readdirSync(E2E_DIR)
    .filter((f) => f.endsWith('.spec.ts'))
    .map((name) => ({ name, content: readFileSync(join(E2E_DIR, name), 'utf8') }));
}

describe('E2E hydration 待ちカバレッジ', () => {
  it('goto(/tools/*) する全 spec が waitForReactHydration か withProductionCsp を使用している', () => {
    const missing = findSpecsMissingHydrationWait(loadSpecs(), ALLOWLIST);
    expect(missing).toEqual([]);
  });

  it('ALLOWLIST に orphan エントリがない', () => {
    const orphans = findOrphanAllowlistEntries(loadSpecs(), ALLOWLIST);
    expect(orphans).toEqual([]);
  });
});

// 陽性対照: 検知機構が空回りしていないことを保証 (test-gates skill 準拠)。
// fixture を注入し、検知ロジックが実際に違反を列挙することを確認する。
describe('[陽性対照] E2E hydration 待ちカバレッジ検知機構', () => {
  const emptyAllowlist: ReadonlyMap<string, string> = new Map();

  it('hydration 待ちなしで /tools/ へ goto する fixture を検出する', () => {
    const fixture: SpecSource = {
      name: 'fake-missing.spec.ts',
      content: `await page.goto('/tools/fake-tool');\nawait page.fill('#x', 'y');`,
    };
    expect(findSpecsMissingHydrationWait([fixture], emptyAllowlist)).toEqual([
      'fake-missing.spec.ts',
    ]);
  });

  it('waitForReactHydration 使用済み fixture は検出しない（過検知なし）', () => {
    const fixture: SpecSource = {
      name: 'fake-ok.spec.ts',
      content: `await page.goto('/tools/fake-tool');\nawait waitForReactHydration(page);`,
    };
    expect(findSpecsMissingHydrationWait([fixture], emptyAllowlist)).toEqual([]);
  });

  it('withProductionCsp 使用済み fixture は検出しない（過検知なし）', () => {
    const fixture: SpecSource = {
      name: 'fake-csp.spec.ts',
      content: `await withProductionCsp(browser, '/tools/fake-tool', async (page) => {});`,
    };
    expect(findSpecsMissingHydrationWait([fixture], emptyAllowlist)).toEqual([]);
  });

  it('/tools/ 以外へ goto する fixture は検出しない（gate spec 等の除外）', () => {
    const fixture: SpecSource = {
      name: 'fake-fixture-page.spec.ts',
      content: `await page.goto('/test-fixtures/hydration-broken');`,
    };
    expect(findSpecsMissingHydrationWait([fixture], emptyAllowlist)).toEqual([]);
  });

  it('allowlist 登録済み fixture は検出しない', () => {
    const fixture: SpecSource = {
      name: 'fake-allowed.spec.ts',
      content: `await page.goto('/tools/fake-tool');`,
    };
    const allowlist = new Map([['fake-allowed.spec.ts', 'テスト用の除外理由']]);
    expect(findSpecsMissingHydrationWait([fixture], allowlist)).toEqual([]);
  });

  it('orphan 検出: 実在しない allowlist エントリを検出する', () => {
    const allowlist = new Map([['no-such-file.spec.ts', '理由']]);
    expect(findOrphanAllowlistEntries([], allowlist)).toEqual(['no-such-file.spec.ts']);
  });

  it('orphan 検出: ヘルパー使用済みなのに allowlist に残るエントリを検出する', () => {
    const fixture: SpecSource = {
      name: 'fake-migrated.spec.ts',
      content: `await page.goto('/tools/x');\nawait waitForReactHydration(page);`,
    };
    const allowlist = new Map([['fake-migrated.spec.ts', '理由']]);
    expect(findOrphanAllowlistEntries([fixture], allowlist)).toEqual(['fake-migrated.spec.ts']);
  });
});
```

- [ ] **Step 2: meta テストを実行して pass を確認**

Run: `npm run test -- tests/meta/e2e-hydration-wait-coverage.test.ts`
Expected: 全件 PASS（Task 1〜3 で 3 spec 修正済みのため陰性対照が green）

- [ ] **Step 3: 旧実装相当で fail することを実機確認（陽性対照の実地検証）**

一時的に dsn-builder の修正を外して本体テストが fail することを確認し、直後に復元する:

```bash
git stash push tests/e2e/dsn-builder.spec.ts
npm run test -- tests/meta/e2e-hydration-wait-coverage.test.ts
# Expected: 「goto(/tools/*) する全 spec が…」が FAIL し dsn-builder.spec.ts を列挙
git stash pop
npm run test -- tests/meta/e2e-hydration-wait-coverage.test.ts
# Expected: 全件 PASS に戻る
```

- [ ] **Step 4: Commit**

```bash
git add tests/meta/e2e-hydration-wait-coverage.test.ts
git commit -m "test(meta): E2E spec の hydration 待ち漏れ検出 meta テストを追加"
```

---

### Task 5: 全体検証

- [ ] **Step 1: ユニットテスト全件**

Run: `npm run test`
Expected: 全件 PASS

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラー 0 件

- [ ] **Step 3: E2E 全件（並列 worker で hydration race の再発がないこと）**

Run: `npm run test:e2e`
Expected: 全件 PASS

- [ ] **Step 4: 未コミット差分がないことを確認**

Run: `git status --short`
Expected: 出力なし
