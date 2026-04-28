# プロジェクト共通開発規約 (AIエージェント用)

このドキュメントは、このリポジトリで作業するすべての AI エージェント（Claude Code, Gemini CLI 等）が遵守すべき共通の規約を定めたものです。

---

## 1. 言語・出力規約

- **コミットメッセージ・PR 説明文・ユーザー向けテキスト**: **必ず日本語**で書くこと。
- **コミットメッセージ形式**: **Conventional Commits 風**（`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:` 等）必須（`.githooks/commit-msg` で英語はブロック）。例: ✅ `feat: 新しいツールを追加` / ❌ `feat: Add new tool`（英語）
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

## 5. AI エージェント操作・Git ワークフロー

### 5.1 GitHub CLI のエスケープ事故防止

`gh` コマンドで複数行やバックティック（`）を含む本文を渡すときは、**直接引数に渡さず一時ファイル経由で `-F`/`--body-file` を使う\*\*（MCP / API 経由は不要）。失敗時は投稿状況を必ず確認し、重複は削除して整合性を保つ。

### 5.2 ブランチ運用

- **`develop` には直接コミットしない**: 必ず feature ブランチを切る。誤って始めた場合は `git stash` → ブランチ切替 → `git stash pop`。
- **新規作業の手順**: `git checkout develop` → `git pull origin develop` → `git checkout -b feat/<topic>`（または `fix/`, `docs/`, `refactor/` 等）

### 5.3 PR 作成時のベースブランチ

`gh pr create` は **`--base develop`** を必ず指定する（デフォルトは `main`）:

```bash
gh pr create --base develop --title "..." --body-file /tmp/pr_body.md
```

---

## 6. スタイル・UI ルール

### 6.1 カラーシステム (Tailwind 使用制限)

Tailwind のカラークラス（`text-blue-500`, `bg-red-50`, `hover:bg-red-50` 等）は **絶対に使用しない**。色は CSS 変数経由で指定する:

- React (`.tsx`): `src/utils/styles.ts` の `colors.*` をインラインスタイルで使用
- Astro (`.astro`): `var(--color-*)` を `style` 属性または `<style>` ブロックで使用

※ レイアウト用クラス（`flex`, `gap`, `p-*`, `rounded` 等）は使用可。

### 6.2 ホバー時の色変化

`hover:` クラスは禁止。`onMouseEnter` / `onMouseLeave` でインラインスタイルを差し替える:

```tsx
<button
  style={{ background: 'transparent', color: colors.error }}
  onMouseEnter={(e) => (e.currentTarget.style.background = colors.errorBg)}
  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
/>
```

### 6.3 ボタン高さの揃え

横並びでボタン高さを揃えたい場合は **`lineHeight: 1` を明示**（`caption` / `bodyEmphasis` は lineHeight 1.7 のため意図より大きくなる）。

### 6.4 横並び ↔ 縦並びレスポンシブ

切替レイアウトには **`w-full md:flex-1 min-w-0`** をセットで使用（`min-w-0` を忘れると長いコンテンツがはみ出す）。

### 6.5 ToggleGroup のリセット要否

| トグルの種類                                 | リセット | 理由                       |
| :------------------------------------------- | :------- | :------------------------- |
| 操作の種類が変わる（エンコード/デコード等）  | する     | 入力の期待形式が変わる     |
| 同じ操作のサブバリアント（標準/URL-safe 等） | しない   | 出力比較のために保持が便利 |

---

## 7. UI 変更時の目視確認・E2E テスト (Playwright)

### 7.1 PC・スマホ両サイズでの目視確認

UI 変更時は **PC (1280x800)** と **スマホ (390x844)** 両方でスクリーンショットを撮影し以下を確認:

- 入力・出力エリアの上端揃え／スマホ幅で縦並びレイアウトに切替
- ボタンの隠れ・重なりがないか／ラベル行高さの左右揃え
- フォーカスリングの見切れ／タップ領域 ≥ 44x44px

### 7.2 撮影手順（必須）

```
1. caches.delete + localStorage.clear + sessionStorage.clear
2. browser_navigate（キャッシュなし）
3. browser_resize 1280x800 → screenshot
4. browser_resize 390x844 → screenshot
```

### 7.3 ロケーター・アサーション

- `getByRole` / `getByText` / `getByLabel` を使う。`locator('[role="X"]')` のような属性セレクタは禁止。
- DOM 直接操作（`page.evaluate`）より `expect` のオートリトライを優先。

---

## 8. プロジェクト構造

- `src/components/tools/`: ツール本体 (React TSX)
- `src/components/ui/`: 共通UIコンポーネント (`InputField`, `CopyButton` 等)
- `src/hooks/`: 共通フック
- `src/pages/tools/`: Astro ページ (ルーティング)
- `src/utils/`: ロジック・ヘルパー・スタイル定義
- `docs/decisions.md`: 設計上の意思決定記録
- `docs/shared-agent-rules.md`: 本ドキュメント
- `docs/agent-lessons.md`: 教訓バッファ（共通ルール化前の蓄積場所）
- `tasks/active_context.md`: セッション固有の作業コンテキスト（gitignore 対象）

---

## 9. コード編集時の安全規則

### 9.1 部分置換時のインポート保護・末尾空白

- 部分編集前にファイル全体（特に import）を確認。3 箇所以上の変更や import 追加を伴う場合はファイル全体を書き直す。
- ファイル末尾の空白（trailing whitespace）を含めない。

### 9.2 変更直後の型チェック

コード（特に import / JSX）を編集した直後に必ず実行する:

```bash
node_modules/.bin/astro check       # 全体
npx astro check --filter <file>     # 特定ファイル（Gemini CLI 等）
```

### 9.3 SVG / `dangerouslySetInnerHTML` の XSS 対策

外部入力をそのまま挿入すると **反射型 XSS** になる。必ずエスケープ／サニタイズしてから挿入し、可能なら React 要素として組み立てる。

---

## 10. 目的の維持とスコープ管理 (ATC運用)

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

## 11. 教訓の運用 (`docs/agent-lessons.md`)

`docs/agent-lessons.md` は教訓を一時蓄積する **バッファ**。本ドキュメントが共通ルールの SSOT であり、再発防止に値する内容は本ドキュメントへ昇格させる。

- **記録**: 修正を受けた／気づきがあった場合に日付付きで追記。
- **読み込み**: セッション開始時の必読ではない（PR 作成前や蓄積が増えた節目で見直す）。
- **昇格 → 削除**: 開発全体に適用される規約は本ドキュメントへ追記し、`agent-lessons.md` から削除（過去内容は git 履歴で遡れる）。
- **削除対象**: 共通ルール化済み／コード・Hook・設定で強制済み／一度限りの TIP。
- **保持対象**: 特定ツール・コンポーネントに紐づく実装メモやリスク。
