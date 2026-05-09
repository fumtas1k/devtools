# CLAUDE.md

このファイルは、リポジトリ内のコードを扱う際に Claude Code (claude.ai/code) へ指示を提供します。
**作業を開始する前に、必ず `docs/shared-agent-rules.md` に記載されたプロジェクト共通の開発規約を確認し、遵守してください。**

---

## 🚀 最重要ルール（要約）

詳細は `docs/shared-agent-rules.md` を参照すること:

- **言語**: コミットメッセージ・PR 説明文は **必ず日本語**。
- **スタイリング**: Tailwind カラークラスは禁止。**`colors.*` (React)** または **`var(--color-*)` (Astro)** を使用。
- **検証**: `npm run test`（ユニット）と `astro check`（型）はサブエージェント / 親共通。**`npm run test:e2e` は push 前に必ず実行**（subagent worktree か親で。内部で build + preview を直列起動。post-PR 代行は不要、CI が最終ゲート）。新規作成 worktree (subagent isolation / 親手動 `git worktree add` 共通) では作成直後に手動 `npm ci` 必須。SessionStart hook は session 開始時のみ fire するため、mid-session 作成 worktree では fire しない。詳細手順 → `docs/playbooks/e2e-validation.md`
- **PR 作成**: 4 点必須 (正本: `docs/playbooks/pr-creation.md` 3〜4 章 / `docs/shared-agent-rules.md` 6.1, 6.3, 9.6 章 — 不一致時は playbook 優先):
  1. **ベース**: `gh pr create --base develop` 明示 (`gh` デフォルトは main / system prompt の "Main branch" 表示に流されない)
  2. **本文**: `--body-file <path>` 経由必須 (`/tmp/claude/pr_body.md` 等、`--body` 直渡しは禁止 — バックティック化け事故防止)
  3. **pre-create check**: develop ベース一致 (`git merge-base` 比較) / スコープ確認 (`git diff origin/develop --name-only`) / aria-\* 削除なし
  4. **言語**: タイトル・本文 必ず日本語
- **ATC 運用**: セッション開始時に `tasks/active_context.md` を作成（superpowers の plan / conductor のタスクファイル等が「目的・ステップ・スコープ外」を明示する場合は不要。詳細は `docs/shared-agent-rules.md` 10 章）。
- **司令塔モード**: 親 Claude セッションは委譲・ベース確認・テスト確認・aria 削除検出を経て PR 作成（詳細: `docs/playbooks/pr-creation.md`・`docs/playbooks/e2e-validation.md`・`docs/shared-agent-rules.md` 9.6 章）。

---

## 推奨プラグイン

このプロジェクトは以下の Claude Code プラグインを前提に運用しています。`.claude/settings.json` の `enabledPlugins` で宣言済み。

| プラグイン                                | 用途                                                              |
| :---------------------------------------- | :---------------------------------------------------------------- |
| `superpowers@claude-plugins-official`     | 設計・計画・実装支援スキル群（writing-plans, debugging, TDD 等）  |
| `frontend-design@claude-plugins-official` | 高品質なフロントエンド UI 生成                                    |
| `context7@claude-plugins-official`        | ライブラリ公式ドキュメントの最新参照（Upstash Context7 MCP 同梱） |

CLI / Desktop は `.claude/settings.json` から自動 install を prompt します。**Web (claude.ai/code) は silent skip される既知制約**があり、各環境で 1 回だけ手動 install が必要です。

セットアップ手順・トラブルシュート・context7 API キー設定 → **`docs/setup/plugins.md`**

---

## Agent Teams (Claude Code 固有機能)

このプロジェクトでは **Claude Code の Agent Teams 機能**（実験的）を有効化しています。

- `.claude/settings.json` に `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` と `teammateMode: "tmux"` を設定済み。
- 複数の Claude エージェントが tmux セッション上で協調して作業できます。
- **活用する場面**:
  - 独立した複数タスクを並列に進める場合
  - レビュー担当・実装担当を分けたい場合
  - 長大な実装を複数エージェントで分担する場合
