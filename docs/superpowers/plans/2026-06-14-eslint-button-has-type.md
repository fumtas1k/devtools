# ESLint + react/button-has-type 導入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `<button>` の `type` 属性漏れを ESLint `react/button-has-type` ルールで機械検出し、CI で恒久的に enforce する。

**Architecture:** ESLint v9 flat config をゼロから最小構成で導入する。`@typescript-eslint/parser` で `.tsx` をパースし、`eslint-plugin-react` の `react/button-has-type` 1 本のみを error にする（recommended は無効）。検知能力は陽性/陰性対照のメタテストで保証し、`test.yml` の test job に lint step を追加する。

**Tech Stack:** ESLint 9（flat config）, @typescript-eslint/parser 8, eslint-plugin-react 7, Vitest（メタテスト）

> **バージョン固定の根拠**: eslint-plugin-react@7.37.5 の peer は `eslint ^9.7` までで eslint 10 を含まない。peer conflict を避けるため eslint は `^9` 系（9.39.4）に固定する。@typescript-eslint/parser@8 の peer（eslint 9.0.0 OK / typescript <6.1.0）はプロジェクトの typescript 5.9.3 と整合。

---

## ファイル構成

- Create: `eslint.config.js` — flat config（lint 対象・parser・ルール定義）
- Create: `tests/meta/eslint-button-has-type.test.ts` — 陽性/陰性対照メタテスト
- Modify: `package.json` — devDependencies 3 件追加 + `lint` script
- Modify: `package-lock.json` — 依存同期（npm install が自動更新）
- Modify: `.github/workflows/test.yml` — test job に lint step 追加
- Modify: `docs/decisions.md` — 決定記録 `[115]`
- Modify: `CLAUDE.md` — §2 コマンドリファレンス表に `npm run lint` 追記

---

### Task 1: ESLint 最小構成の導入（依存・config・script）

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json`（scripts / devDependencies）
- Modify: `package-lock.json`（自動）

- [ ] **Step 1: 依存を追加**

Run:
```bash
npm install --save-dev --cache "$TMPDIR/npm-cache" --no-audit --no-fund \
  eslint@^9 @typescript-eslint/parser@^8 eslint-plugin-react@^7
```
Expected: peer conflict（ERESOLVE）なくインストール完了。`package.json` の devDependencies に 3 件、`package-lock.json` が更新される。

- [ ] **Step 2: flat config を作成**

Create `eslint.config.js`:
```js
import react from 'eslint-plugin-react';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    files: ['src/**/*.{tsx,jsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react },
    rules: {
      // #569: button の type 漏れ（デフォルト submit 化による意図しない form 送信）を機械検出。
      // recommended ルールセットは導入せず、本ルール 1 本のみに限定する（最小 blast radius）。
      'react/button-has-type': 'error',
    },
  },
];
```

- [ ] **Step 3: lint script を追加**

`package.json` の `scripts` に追加（`format:check` の次の行など）:
```json
    "lint": "eslint .",
```

- [ ] **Step 4: 既存違反を自動修正して pass を確認**

Run:
```bash
npm run lint -- --fix
npm run lint
```
Expected: `npm run lint` が exit 0（違反 0 件）。`--fix` で `.tsx` の type 漏れがあれば `type="button"` 等が自動付与される。`git diff` で意図しない変更が無いか確認する。

> もし大量の違反（数十件規模で、自動修正が design 上問題になる）が出た場合は、その場で修正せず親に報告し別 issue 化を相談すること。少数の機械的な type 付与は本 PR で完結させる。

- [ ] **Step 5: 型チェック（config は JS だが念のため全体確認）**

Run: `node_modules/.bin/astro check`
Expected: errors / warnings / hints すべて 0。

- [ ] **Step 6: Commit**

```bash
git add eslint.config.js package.json package-lock.json
# Step 4 で .tsx が自動修正された場合はそのファイルも add する
git commit -m "chore: ESLint と react/button-has-type を導入 (#569)"
```

---

### Task 2: 陽性/陰性対照メタテスト（test-gates 準拠）

**Files:**
- Create: `tests/meta/eslint-button-has-type.test.ts`

> test-gates 規約: 検知機構には陽性対照が必須。「ルールが実際に違反を検出できる」ことを ESLint API で直接検証し、設定ミスで検知能力ゼロのまま green になる事故を排除する。

- [ ] **Step 1: メタテストを作成**

Create `tests/meta/eslint-button-has-type.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// プロジェクトルート（このファイルは tests/meta/ 配下）
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

// src/ 配下の filePath を与えて flat config の files パターンにマッチさせる
async function lintTsx(code: string) {
  const eslint = new ESLint({ cwd: projectRoot });
  const [result] = await eslint.lintText(code, {
    filePath: path.join(projectRoot, 'src/__eslint_positive_control__.tsx'),
  });
  return result;
}

describe('eslint react/button-has-type ガード', () => {
  it('陽性対照: type 無し button を検出して error にする', async () => {
    const result = await lintTsx(
      'export const A = () => <button>x</button>;\n',
    );
    const hits = result.messages.filter(
      (m) => m.ruleId === 'react/button-has-type',
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(result.errorCount).toBeGreaterThan(0);
  });

  it('陰性対照: type 付き button は検出しない', async () => {
    const result = await lintTsx(
      'export const A = () => <button type="button">x</button>;\n',
    );
    const hits = result.messages.filter(
      (m) => m.ruleId === 'react/button-has-type',
    );
    expect(hits.length).toBe(0);
  });
});
```

- [ ] **Step 2: テストを実行して両ケース pass を確認**

Run: `npm run test -- tests/meta/eslint-button-has-type.test.ts`
Expected: 2 tests passed（陽性対照=検出する / 陰性対照=検出しない）。

- [ ] **Step 3: 陽性対照が「本当に検知している」ことを手動確認（任意・記録のみ）**

config の `react/button-has-type` を一時的に `'off'` にすると陽性対照テストが FAIL することを目視確認し、確認後に必ず `'error'` へ戻す（コミットには含めない）。これにより「常に pass する空回りテスト」でないことを担保する。

- [ ] **Step 4: Commit**

```bash
git add tests/meta/eslint-button-has-type.test.ts
git commit -m "test: react/button-has-type の陽性/陰性対照メタテストを追加 (#569)"
```

---

### Task 3: CI 組込みとドキュメント更新

**Files:**
- Modify: `.github/workflows/test.yml`
- Modify: `docs/decisions.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: test.yml に lint step を追加**

`.github/workflows/test.yml` の test job、「フォーマットチェックを実行」step の直後（`astro check` step の前）に追加:
```yaml
      - name: ESLint を実行（button type 漏れ検出 / #569）
        run: npm run lint
```

- [ ] **Step 2: decisions.md に決定記録を追加**

`docs/decisions.md` の末尾（`[114]` エントリの後）に追加:
```markdown

## [115] ESLint 導入 — react/button-has-type のみに限定 + CI enforce

**2026-06-14 | ステータス: 採用**

### 背景

#271（親）のフォローアップ #569。`<button>` は `type` 省略時にデフォルト submit 化し、`<form>` 内で意図しない送信を招く事故クラスがある。本プロジェクトには ESLint が未導入だったため、ゼロから最小構成で導入する。

### 決断

- **ルールを `react/button-has-type` 1 本に限定**: recommended ルールセットは有効化しない。最小 blast radius で受け入れ基準を満たし、既存コードの大量違反リスクを排除する（将来のルール追加は別 issue）。
- **依存最小化**: `eslint`（^9） + `@typescript-eslint/parser`（^8, .tsx パース用） + `eslint-plugin-react`（^7）のみ。typescript-eslint の recommended プラグインは入れない。
- **バージョン固定**: eslint-plugin-react@7.37.5 の peer が `eslint ^9.7` までのため eslint は `^9` 系に固定（eslint 10 は peer conflict）。
- **`.astro` は対象外**: HTML button は全件 type 付与済み（#566 等）で、`react/button-has-type` は JSX 専用。astro 用 parser/plugin の追加は YAGNI。
- **CI enforce（CLAUDE.md §9.2 準拠の CI 設定変更）**: `test.yml` の test job に `npm run lint` step を追加。lint は OS 非依存のため test job 1 箇所のみ（e2e job には追加しない）。
- **test-gates 準拠**: `tests/meta/eslint-button-has-type.test.ts` で ESLint API による陽性/陰性対照を併設し、検知能力ゼロで green になる事故を防止する。

### 結果・トレードオフ

- ✅ button type 漏れを CI で恒久的に機械検出。陽性対照で検知能力を継続検証。
- ✅ ルール 1 本限定で導入時の既存違反・レビュー負荷が最小。
- ⚠️ 他の lint 観点（hooks 依存配列・未使用変数等）は未カバー。必要になれば別 issue で recommended 化を検討する。
```

> 実装時に `[114]` が最新であることを `grep -E '^## \[[0-9]+\]' docs/decisions.md | tail -1` で再確認し、ズレていれば採番を合わせること。

- [ ] **Step 3: CLAUDE.md のコマンドリファレンス表に追記**

`.agents/rules/common.md`（CLAUDE.md が import）の §2 コマンドリファレンス表に行を追加。※ 表の正本は `.agents/rules/common.md` 側。「整形 / 整形チェック」行の下に:
```markdown
| Lint（button type 漏れ検出 / コミット前推奨） | `npm run lint`                                   |
```

> 実装時に該当表が `CLAUDE.md` 本体か `.agents/rules/common.md` のどちらにあるか Grep で確認してから編集すること（このプロジェクトでは `.agents/rules/common.md` §2 が正本）。

- [ ] **Step 4: 最終検証（push 前必須）**

Run:
```bash
npm run lint
npm run test
node_modules/.bin/astro check
```
Expected: lint exit 0 / 全テスト pass（メタテスト含む）/ astro check 0/0/0。

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/test.yml docs/decisions.md .agents/rules/common.md
git commit -m "ci: ESLint を CI に組込み + 導入記録を追加 (#569)"
```

---

## 完了後

- 全コミット後、`git diff origin/develop --name-only` に `package.json` があれば `package-lock.json` も含まれているか確認（CLAUDE.md §6.9）。
- push → PR 作成（`--base develop`）。受け入れ基準のチェックボックスを PR 本文に転記。

## 受け入れ基準対応表

| 受け入れ基準 | 対応タスク |
| :-- | :-- |
| `npm run lint` 定義 + 違反検出（陽性対照） | Task 1 Step 3 / Task 2 |
| 既存コードで lint pass | Task 1 Step 4 |
| CI 組込み + decisions.md 記録 | Task 3 Step 1-2 |
| package-lock.json 同期 | Task 1 Step 1 / 完了後チェック |
