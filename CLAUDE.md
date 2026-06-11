# CLAUDE.md

このファイルは、リポジトリ内のコードを扱う際に Claude Code (claude.ai/code) へ指示を提供します。

@.agents/rules/common.md
@.agents/rules/ui-conventions.md
@.claude/rules/git-and-fs.md

---

## Claude 固有の運用ルール

Claude Code 固有の補足は `.claude/rules/` 配下に分割し、上記 `@import` で読み込んでいます。

- `.claude/rules/git-and-fs.md`: 一時ファイル / sandbox 制約 / git 操作

（注: 上記は Claude 固有。Codex は `.codex/rules/`、Gemini CLI は `docs/setup/gemini-policy.md` を参照）

---

## 推奨プラグイン

このプロジェクトは以下の Claude Code プラグインを前提に運用しています。`.claude/settings.json` の `enabledPlugins` で宣言済み。

| プラグイン                                | 用途                                                              |
| :---------------------------------------- | :---------------------------------------------------------------- |
| `superpowers@claude-plugins-official`     | 設計・計画・実装支援スキル群（writing-plans, debugging, TDD 等）  |
| `frontend-design@claude-plugins-official` | 高品質なフロントエンド UI 生成                                    |
| `context7@claude-plugins-official`        | ライブラリ公式ドキュメントの最新参照（Upstash Context7 MCP 同梱） |

CLI / Desktop は `.claude/settings.json` から自動 install を prompt します。**Web (claude.ai/code) は trust dialog 非発火で silent skip される既知制約**があるため、SessionStart hook（`.claude/scripts/session-install.sh`）が web セッションで自動 install します（新規コンテナの初回セッションのみ未反映、同一環境の次セッション以降で有効）。

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
