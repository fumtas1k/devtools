# SQL整形ツール（PR1）実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ブラウザ完結で SQL を方言別に整形（インデント）する新ツール `/tools/sql-formatter` を、単体で出荷可能な状態で追加する。

**Architecture:** 整形ロジックを `src/utils/sql/format.ts` に純粋関数として隔離し（失敗時は日本語 `Error` を throw）、React コンポーネント `SqlFormatter.tsx` が `useCodec`（入力→デバウンス→変換→出力/エラー）経由で呼び出す。プレースホルダ埋め込み機能は PR2 で別途追加するため、本 PR では整形タブのみ（`ToggleGroup` なし）。

**Tech Stack:** Astro 6 + React 19 + TypeScript / `sql-formatter@15.8.0`（MIT）/ Vitest（単体）/ Playwright（E2E・VRT）

**設計の正本:** `docs/superpowers/specs/2026-05-26-sql-formatter-design.md`（PR1 は 9 章「PR1: SQL 整形ツール」に対応）

---

### Task 1: 依存ライブラリ `sql-formatter` を追加

**Files:**

- Modify: `package.json`（dependencies）
- Modify: `package-lock.json`

- [ ] **Step 1: 依存を追加（バージョン固定）**

ローカルの `~/.npm` に権限問題があるため cache を `$TMPDIR` に指定する。プロジェクトのバージョン固定ポリシーに従い、キャレットなしの厳密バージョンで入れる。

Run:

```bash
npm install sql-formatter@15.8.0 --save-exact --cache "$TMPDIR/npm-cache" --no-audit --no-fund
```

- [ ] **Step 2: package.json に厳密バージョンで入ったか確認**

Run: `grep '"sql-formatter"' package.json`
Expected: `"sql-formatter": "15.8.0",`（キャレット `^` が付いていないこと）

- [ ] **Step 3: lock 同期と型チェックの確認**

Run: `git diff --name-only`
Expected: `package.json` と `package-lock.json` の両方が変更されていること（片方だけなら lock 不整合）。

Run: `node_modules/.bin/astro check`
Expected: エラーなし（既存コードに影響しないこと）。

- [ ] **Step 4: コミット**

```bash
git add package.json package-lock.json
git commit -m "build: SQL整形用に sql-formatter を追加"
```

---

### Task 2: 整形ロジック `formatSql` を TDD で実装

**Files:**

- Create: `src/utils/sql/format.ts`
- Create: `src/utils/sql/index.ts`（バレル）
- Test: `src/utils/sql/__tests__/format.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/utils/sql/__tests__/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatSql } from '../format';

describe('formatSql', () => {
  it('小文字キーワードを大文字に整形しインデントする', () => {
    const result = formatSql('select id, name from users where id = 1', 'mysql');
    expect(result).toContain('SELECT');
    expect(result).toContain('FROM');
    expect(result).toContain('WHERE');
    // 複数行に整形される
    expect(result.split('\n').length).toBeGreaterThan(1);
  });

  it('PostgreSQL 方言で整形できる', () => {
    const result = formatSql('select * from t', 'postgresql');
    expect(result).toContain('SELECT');
    expect(result).toContain('*');
    expect(result).toContain('FROM');
  });

  it('SQLite 方言で整形できる', () => {
    const result = formatSql('select 1', 'sqlite');
    expect(result).toContain('SELECT');
  });

  it('SQL Server 方言（transactsql）で整形できる', () => {
    const result = formatSql('select top 1 id from t', 'sqlserver');
    expect(result).toContain('SELECT');
  });

  it('整形不能な入力で日本語エラーを投げる', () => {
    // 閉じられていない括弧などトークナイザがエラーにする入力
    expect(() => formatSql("select * from t where name = 'unterminated", 'mysql')).toThrow(
      'SQL を整形できませんでした'
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/utils/sql/__tests__/format.test.ts`
Expected: FAIL（`formatSql` が未定義 / モジュール解決エラー）

- [ ] **Step 3: 最小実装を書く**

`src/utils/sql/format.ts`:

```ts
import { format, type SqlLanguage } from 'sql-formatter';

/** UI が扱う方言キー。 */
export type SqlDialect = 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver';

/** UI の方言キー → sql-formatter の language。SQL Server は transactsql。 */
const LANGUAGE_MAP: Record<SqlDialect, SqlLanguage> = {
  mysql: 'mysql',
  postgresql: 'postgresql',
  sqlite: 'sqlite',
  sqlserver: 'transactsql',
};

/**
 * SQL を指定方言で整形する。キーワードは大文字・2 スペースインデント固定。
 * sql-formatter がトークナイズに失敗した場合は日本語メッセージの Error を投げる。
 */
export function formatSql(sql: string, dialect: SqlDialect): string {
  try {
    return format(sql, {
      language: LANGUAGE_MAP[dialect],
      keywordCase: 'upper',
      tabWidth: 2,
      indentStyle: 'standard',
    });
  } catch {
    throw new Error('SQL を整形できませんでした。構文を確認してください');
  }
}
```

`src/utils/sql/index.ts`:

```ts
export { formatSql, type SqlDialect } from './format';
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/utils/sql/__tests__/format.test.ts`
Expected: PASS（5 件）

注意: もし「整形不能な入力」のテストで `formatSql` が throw せず整形を返してしまう場合（sql-formatter が寛容に処理した場合）は、より確実にトークナイザがエラーにする入力（例: `"select * from t group order"` のような不正トークン列、または不正なバッククォート ``"select ` from t"``）に差し替える。目的は「throw 経路が日本語メッセージを返すこと」の検証なので、確実に throw する入力を 1 つ用意できればよい。

- [ ] **Step 5: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/utils/sql/format.ts src/utils/sql/index.ts src/utils/sql/__tests__/format.test.ts
git commit -m "feat: SQL整形ロジック formatSql を追加"
```

---

### Task 3: `SqlFormatter` コンポーネントを実装

**Files:**

- Create: `src/components/tools/SqlFormatter.tsx`

参照する既存コンポーネントの props（`src/components/tools/JsonXml.tsx` と同型）:

- `InputField`: `id, label, value, onChange:(v:string)=>void, placeholder, multiline, rows, error, onSampleClick, mono, resize`
- `OutputField`: `id, label, value, rows, ariaLabel`
- `Select<T>`: `id, options:{value,label}[], value, onChange:(v:T)=>void, ariaLabel`
- `ClearButton`: `onClick`
- `useCodec(transform:(text:string)=>string, deps)` → `{ input, setInput, output, error, reset }`

- [ ] **Step 1: コンポーネントを作成**

`src/components/tools/SqlFormatter.tsx`:

```tsx
import { useState } from 'react';
import { Select } from '@/components/ui/Select';
import { InputField } from '@/components/ui/InputField';
import { OutputField } from '@/components/ui/OutputField';
import { ClearButton } from '@/components/ui/ClearButton';
import { formatSql, type SqlDialect } from '@/utils/sql';
import { useCodec } from '@/hooks/useCodec';

const DIALECT_OPTIONS: { value: SqlDialect; label: string }[] = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'sqlserver', label: 'SQL Server' },
];

const SAMPLE =
  "select u.id, u.name, u.email from users u join orders o on o.user_id = u.id where u.status = 'active' and o.created_at > '2024-01-01' order by o.created_at desc limit 10";

export function SqlFormatter() {
  const [dialect, setDialect] = useState<SqlDialect>('mysql');
  const { input, setInput, output, error, reset } = useCodec(
    (text) => formatSql(text, dialect),
    [dialect]
  );

  return (
    <div className="space-y-6">
      {/* 方言セレクタ */}
      <div className="max-w-xs">
        <label htmlFor="sql-dialect" className="body-emphasis text-default block mb-2">
          SQL 方言
        </label>
        <Select
          id="sql-dialect"
          options={DIALECT_OPTIONS}
          value={dialect}
          onChange={setDialect}
          ariaLabel="SQL 方言"
        />
      </div>

      {/* 入力・出力（横並び） */}
      <div className="flex flex-col md:flex-row gap-4 items-start">
        <div className="w-full md:flex-1 min-w-0">
          <InputField
            id="sql-input"
            label="SQL 入力"
            value={input}
            onChange={setInput}
            placeholder="SELECT * FROM users WHERE id = 1"
            multiline
            rows={16}
            error={error || undefined}
            onSampleClick={() => setInput(SAMPLE)}
            mono
            resize
          />
        </div>

        <div className="w-full md:flex-1 min-w-0">
          <OutputField
            id="sql-output"
            label="整形結果"
            value={output}
            rows={16}
            ariaLabel="整形結果"
          />
        </div>
      </div>

      {/* アクション */}
      <div className="flex justify-end gap-2">
        <ClearButton onClick={reset} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし（`InputField` / `OutputField` / `Select` の props 名が一致していること。不一致があればここで顕在化する）

注意: 色指定に primitive な Tailwind クラス（`text-blue-500` 等）を使わないこと。本コンポーネントはレイアウトクラス（`flex` / `gap` / `max-w-xs` / `mb-2` 等）と既存意味クラス（`body-emphasis` / `text-default`）のみ使用しており新規の色は導入していない。

- [ ] **Step 3: コミット**

```bash
git add src/components/tools/SqlFormatter.tsx
git commit -m "feat: SQL整形コンポーネント SqlFormatter を追加"
```

---

### Task 4: ツール登録（tools.ts / ページ / VRT 登録）

**Files:**

- Modify: `src/data/tools.ts`（`toolEntries` 配列に追記）
- Create: `src/pages/tools/sql-formatter.astro`
- Modify: `tests/e2e/visual-regression-pages.ts`（`PAGES` 配列に追記）

PR1 の時点では埋め込み機能が無いため、name / description は **整形機能のみ** を表す（PR2 で「SQL整形・パラメータ埋め込み」へ改名し description を更新する）。

- [ ] **Step 1: tools.ts にエントリを追加**

`src/data/tools.ts` の `toolEntries` 配列末尾（`totp-hotp` エントリの後）に追加:

```ts
  {
    slug: 'sql-formatter',
    name: 'SQL整形',
    description: '汚いSQLを方言別に整形（インデント）します。MySQL / PostgreSQL / SQLite / SQL Server 対応',
    category: 'convert',
    yomi: 'えすきゅーえるせいけい',
  },
```

- [ ] **Step 2: ページを作成**

`src/pages/tools/sql-formatter.astro`:

```astro
---
import ToolLayout from '@/layouts/ToolLayout.astro';
import ToolInfoSection from '@/components/ui/ToolInfoSection.astro';
import { SqlFormatter } from '@/components/tools/SqlFormatter';
import { tools } from '@/data/tools';

const tool = tools.find((t) => t.slug === 'sql-formatter')!;
---

<ToolLayout tool={tool}>
  <SqlFormatter client:load />

  <ToolInfoSection>
    <p class="tool-info-body">
      汚い SQL を方言（MySQL / PostgreSQL / SQLite / SQL
      Server）に合わせて整形（インデント）します。 キーワードは大文字に統一し、2
      スペースインデントで読みやすく揃えます。すべてブラウザ内で処理され、SQL
      は外部に送信されません。
    </p>
    <h3 class="mb-2 mt-4 tool-info-heading">ユースケース</h3>
    <ul class="list-inside list-disc space-y-1 tool-info-list">
      <li>1 行に潰れた SQL を読みやすく整形したい</li>
      <li>レビューや共有の前にフォーマットを揃えたい</li>
      <li>方言ごとの構文に合わせて整形したい</li>
    </ul>
  </ToolInfoSection>
</ToolLayout>
```

- [ ] **Step 3: VRT 対象に登録**

`tests/e2e/visual-regression-pages.ts` の `PAGES` 配列末尾（`'/tools/totp-hotp',` の後）に追加:

```ts
  '/tools/sql-formatter',
```

- [ ] **Step 4: VRT カバレッジ整合性の meta テストが通ることを確認**

`tests/meta/vrt-pages-coverage.test.ts` が tools.ts の全 slug と PAGES の整合を検証する。tools.ts と PAGES の両方を追加したので green になるはず。

Run: `npm run test`
Expected: 全テスト PASS。集計行 `Test Files N passed` / `Tests M passed` を確認すること（Duration 行だけ見て fail を見落とさない）。

- [ ] **Step 5: ビルドでページが描画されることを確認**

Run: `npm run build`
Expected: ビルド成功（`tools.find(...)!` が undefined にならず、`/tools/sql-formatter` が生成される）。

- [ ] **Step 6: 型チェック**

Run: `node_modules/.bin/astro check`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/data/tools.ts src/pages/tools/sql-formatter.astro tests/e2e/visual-regression-pages.ts
git commit -m "feat: SQL整形ツールをツール一覧・ページ・VRT対象に登録"
```

---

### Task 5: E2E テストを追加

**Files:**

- Create: `tests/e2e/sql-formatter.spec.ts`

既存 `tests/e2e/json-xml.spec.ts` と同じく `withProductionCsp` ヘルパ経由で本番 CSP 下の挙動を検証する。ロケータは `getByRole` / `getByLabel` を使う（`locator('[role=...]')` は使わない）。

- [ ] **Step 1: E2E スペックを書く**

`tests/e2e/sql-formatter.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { withProductionCsp } from './helpers';

test.describe('SQL整形（production CSP 適用）', () => {
  test('サンプルを整形できる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByRole('button', { name: 'サンプルを入力' }).click();
      await expect(page.getByLabel('整形結果')).not.toHaveValue('');
      await expect(page.getByLabel('整形結果')).toHaveValue(/SELECT/);
      await expect(page.getByLabel('整形結果')).toHaveValue(/FROM/);
    });
  });

  test('小文字 SQL を大文字キーワードに整形する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByLabel('SQL 入力').fill('select id from users where id = 1');
      await expect(page.getByLabel('整形結果')).toHaveValue(/SELECT/);
      await expect(page.getByLabel('整形結果')).toHaveValue(/WHERE/);
    });
  });

  test('方言を切り替えても整形できる（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByLabel('SQL 方言').selectOption('postgresql');
      await page.getByLabel('SQL 入力').fill('select * from t');
      await expect(page.getByLabel('整形結果')).toHaveValue(/SELECT/);
    });
  });

  test('整形不能な入力でエラーを表示する（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByLabel('SQL 入力').fill("select * from t where name = 'unterminated");
      await expect(page.getByRole('alert')).toBeVisible();
    });
  });

  test('クリアボタンで出力が消える（CSP 違反なし）', async ({ browser }) => {
    await withProductionCsp(browser, '/tools/sql-formatter', async (page) => {
      await page.getByLabel('SQL 入力').fill('select 1');
      await expect(page.getByLabel('整形結果')).not.toHaveValue('');
      await page.getByRole('button', { name: 'クリア' }).click();
      await expect(page.getByLabel('整形結果')).toHaveValue('');
    });
  });
});
```

- [ ] **Step 2: E2E を実行（preview 経由）**

Run: `npm run test:e2e -- sql-formatter.spec.ts`
Expected: 全 5 件 PASS。

注意: 4321 ポートが stale で hydration/CSP の謎 fail が出たら `npm run pretest:e2e` でポートを kill してから再実行する。「整形不能な入力」テストで alert が出ない場合は、Task 2 Step 4 と同じく確実に throw する入力に揃える（format.ts のテストと E2E で同じ入力を使うこと）。

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/sql-formatter.spec.ts
git commit -m "test: SQL整形ツールの E2E テストを追加"
```

---

### Task 6: ドキュメント更新

**Files:**

- Modify: `README.md`（ツール一覧）
- Modify: `SPEC.md`（2.3 ライブラリ / 2.4 ディレクトリ / 4 / 5 / 9 章）
- Modify: `docs/decisions.md`（選定理由）

各ファイルの既存フォーマットに合わせて追記する（行を追加する前に該当セクションを必ず読む）。

- [ ] **Step 1: README にツールを追記**

`README.md` のツール一覧（既存の各ツール行のフォーマット）に合わせ、`SQL整形`（slug `sql-formatter`, カテゴリ「変換・解析」）の行を追加する。説明は「汚いSQLを方言別に整形（インデント）します」。

- [ ] **Step 2: SPEC.md を更新**

- 2.3 節（ライブラリ一覧）: `sql-formatter@15.8.0`（SQL 整形、MIT）を追加。
- 2.4 節（ディレクトリ構成）: `src/utils/sql/` を追加。
- 4 章・5 章のツール一覧: `sql-formatter` を追加。
- 9 章チェックリスト: SQL整形ツール追加の項目を追加（PR1 完了分）。

- [ ] **Step 3: docs/decisions.md に選定理由を追記**

末尾の連番フォーマットに合わせて 1 エントリ追加:

- sql-formatter を採用した理由（SQL パーサ/整形の手書きは非現実的、多方言対応・MIT・ブラウザ動作・広く使われ保守されている）。
- 対応方言を MySQL / PostgreSQL / SQLite / SQL Server の 4 つに絞った理由（実務カバレッジと選択肢過多のバランス）。

- [ ] **Step 4: フォーマット・型チェック**

Run: `npm run format`
Run: `node_modules/.bin/astro check`
Expected: 整形差分が解消し、型エラーなし。

- [ ] **Step 5: コミット**

```bash
git add README.md SPEC.md docs/decisions.md
git commit -m "docs: SQL整形ツール追加に伴うドキュメント更新"
```

---

## push 前の最終確認（親が実行）

- [ ] `npm run test`（集計行で全 PASS を確認）
- [ ] `node_modules/.bin/astro check`（型）
- [ ] `npm run test:e2e -- sql-formatter.spec.ts`（E2E ローカル実行）
- [ ] `git log --oneline origin/develop..HEAD` をユーザーに見せて push 承認を得る

## PR 作成

- ベースブランチは `develop`（`--base develop` を必ず指定）。
- 本文は `--body-file` 経由（`/tmp/claude/` か `$TMPDIR` の一時ファイル）。
- VRT baseline: マージ前後に CI Linux runner の `Update Visual Regression Baseline` workflow を `workflow_dispatch` で trigger し `/tools/sql-formatter` の baseline を生成する（mac ローカル生成不可）。

## 自己レビュー結果（spec との突き合わせ）

- 仕様 9 章「PR1」の全項目（依存追加 / format.ts / コンポーネント+ページ / tools.ts / VRT 登録 / docs）に対応タスクあり。
- 整形オプション「方言のみ露出」= Task 3 で方言 Select のみ・整形オプションは `format.ts` に既定固定。仕様 4 章と一致。
- 仕様 6 章は「例外を伝播」と記載していたが、本プランは他 util（`json-xml.ts`）と同様に `format.ts` 内で catch し日本語 Error を投げる方針に統一（UX 向上のための軽微な具体化）。
- 埋め込み機能（embedParams / スキャナ / 陽性対照 / 警告バナー）は PR2 スコープのため本プラン対象外。PR1 の name/description は整形機能のみを表し、PR2 で改名する。
