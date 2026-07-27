# CLAUDE.md

このファイルは、リポジトリ内のコードを扱う際に Claude Code (claude.ai/code) へ指示を提供します。

@.agents/rules/common.md
@.agents/rules/ui-conventions.md
@.claude/rules/git-and-fs.md
@.claude/rules/github-web-session.md

---

## Claude 固有の運用ルール

Claude Code 固有の補足は `.claude/rules/` 配下に分割し、上記 `@import` で読み込んでいます。

- `.claude/rules/git-and-fs.md`: 一時ファイル / sandbox 制約 / git 操作
- `.claude/rules/github-web-session.md`: web セッションの GitHub 連携トークン制約（`workflow_dispatch` 不可等）

（注: 上記は Claude 固有。Codex は `.codex/rules/`、Gemini CLI は `docs/setup/gemini-policy.md` を参照）

### 前提モデル

`.claude/settings.json` で `model: "opus[1m]"` を指定している。`opus` は **現行世代の最新 Opus を指すエイリアス**（`[1m]` は 1M context 版）であり、世代が更新されれば解決先も移動する。

`.agents/rules/common.md` の出力量・委譲判断の規約は、執筆時点の現行世代である Claude Opus 5 の既定挙動（応答と生成ドキュメントが長い / subagent 委譲に積極的）を前提にしている → [Prompting Claude Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5)

**エイリアスの解決先が次世代に移ったら、本節と上記規約の前提を見直すこと**（世代番号を固定した記述は Currency ドリフトの発生源になる）。

---

## 推奨プラグイン

このプロジェクトは以下の Claude Code プラグインを前提に運用しています。`.claude/settings.json` の `enabledPlugins` で宣言済み。

| プラグイン                                     | 用途                                                                  |
| :--------------------------------------------- | :-------------------------------------------------------------------- |
| `context7@claude-plugins-official`             | ライブラリ公式ドキュメントの最新参照（Upstash Context7 MCP 同梱）     |
| `claude-md-management@claude-plugins-official` | `CLAUDE.md` の監査・改善（`claude-md-improver` / `revise-claude-md`） |

**リポジトリで共有するプラグインは必ず `enabledPlugins` に宣言する**。`claude plugin install` はユーザーレベル設定に書き込むため、宣言を忘れると **web セッションでは入らない**（`session-install.sh` は `enabledPlugins` を読んで install するため）。個人的に試すだけのプラグインは宣言しない。

**superpowers / frontend-design はプラグインではなく `npx skills add` でリポジトリ内に vendor 済み**（`.agents/skills/` + `skills-lock.json` 管理）。Web セッションでプラグイン install が効かない問題の回避のため移行した。frontend-design は単一スキルで MCP を同梱しないため skill 化できる（context7 は MCP server 同梱のためプラグインのまま）。出典・ライセンスは `.agents/skills/README.md` を参照。

CLI / Desktop は `.claude/settings.json` から自動 install を prompt します。**Web (claude.ai/code) は trust dialog 非発火で silent skip される既知制約**があるため、SessionStart hook（`.claude/scripts/session-install.sh`）が web セッションで自動 install します（新規コンテナの初回セッションのみ未反映、同一環境の次セッション以降で有効）。

セットアップ手順・トラブルシュート・context7 API キー設定 → **`docs/setup/plugins.md`**

---

## Agent Teams (Claude Code 固有機能)

このプロジェクトでは **Claude Code の Agent Teams 機能**（実験的）を有効化しています。subagent と違い、teammate 同士が直接メッセージを交換し共有タスクリストを self-claim します。

- `.claude/settings.json` に `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` と `teammateMode: "tmux"` を設定済み。
- `teammateMode` の既定値は **v2.1.179 で `"auto"` → `"in-process"` に変更**された。本リポジトリが明示している `"tmux"` は split-pane モードで、**tmux または iTerm2 (`it2` CLI) が必須**。**VS Code 統合ターミナル / Windows Terminal / Ghostty では非対応**なので、それらで使う場合は `"in-process"` を選ぶ。
- `TeamCreate` / `TeamDelete` ツールは廃止済みで、team 作成・命名の事前ステップは不要（セッション終了時に自動クリーンアップ）。Agent tool の `team_name` 入力は受理されるが無視される。

**使う場面**（並列探索が実際に価値を生むもの）:

- research / review: 複数 teammate が別観点で同時に調査し、互いの結論を突き合わせる
- 競合仮説のデバッグ: 各 teammate が別仮説を検証して収束させる
- 独立した新規モジュール追加 / レイヤーを跨ぐ変更（担当ファイルが重複しない場合）

**使わない場面**:

- **逐次的なタスク・同一ファイルを編集する作業・依存関係が多い作業** → 単一セッションか subagent の方が効果的。2 人が同じファイルを編集すると上書きになる
- 親が数ツールコールで完結できる規模の作業（`.agents/rules/common.md` 6.9 節の委譲判断と同じ基準）

**Agent teams は単一セッションより著しく多くトークンを消費する**（teammate ごとに独立した context window を持つため線形に増える）。初手は 3〜5 teammate、実装並列より research / review から始めるのが公式推奨。

詳細 → [Agent teams](https://code.claude.com/docs/en/agent-teams)
