# CLAUDE.md

このファイルは、リポジトリ内のコードを扱う際に Claude Code (claude.ai/code) へ指示を提供します。

@.agents/rules/common.md
@.agents/rules/ui-conventions.md
@.claude/rules/git-and-fs.md
@.claude/rules/github-web-session.md

---

## Claude 固有の運用ルール

Claude Code 固有の補足は `.claude/rules/` に分割し、上記 `@import` で読み込んでいる（Codex は `.codex/rules/`、Gemini CLI は `docs/setup/gemini-policy.md`）。

### 実装後の Codex レビュー

コード変更を伴う作業は、PR 作成前に `codex review --base origin/develop -c model="gpt-6-astra" -c model_reasoning_effort="high"` を**単独で**実行する（`cd` 前置・パイプ・リダイレクトを付けると `sandbox.excludedCommands` に一致せず起動に失敗する）。指摘は `receiving-code-review` skill の基準で精査して対応してから PR を作る。docs のみの変更は対象外。`.agents/rules/common.md` 6.9 節の reviewer subagent はこれで置き換える。

### 前提モデル

`.claude/settings.json` の `model: "opus[1m]"` は現行世代の最新 Opus を指すエイリアス。`.agents/rules/common.md` の出力量（1.1 節）・委譲判断（6.9 節）の規約は、執筆時点の Claude Opus 5 の既定挙動（出力が長い / subagent 委譲に積極的）を前提にしている。**解決先が次世代に移ったら、これらの前提を見直す**。

---

## プラグイン / vendor skill

- リポジトリで共有するプラグインは **必ず `.claude/settings.json` の `enabledPlugins` に宣言する**（`context7` / `claude-md-management`）。`claude plugin install` はユーザーレベル設定に書くため、宣言しないと web セッションでは入らない（`.claude/scripts/session-install.sh` が `enabledPlugins` を読んで install する）。
- superpowers / frontend-design はプラグインではなく `.agents/skills/` に vendor 済み（`skills-lock.json` 管理、出典は `.agents/skills/README.md`）。
- セットアップ・トラブルシュート → `docs/setup/plugins.md`

---

## Agent Teams

`.claude/settings.json` で Agent Teams（実験的機能）を有効化し、`teammateMode: "tmux"` を指定している。tmux / iTerm2 以外（VS Code 統合ターミナル等）で使う場合は `"in-process"` にする。

- **使う**: 複数観点の research / review、競合仮説のデバッグ、担当ファイルが重複しない独立モジュールの並列実装
- **使わない**: 逐次的なタスク・同一ファイルを編集する作業（上書きになる）・親が数ツールコールで完結する規模の作業
- teammate ごとに context を持つためトークン消費が大きい。初手は 3〜5 teammate、実装より research / review から始める

詳細 → [Agent teams](https://code.claude.com/docs/en/agent-teams)
