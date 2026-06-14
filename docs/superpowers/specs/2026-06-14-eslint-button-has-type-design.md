# ESLint + react/button-has-type 最小導入 設計

- 対応 issue: #569（親 #271、進捗管理 #533 C セクション）
- 作成日: 2026-06-14

## 目的

`<button>` への `type` 属性漏れを **lint で機械検出** する恒久対策を導入する。React の `<button>` は `type` 省略時にデフォルトで `type="submit"` 扱いになり、`<form>` 内で意図しない submit を引き起こす事故クラスがある。本プロジェクトには現状 ESLint 自体が未導入のため、ゼロから最小構成で導入する。

## スコープ判断（ユーザー承認済み）

- **Lint 範囲**: `react/button-has-type` のみに限定（recommended ルールセットは有効化しない）。最小 blast radius で issue 受け入れ基準を満たし、既存大量違反のリスクを排除する。
- **CI 組込み**: `test.yml` の `test` job に lint step を追加する。恒久的な機械検出を成立させる。

## 設計

### 1. 依存追加（devDependencies）

| パッケージ | 用途 |
| :-- | :-- |
| `eslint`（v9 系, flat config） | lint 本体 |
| `@typescript-eslint/parser` | `.tsx` の TypeScript 構文をパースする parser |
| `eslint-plugin-react` | `react/button-has-type` ルールを提供 |

typescript-eslint の recommended プラグインは導入しない（parser のみ）。これにより有効ルールを `button-has-type` 1 本に厳密に絞れる。`package.json` 変更に伴い `package-lock.json` も同期する。

### 2. flat config（`eslint.config.js`）

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
      'react/button-has-type': 'error',
    },
  },
];
```

- `.astro` ファイルは対象外。HTML `<button>` は既に全件 `type` 付与済みで（#566 等）、かつ `react/button-has-type` は JSX 専用で astro テンプレートの HTML には適用されないため、astro 用 parser/plugin の追加は YAGNI。
- recommended ルールセットは一切有効化しない。

### 3. `package.json`

- `scripts` に `"lint": "eslint ."` を追加。
- flat config の `files` パターンにより、`eslint .` でも実質 `src/**/*.{tsx,jsx}` のみが対象になる。

### 4. 既存違反の解消

`npm run lint -- --fix` を実行する。`.astro` は対応済みのため新規違反は少ない見込み。`.tsx`（テストファイル含む）で違反があれば自動付与する。大量に出た場合のみ別 issue 化を検討する（軽微は本 PR で完結させる）。

### 5. 陽性対照テスト（`tests/meta/eslint-button-has-type.test.ts`）

test-gates 規約（ガード・検知機構には陽性対照必須）に従う。検知能力ゼロで green になる事故を排除するため、ESLint API でルールの検出能力を直接検証する。

- `new ESLint({ cwd })` でプロジェクトの flat config を読み込み、`lintText` でインライン検証する。
- **陽性対照**: `type` 無しの `<button>` を含むコードで `react/button-has-type` の error が **1 件以上** 出ることを assert。
- **陰性対照**: `type="button"` 付き `<button>` を含むコードで error が **0 件** であることを assert。
- `lintText` の `filePath` を `src/` 配下（例: `src/__eslint_positive_control__.tsx`）にして config の `files` パターンにマッチさせる。

### 6. CI 組込み（`.github/workflows/test.yml`）

`test` job の「フォーマットチェックを実行」step の直後に lint step を追加する:

```yaml
- name: ESLint を実行（button type 漏れ検出）
  run: npm run lint
```

`e2e` job には追加しない（lint は OS 非依存で test job 1 箇所あれば十分）。

### 7. ドキュメント更新

- `docs/decisions.md`: ESLint 導入の意思決定を記録。
  - なぜ `button-has-type` 限定か（最小 blast radius / 既存違反リスク回避）
  - CI 組込みの理由と安全性（CLAUDE.md §9.2 セキュリティ/CI 設定変更の記録義務に準拠）
- `CLAUDE.md` §2 コマンドリファレンス表に `npm run lint` を追記。

## 受け入れ基準（issue #569 より）

- [ ] `npm run lint` が定義され、`react/button-has-type` 違反を検出できる（陽性対照テストで保証）
- [ ] 既存コードベースで lint が pass する
- [ ] CI（test.yml）に lint step を追加し、decisions.md に理由を記録
- [ ] `package.json` 変更に伴い `package-lock.json` も同期

## 検証（push 前必須）

- `npm run lint`（pass 確認）
- `npm run test`（陽性/陰性対照メタテスト含む）
- `node_modules/.bin/astro check`
- E2E: 本変更は UI 非変更のためスコープ外。

## スコープ外

- recommended ルールセットの有効化（将来別 issue）
- `.astro` ファイルの lint 対応（astro-eslint-parser / eslint-plugin-astro の導入）
- prettier との統合（eslint-config-prettier 等）
