# CLAUDE.md

このファイルは、リポジトリ内のコードを扱う際に Claude Code (claude.ai/code) へ指示を提供します。
**作業を開始する前に、必ず `docs/shared-agent-rules.md` に記載されたプロジェクト共通の開発規約を確認し、遵守してください。**

---

## 🚀 最重要ルール（要約）

詳細は `docs/shared-agent-rules.md` を参照すること:

- **言語**: コミットメッセージ・PR 説明文は **必ず日本語**。
- **スタイリング**: Tailwind カラークラスは禁止。**`colors.*` (React)** または **`var(--color-*)` (Astro)** を使用。
- **検証**: 変更後は **`npm run test`** および **`npm run test:e2e`** で確認。
- **PR ベース**: `gh pr create` は **必ず `--base develop`** を明示する。`main` 向けはリリース PR のみ（`gh` のデフォルト・Claude Code system prompt の "Main branch ... main" 表示に流されないこと）。詳細は `docs/shared-agent-rules.md` 6.3 章。
- **ATC運用**: セッション開始時に `tasks/active_context.md` を作成（superpowers の plan / conductor のタスクファイル等が「目的・ステップ・スコープ外」を明示する場合は不要。詳細は `docs/shared-agent-rules.md` 11章）。
- **司令塔モード**: 親 Claude Code セッションは実装・テスト実行をサブエージェントに委譲し、自身はフロー制御・ベース確認・完了評価・最終報告に専念する（詳細: `docs/shared-agent-rules.md` 6.2a 章・3 章チェックリスト）。
- **サブエージェント完了受け取り時**: `git merge-base HEAD origin/develop` でベース確認 → テスト結果を読んで未実行項目がないか確認 → `git diff origin/develop...HEAD | grep "^-.*aria-"` でスコープ外削除がないかを確認してから PR 作成。

---

## 推奨プラグイン

このプロジェクトは以下の Claude Code プラグインを前提に運用しています。`.claude/settings.json` の `enabledPlugins` で宣言済み。

| プラグイン                                | 用途                                                              |
| :---------------------------------------- | :---------------------------------------------------------------- |
| `superpowers@claude-plugins-official`     | 設計・計画・実装支援スキル群（writing-plans, debugging, TDD 等）  |
| `frontend-design@claude-plugins-official` | 高品質なフロントエンド UI 生成                                    |
| `context7@claude-plugins-official`        | ライブラリ公式ドキュメントの最新参照（Upstash Context7 MCP 同梱） |

### Claude Code CLI / Desktop

`.claude/settings.json` の `enabledPlugins` を読み取り、初回オープン時に install を自動 prompt します。

### Claude Code Web (claude.ai/code) / IDE 拡張

web / IDE はプロジェクト config から plugin を自動 install しません。各環境で手動実行してください:

```
/plugin install superpowers@claude-plugins-official
/plugin install frontend-design@claude-plugins-official
/plugin install context7@claude-plugins-official
```

## Agent Teams (Claude Code 固有機能)

このプロジェクトでは **Claude Code の Agent Teams 機能**（実験的）を有効化しています。

- `.claude/settings.json` に `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` と `teammateMode: "tmux"` を設定済み。
- 複数の Claude エージェントが tmux セッション上で協調して作業できます。
- **活用する場面**:
  - 独立した複数タスクを並列に進める場合
  - レビュー担当・実装担当を分けたい場合
  - 長大な実装を複数エージェントで分担する場合
