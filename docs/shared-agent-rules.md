# プロジェクト共通開発規約 (AIエージェント用)

このドキュメントは、このリポジトリで作業するすべての AI エージェント（Claude Code, Gemini CLI 等）が遵守すべき共通の規約を定めたものです。

## プロジェクト概要

ブラウザ完結型の開発者ツール集「DevTools」。

- **Framework**: Astro 6.1.5 (SSG)
- **UI**: React 19 (Islands Architecture)
- **Styling**: Tailwind CSS 4.0.0
- **Language**: TypeScript
- **Package Manager**: **npm**（`pnpm` / `yarn` は使用しない）

---

## 1. 言語・出力規約

- **コミットメッセージ・PR 説明文・ユーザー向けテキスト**: **必ず日本語**で書くこと。
- **コミットメッセージ形式**: **Conventional Commits 形式** 必須。`.githooks/commit-msg` で形式と日本語が検証されます。使用可能なプレフィックスは以下の 11 種に限定:
  - `feat:` 新機能 / `fix:` バグ修正 / `docs:` ドキュメント / `chore:` 雑務
  - `refactor:` リファクタリング / `test:` テスト / `style:` スタイル整形
  - `perf:` 性能改善 / `build:` ビルド設定 / `ci:` CI 設定 / `revert:` 取り消し
  - 例: ✅ `feat: 新しいツールを追加` / ❌ `feat: Add new tool`（英語） / ❌ `update: ...`（プレフィックス不正）
  - `Merge`, `Revert`, `fixup!`, `squash!` で始まるコミットはチェックをスキップ
- **コード内コメント**: 日本語を基本とする。

---

## 2. コマンドリファレンス

| 用途                                 | コマンド                                         |
| :----------------------------------- | :----------------------------------------------- |
| 開発サーバー (http://localhost:4321) | `npm run dev`                                    |
| 本番ビルド / プレビュー              | `npm run build` / `npm run preview`              |
| 整形 / 整形チェック                  | `npm run format` / `npm run format:check`        |
| 型チェック（コミット前必須）         | `node_modules/.bin/astro check`                  |
| ユニットテスト (Vitest)              | `npm run test` / `npm run test:watch`            |
| E2E テスト (Playwright)              | `npm run test:e2e` ❌ `npm run e2e` は存在しない |

---

## 3. 実装後の検証義務

実装完了後（コミット前）に **`npm run test`** と **`npm run test:e2e`** を必ず実行し、デグレード無しを確認すること。

**E2E テストは実装と同時に書く**: バグ修正・UI 挙動の変更時はコミット前に該当ケースの E2E を追加する。後回し禁止。

---

## 4. ドキュメント更新ルール

実装変更をコミットする前に、以下のファイルへの影響を確認・更新すること。

| 変更の種類                  | 更新が必要なファイル                                                                      |
| :-------------------------- | :---------------------------------------------------------------------------------------- |
| ツール追加                  | `README.md` (ツール一覧), `SPEC.md` (2.3, 2.4, 4, 5, 9章), `docs/decisions.md` (選定理由) |
| ツール削除・slug変更        | 上記すべて                                                                                |
| ライブラリ追加・削除        | `SPEC.md` (2.3節), `docs/decisions.md`                                                    |
| ディレクトリ構成変更        | `SPEC.md` (2.4節)                                                                         |
| フェーズ・タスク完了        | `SPEC.md` (9章チェックリスト)                                                             |
| 設計上の重要な決断          | `docs/decisions.md`                                                                       |
| セキュリティ設定変更 (CI等) | `docs/decisions.md` (変更理由と安全性の確認)                                              |

---

## 5. ツール追加・実装フロー

新しいツールを追加する場合は以下の手順で実装する:

1. `src/components/tools/ToolName.tsx` を作成
2. `src/pages/tools/tool-slug.astro` を作成（`client:load` で React コンポーネントをマウント）
3. `src/pages/index.astro` のツール一覧に追加
4. 4 章「ドキュメント更新ルール」に従い `README.md` / `SPEC.md` / `docs/decisions.md` を更新

新しい入力欄・ボタン・エラー表示等を実装する前に、`src/components/ui/` の既存共通コンポーネント（`InputField`, `CopyButton`, `DownloadButton` 等）を確認すること。一覧と用途は `docs/ui-conventions.md` を参照。

---

## 6. AI エージェント操作・Git ワークフロー

### 6.1 GitHub CLI のエスケープ事故防止

`gh` コマンドで複数行・バックティック（`）を含む本文を渡すときは、**直接引数に渡さず一時ファイル経由で投稿すること**。具体的には `-F`または`--body-file` オプションを使用する（MCP / API 経由は不要）。失敗時は投稿状況を必ず確認し、重複は削除して整合性を保つ。

### 6.2 ブランチ運用

- **`develop` には直接コミットしない**: 必ず feature ブランチを切る。誤って始めた場合は `git stash` → ブランチ切替 → `git stash pop`。
- **新規作業の手順**: `git checkout develop` → `git pull origin develop` → `git checkout -b feat/<topic>`（または `fix/`, `docs/`, `refactor/` 等）

### 6.3 PR 作成時のベースブランチ

`gh pr create` は **`--base develop`** を必ず指定する（デフォルトは `main`）:

```bash
gh pr create --base develop --title "..." --body-file /tmp/pr_body.md
```

---

## 7. スタイル・UI ルール（基本）

Tailwind のカラークラス（`text-blue-500`, `bg-red-50`, `hover:bg-red-50` 等）は **絶対に使用しない**。色は CSS 変数経由で指定する:

- React (`.tsx`): `src/utils/styles.ts` の `colors.*` をインラインスタイルで使用
- Astro (`.astro`): `var(--color-*)` を `style` 属性または `<style>` ブロックで使用

※ レイアウト用クラス（`flex`, `gap`, `p-*`, `rounded` 等）は使用可。

UI コンポーネントを実装・改修する際の詳細パターン（ホバー処理・ボタン高さ揃え・レスポンシブ・ToggleGroup リセット要否 等）は **`docs/ui-conventions.md` 2章** を参照すること。

---

## 8. UI 変更時の目視確認 (Playwright)

UI 変更時は **PC (1280x800)** と **スマホ (390x844)** 両方でスクリーンショットを撮影し、コミット前に以下を目視確認:

- 入力・出力エリアの上端揃え／スマホ幅で縦並びレイアウトに切替
- ボタンの隠れ・重なりがないか／ラベル行高さの左右揃え
- フォーカスリングの見切れ／タップ領域 ≥ 44x44px

撮影手順・ロケーター推奨など Playwright の詳細は **`docs/ui-conventions.md` 3章** を参照すること。

---

## 9. プロジェクト構造

- `src/components/tools/`: ツール本体 (React TSX)
- `src/components/ui/`: 共通UIコンポーネント (`InputField`, `CopyButton` 等)
- `src/hooks/`: 共通フック
- `src/pages/tools/`: Astro ページ (ルーティング)
- `src/utils/`: ロジック・ヘルパー・スタイル定義
- `docs/decisions.md`: 設計上の意思決定記録
- `docs/shared-agent-rules.md`: 本ドキュメント（常時遵守する共通規約）
- `docs/ui-conventions.md`: UI 実装・E2E テストの詳細規約（UI 改修時に参照）
- `docs/agent-lessons.md`: 教訓バッファ（共通ルール化前の蓄積場所）
- `tasks/active_context.md`: セッション固有の作業コンテキスト（gitignore 対象）

---

## 10. コード規約・編集時の安全規則

### 10.1 React / TypeScript 記法

- JSX / TSX では `class` ではなく **`className`** を使う。
- `<label>` の `for` 属性は **`htmlFor`** を使う。
- TypeScript の警告は自分で発見・修正する。ユーザーに指摘させない。

### 10.2 セキュリティ設定変更の禁止

セキュリティ関連の設定（`.npmrc`・`npm audit` 設定・CI 設定・`.githooks/*` 等）は、**ユーザーの明示的な承認なしに変更・無効化してはならない**。

### 10.3 部分置換時のインポート保護・末尾空白

- 部分編集前にファイル全体（特に import）を確認。3 箇所以上の変更や import 追加を伴う場合はファイル全体を書き直す。
- ファイル末尾の空白（trailing whitespace）を含めない。

### 10.4 変更直後の型チェック

コード（特に import / JSX）を編集した直後に必ず実行する:

```bash
node_modules/.bin/astro check       # 全体
npx astro check --filter <file>     # 特定ファイル（Gemini CLI 等）
```

### 10.5 SVG / `dangerouslySetInnerHTML` の XSS 対策

外部入力をそのまま挿入すると **反射型 XSS** になる。必ずエスケープ／サニタイズしてから挿入し、可能なら React 要素として組み立てる。

---

## 11. 目的の維持とスコープ管理 (ATC運用)

実装中の脱線・スコープ外修正を防ぐため、すべての AI エージェントは **Active Task Context (ATC)** を運用する。

### 運用手順

1. **セッション開始**: `tasks/active_context.md`（gitignore 対象）を作成し「目的・ステップ・スコープ外」を宣言。
2. **作業中**: 節目ごとに参照し立ち位置を確認。完了したらチェックボックス更新。
3. **誘惑の管理**: スコープ外を見つけたら直接修正せず `## Pending` セクションにメモ。
4. **レビュー対応**: 指摘は `## 🟢 Review & Feedback` セクションで管理。
5. **完了時**: PR マージ／クローズ後にローカルから削除。教訓は `docs/agent-lessons.md` へ転記。

### ATC 不要と判断できるケース

他のスキル・ツールが「目的・ステップ・スコープ外」を **明示的に** 含むファイルを作成・更新しており、セッション中に参照可能であれば、ATC を重複作成しなくてよい。
該当例: `docs/superpowers/plans/*.md`, `docs/superpowers/specs/*.md`, `conductor/` 配下のタスクファイル。

### ATC のテンプレート

```markdown
# Active Task Context

## 🎯 Objective

[このセッションで達成する最終ゴールを 1 文]

## 🛠️ Current Steps

- [ ] ステップ1

## 🚫 Out of Scope (Do Not Touch)

- [ ] 触らない領域

## 🟢 Review & Feedback

- (指摘事項をここに)

## 📝 Pending (Next Tasks / Improvements)

- (スコープ外の発見をここに)
```

---

## 12. 教訓の運用 (`docs/agent-lessons.md`)

`docs/agent-lessons.md` は教訓を一時蓄積する **バッファ**。本ドキュメントが共通ルールの単一の真実源（Single Source of Truth）であり、再発防止に値する内容は本ドキュメントへ昇格させる。

- **記録**: 修正を受けた／気づきがあった場合に日付付きで追記。
- **読み込み**: セッション開始時の必読ではない（PR 作成前や蓄積が増えた節目で見直す）。
- **昇格 → 削除**: 開発全体に適用される規約は本ドキュメントへ追記し、`agent-lessons.md` から削除（過去内容は git 履歴で遡れる）。
- **削除対象**: 共通ルール化済み／コード・Hook・設定で強制済み／一度限りの TIP。
- **保持対象**: 特定ツール・コンポーネントに紐づく実装メモやリスク。
