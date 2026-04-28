# CLAUDE.md

このファイルは、リポジトリ内のコードを扱う際に Claude Code (claude.ai/code) へ指示を提供します。
**作業を開始する前に、必ず `docs/shared-agent-rules.md` に記載されたプロジェクト共通の開発規約を確認し、遵守してください。**

---

## 🚀 最重要ルール（要約）

詳細は `docs/shared-agent-rules.md` を参照すること:

- **言語**: コミットメッセージ・PR 説明文は **必ず日本語**。
- **スタイリング**: Tailwind カラークラスは禁止。**`colors.*` (React)** または **`var(--color-*)` (Astro)** を使用。
- **検証**: 変更後は **`npm run test`** および **`npm run test:e2e`** で確認。
- **ATC運用**: セッション開始時に `tasks/active_context.md` を作成（superpowers の plan / conductor のタスクファイル等が「目的・ステップ・スコープ外」を明示する場合は不要。詳細は `docs/shared-agent-rules.md` 11章）。

---

## Agent Teams (Claude Code 固有機能)

このプロジェクトでは **Claude Code の Agent Teams 機能**（実験的）を有効化しています。

- `.claude/settings.json` に `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` と `teammateMode: "tmux"` を設定済み。
- 複数の Claude エージェントが tmux セッション上で協調して作業できます。
- **活用する場面**:
  - 独立した複数タスクを並列に進める場合
  - レビュー担当・実装担当を分けたい場合
  - 長大な実装を複数エージェントで分担する場合
