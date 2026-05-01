# CLAUDE.md

このファイルは、リポジトリ内のコードを扱う際に Claude Code (claude.ai/code) へ指示を提供します。
**作業を開始する前に、必ず `docs/shared-agent-rules.md` に記載されたプロジェクト共通の開発規約を確認し、遵守してください。**

---

## 🚀 最重要ルール（要約）

詳細は `docs/shared-agent-rules.md` を参照すること:

- **言語**: コミットメッセージ・PR 説明文は **必ず日本語**。
- **スタイリング**: Tailwind カラークラスは禁止。**`colors.*` (React)** または **`var(--color-*)` (Astro)** を使用。
- **検証**: サブエージェントは **`npm run test`**（ユニット）と `astro check`（型）まで。**`npm run test:e2e` は親が代行**（詳細: `docs/shared-agent-rules.md` 3.1 / 3.2）。
- **PR ベース**: `gh pr create` は **必ず `--base develop`** を明示する。`main` 向けはリリース PR のみ（`gh` のデフォルト・Claude Code system prompt の "Main branch ... main" 表示に流されないこと）。詳細は `docs/shared-agent-rules.md` 6.3 章。
- **ATC運用**: セッション開始時に `tasks/active_context.md` を作成（superpowers の plan / conductor のタスクファイル等が「目的・ステップ・スコープ外」を明示する場合は不要。詳細は `docs/shared-agent-rules.md` 11章）。
- **司令塔モード**: 親 Claude セッションは委譲・ベース確認・テスト確認・aria 削除検出を経て PR 作成（詳細: `docs/shared-agent-rules.md` 6.2a 章・3 章 push 前チェックリスト・10.6 章）。

---

## 推奨プラグイン

このプロジェクトは以下の Claude Code プラグインを前提に運用しています。`.claude/settings.json` の `enabledPlugins` で宣言済み。

| プラグイン                                | 用途                                                                                 |
| :---------------------------------------- | :----------------------------------------------------------------------------------- |
| `superpowers@claude-plugins-official`     | 設計・計画・実装支援スキル群（writing-plans, debugging, TDD 等）                     |
| `frontend-design@claude-plugins-official` | 高品質なフロントエンド UI 生成                                                       |
| `context7@claude-plugins-official`        | ライブラリ公式ドキュメントの最新参照（プロジェクトでは `.mcp.json` 経由の npx 起動） |

### Claude Code CLI / Desktop

`.claude/settings.json` の `enabledPlugins` を読み取り、初回オープン時に install を自動 prompt します。

### Claude Code Web (claude.ai/code) / IDE 拡張

公式ドキュメントは「クラウドセッションでも `enabledPlugins` 宣言のプラグインはセッション開始時に install される」と謳っていますが、**実装上は trust dialog イベントに紐づいており、Web / headless / CI ではこのイベントが発火しないため silent に install がスキップされる** Claude Code 本体側の既知制約があります（upstream: [#23737](https://github.com/anthropics/claude-code/issues/23737) / `autoInstallEnabledPlugins` 提案は duplicate でクローズ・未実装、関連 #17832 / #19275）。

回避策として、`.claude/settings.json` の SessionStart hook で `CLAUDE_CODE_REMOTE=true` のときだけ未 install のプラグインを `claude plugin install ... --scope user` で導入する処理を追加しています。Web セッションを起動するだけで自動的に 3 プラグインが install される運用を狙ったものです。

hook が機能しない／何らかの理由で install されなかった場合は、各環境で 1 回だけ手動 install してください:

```
/plugin install superpowers@claude-plugins-official
/plugin install frontend-design@claude-plugins-official
/plugin install context7@claude-plugins-official
```

### context7 の経路（プロジェクトルートの `.mcp.json`）と API キー設定

context7 は **プラグイン同梱の MCP（`mcp.context7.com` 直結）と、プロジェクト `.mcp.json` の npx 起動の二重宣言**になっています。`.mcp.json` 経路は env 注入で API キーを差し替えられる利点があり、プラグイン側に regression が出ても回避経路として使えます。

> ⚠️ **Claude Code Web セッション（claude.ai/code）では現状 context7 が 403 を返します**（issue #191 / decisions [059]）。
>
> 真因は Anthropic クラウドコンテナの egress プロキシで `context7.com` / `mcp.context7.com` が host allowlist に未登録のため（レスポンスヘッダに `x-deny-reason: host_not_allowed`）。**リポジトリ側の `.claude/settings.json` / `.mcp.json` / API キー設定では解消不可**で、Anthropic harness 側対応待ち。CLI / Desktop セッションは影響を受けません。

**Context7 API キー（`ctx7sk-` プレフィックスの secret key）は optional**:

- CLI / Desktop は無認証でも通る
- API キーを設定すると `researchMode: true`（深い検索）が利用可能になる
- Web の 403 は API キーで解消しない（egress 段で遮断されるため）

設定したい場合は `~/.claude/settings.json`（user-scoped、commit されない）の `env` セクションに追加:

```json
{
  "env": {
    "CONTEXT7_API_KEY": "ctx7sk-xxxxxxxxxxxxxxxx"
  }
}
```

`.mcp.json` は `${CONTEXT7_API_KEY:-}` で参照するため、env が空でも parse は通ります。

## Agent Teams (Claude Code 固有機能)

このプロジェクトでは **Claude Code の Agent Teams 機能**（実験的）を有効化しています。

- `.claude/settings.json` に `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` と `teammateMode: "tmux"` を設定済み。
- 複数の Claude エージェントが tmux セッション上で協調して作業できます。
- **活用する場面**:
  - 独立した複数タスクを並列に進める場合
  - レビュー担当・実装担当を分けたい場合
  - 長大な実装を複数エージェントで分担する場合
