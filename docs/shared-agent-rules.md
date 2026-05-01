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

**E2E テストは実装と同時に書く**: バグ修正・UI 挙動の変更時はコミット前に該当ケースの E2E を追加する。後回し禁止。

### 3.1 サブエージェントの検証範囲

サブエージェント（worktree 内で動作するエージェント）は以下のルールに従う。

- **E2E テストコードの追加は義務**: バグ修正・UI 挙動変更時は E2E テストコードを必ず追加する（11 章の原則と同じ）。
- **`npm run test:e2e` の実行は禁止**: worktree 並列環境ではポート 4321 が競合して誤報告が頻発する。また sandbox 制約でサーバー起動ができないケースがある。E2E の実行は親（司令塔）が代行する。
- **完了報告には「E2E 実行は親が代行する」と明記すること。**
- 検証範囲は `npm run test`（ユニット）と `node_modules/.bin/astro check`（型）まで。

#### push 前必須チェックリスト（サブエージェント）

以下をすべて満たしてから完了報告する。**1 つでも未完了の場合は push せず、未完了の項目を完了報告に明記して親に判断を仰ぐ**。

| #   | チェック項目          | コマンド                                                                      |
| --- | --------------------- | ----------------------------------------------------------------------------- |
| 1   | develop ベース確認    | `git rev-parse origin/develop` と `git merge-base HEAD origin/develop` が一致 |
| 2   | ユニットテスト全 pass | `npm run test`                                                                |
| 3   | 型チェック            | `node_modules/.bin/astro check`（0 errors）                                   |
| 4   | E2E テスト            | **実行禁止**（テストコード追加は義務。実行は親が代行）                        |

### 3.2 親（司令塔）による E2E 代行実行

> サブエージェントが dev server を残置している場合は、親側で kill する前に停止依頼すること（`npm run dev` のプロセスを終了するよう完了報告時に明記させる）。

サブエージェントの完了報告を受けて push する前後に、親が以下を実施する。

1. 既存の dev server を kill する:
   ```bash
   lsof -ti:4321 | xargs kill -9 2>/dev/null || true
   ```
2. worktree 内で E2E を実行する（全体または影響範囲を絞って）:
   ```bash
   npm run test:e2e
   # または影響範囲を絞る場合（npm run test:e2e -- <spec> でも同様）
   npx playwright test <spec> --project chromium
   ```
3. **複数 worktree がある場合は同時実行しない**（ポート競合を避けるため）。1 つの worktree が完了してから次へ。
4. 失敗パターンの判定:
   - **テスト本来の失敗**（assertion error、要素が見つからない等）→ サブエージェントに修正依頼
   - **環境由来の失敗**（`waitForReactHydration` timeout、`Error: connect ECONNREFUSED 127.0.0.1:4321`、`Timed out waiting for server to start`、`webServer was not ready` 等）→ 上記 1〜2 を 1 回だけ再実行
   - 再実行でも環境由来失敗が続く場合 → **CI を最終判断とする**（push して CI 結果を待つ）
5. unit テストは worktree 内で完結するため、サブエージェントの結果をそのまま信頼してよい。

#### push 前必須チェックリスト（親）

サブエージェントの完了報告を受けて push する際は、以下をすべて確認する。

| #   | チェック項目                                                   | コマンド                                                                                                               |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | develop ベース確認                                             | `git rev-parse origin/develop` と `git merge-base HEAD origin/develop` が一致                                          |
| 2   | サブエージェント完了報告の検証（unit / 型 / E2E スキップ理由） | 完了報告に「E2E 実行は親が代行」の明記があることを確認                                                                 |
| 3   | スコープ外差分の確認                                           | `git diff origin/develop --name-only` で想定外ファイルがないか確認。aria-\* 削除行（`git diff` の `-` 行）がないか確認 |
| 4   | E2E 直列実行                                                   | 本節手順 1〜5 を実施                                                                                                   |
| 5   | PR ベース                                                      | `gh pr create --base develop`                                                                                          |

> 関連: issue #193（E2E web-first assertions のテスト記述ガイドライン）

> macOS/Linux 前提。Windows/WSL では別手段（`netstat -ano` + `taskkill` 等）が必要。

> ポート 4321 以外を使う場合は `4321` を対象ポートに読み替える。

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

`gh` コマンドで複数行・バックティック（\`）を含む本文を渡すときは、**直接引数に渡さず一時ファイル経由で投稿すること**。具体的には `-F`または`--body-file` オプションを使用する（MCP / API 経由は不要）。失敗時は投稿状況を必ず確認し、重複は削除して整合性を保つ。

### 6.2 ブランチ運用

- **`develop` には直接コミットしない**: 必ず feature ブランチを切る。誤って始めた場合は `git stash` → ブランチ切替 → `git stash pop`。
- **新規作業の手順**: `git checkout develop` → `git pull origin develop` → `git checkout -b <type>/<slug>`（例: `feat/add-tool`, `fix/issue-123-crash`）。issue がある場合は `<type>/issue-<n>-<slug>` 形式を推奨（詳細は 6.2a 参照）。

### 6.2a ブランチ作成の完成形コマンドと自己検証

サブエージェントを含むすべての実装担当は、以下のコマンドをそのままコピーして実行すること。

```bash
# ブランチ作成（develop 起点を必ず明示）
git fetch origin develop
git switch -c <type>/issue-<n>-<slug> origin/develop

# 自己検証（ベース確認）— 2 行の出力が一致しなければ作業を止めてリベースする
git rev-parse origin/develop
git merge-base HEAD origin/develop
```

**2 行の出力が一致しない場合は作業を停止**し、以下でリベースしてから再確認する:

```bash
# `merge-base` が `origin/develop` の祖先（典型的には `main` 起点で worktree が切られたケース）で有効
git rebase --onto origin/develop $(git merge-base HEAD origin/develop) HEAD
```

> **なぜ**: CLI・Web 版を問わず `git checkout -b <branch>` だけでは worktree が `main` を起点にしてしまう既知の問題がある（過去に PR #154, #181 で発生）。ベース確認ステップがない限り発覚しない。

### 6.3 PR 作成時のベースブランチ

`gh pr create` は **`--base develop`** を必ず指定する（デフォルトは `main`）:

```bash
gh pr create --base develop --title "..." --body-file /tmp/pr_body.md
```

### 6.4 先送り（deferral）時は必ず issue 化する

レビュー指摘や作業中に発見した課題を「別 PR で対応」「後で追記する」と判断する場合、**その場で GitHub issue を作成**し、PR コメントに issue 番号を明記する。

- ❌ 禁止: 「別 PR でメモ追記します（本 PR スコープ外）」だけで終わらせる
- ✅ 必須: `gh issue create` または MCP の `issue_write` で issue を起票し、`#<番号>` を PR の返信に貼る
- 1 行のドキュメント追記など本 PR で完結できる軽微な対応は、先送りせず本 PR に含めるのが優先。
- スコープ判断で本当に分離が必要な場合のみ issue 化する。issue 化しない口頭の「後で」は形骸化するため禁止。

### 6.5 再利用候補スクリプトの提案

3 行以上の bash・過去にも書いた覚えのある手順・覚えにくいフラグを伴う複合コマンドを書こうとしたら、その場で実行する前に `scripts/` への切り出しをユーザーに提案する（同意を得てからスクリプト化する。先回りして勝手に作らない）。

### 6.6 settings.json permissions に整合した振る舞い

`.claude/settings.json` で allow されている経路を優先し、ask に該当する経路を避けて権限プロンプトと待ち時間を減らす。

- **一時ファイル**: `/tmp/` 直下ではなく `$TMPDIR` または `/tmp/claude/` 配下に作成する（`Write(/tmp/claude/**)` は allow、`Write(/tmp/**)` は ask）。`gh pr create --body-file` のパス、一時スクリプト、ログ出力等すべて。
- **PR コメント取得**: `gh api repos/.../pulls/<N>/comments` ではなく `gh pr view <PR> --comments`（必要なら `--json comments,reviews`）を使う。`Bash(gh pr view*)` は allow、`Bash(gh api *)` は ask。行単位のレビューコメントが本当に必要な場合のみユーザーに断ってから `gh api` を使う。

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

### 10.6 a11y 属性・role 属性の保護

`aria-*` 属性（`aria-live`, `aria-expanded`, `aria-controls`, `aria-label`, `aria-hidden` 等）および
`role=` 属性は、**明示的に許可されていない限り削除してはならない**。

- ❌ 禁止: refactor・cleanup 中に「不要に見える」として aria 属性を削除する
- ✅ 必須: `git diff` に `aria-` の削除行（`-` で始まる行）が含まれる場合は親に確認を取る
- 誤って削除した場合は即 `git restore <file>` してから push する

> **なぜ**: これらの属性は支援技術（スクリーンリーダー等）が依存する意味論的マーカー。見た目上は「余計な属性」に見えても削除すると a11y E2E テストが CI で落ちる（過去に PR #175 追加分が PR #179 の refactor で削除されて発生）。

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

- [ ] このセッションの Objective に書かれていないファイル一切
- [ ] aria-\* / role= 属性の削除（明示的な許可なしには禁止）
- [ ] issue 本文に記載のない機能追加・設計変更
<!-- 具体例を追記: 例) src/components/ui/OutputField.tsx の a11y 属性 -->

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
